# Apple //e Agent - MCP Server

MCP server that bridges Claude with the Apple //e browser emulator. Runs dual-mode: MCP protocol over stdio (for Claude Code) and an HTTP/SSE server on port 3033 (AG-UI protocol for browser tabs).

## Project Structure

```
appleii-agent/
├── src/
│   ├── index.js              # Main entry point
│   ├── mcp-server.js         # MCP protocol handler
│   ├── http-server.js        # HTTP/SSE server (AG-UI, multi-emulator registry)
│   ├── logger.js             # File logging
│   ├── path-resolver.js      # Sandbox path resolution
│   ├── version.js            # Version info from package.json
│   └── tools/                # MCP tool implementations
│       ├── index.js          # Tool registry
│       ├── routing-helpers.js # Shared emulator routing (checkResolution, sendAppToolCall)
│       ├── emma-command.js   # Generic AG-UI command wrapper
│       ├── server-control.js
│       ├── set-https.js
│       ├── set-debug.js
│       ├── get-state.js
│       ├── get-version.js
│       ├── reload-sandbox.js
│       ├── disconnect-clients.js
│       ├── shutdown-remote-server.js
│       ├── list-connections.js    # List all connected emulators
│       ├── set-default-emulator.js # Set default routing target
│       ├── load-disk-image.js
│       ├── load-smartport-image.js
│       ├── load-file.js
│       ├── get-screenshot.js  # Capture screen → MCP image content
│       └── save-to.js         # Load from emulator source → save to file
├── build.sh                  # Build and publish script
└── manifest.json             # Desktop Extension manifest
```

## MCP Tools

All tools are in `src/tools/` and registered in `src/tools/index.js`.

### Server / Connection

| Tool | Description |
|------|-------------|
| `server_control` | Start/stop/restart the HTTP server |
| `set_https` | Toggle HTTPS mode |
| `set_debug` | Toggle debug logging |
| `get_state` | Current server + emulator state |
| `get_version` | Agent version info |
| `reload_sandbox` | Reload sandbox.config without restart |
| `disconnect_clients` | Disconnect all SSE clients |
| `shutdown_remote_server` | Stop remote instance on same port |

### Multi-Emulator

| Tool | Description |
|------|-------------|
| `list_connections` | List all connected emulators with name, state, isDefault |
| `set_default_emulator` | Set which emulator receives tool calls by default |

### Generic Command

| Tool | Description |
|------|-------------|
| `emma_command` | Delegate to any frontend app tool via AG-UI. Optional `emulator` param |

### File Operations — Load

| Tool | Description |
|------|-------------|
| `load_disk_image` | Load `.dsk/.do/.po/.nib/.woz` → base64 |
| `load_smartport_image` | Load `.hdv/.po/.2mg` → base64 |
| `load_file` | Load any file → base64 or text |

### File Operations — Save From Emulator

| Tool | Description |
|------|-------------|
| `get_screenshot` | Capture screen → MCP image content (viewable by LLM). Optional `emulator` param |
| `save_to` | Load from emulator source → save to sandbox path. Optional `emulator` param |

`save_to` sources: `basic-editor`, `asm-editor`, `basic-memory`, `file-explorer`, `memory-range`, `screen`, `raw`

**Note:** Window management (`showWindow`, `hideWindow`, `focusWindow`) is handled by the frontend — use `emma_command` with those tool names instead.

## Multi-Emulator Architecture

Multiple browser tabs can connect simultaneously. The HTTP server maintains a registry of connected emulators (`this.emulators: Map<name, EmulatorRecord>`).

### Emulator Record

```javascript
{
  name: string,          // Unique name from pool
  stream: Response,      // SSE response stream (null when disconnected/broken)
  state: "connected" | "disconnected" | "broken",
  connectedAt: Date,
  isDefault: boolean,    // Receives calls when no emulator param specified
  domain: string,        // Browser origin
  disconnectSignal: "intentional" | "unload" | null,  // Set by /disconnect endpoint
  _wasBroken: boolean,   // True if connection was broken before intentional close
}
```

### Routing (`resolveEmulator(emulatorParam)`)

- `"all"` → broadcast to all connected
- `"Name"` → specific emulator (error if not found, prompt if broken)
- omitted + 1 connected → use it
- omitted + multiple → use `isDefault: true` one
- omitted + multiple + no default → `{ noDefault: true }` (caller prompts Claude)

Shared routing helpers in `routing-helpers.js`: `checkResolution()`, `sendAppToolCall()`.

### Disconnect Handling

Three disconnect scenarios detected by the server:

| Signal | Behavior |
|--------|----------|
| `POST /disconnect?type=intentional` then stream close | State → `disconnected`, kept in registry |
| `POST /disconnect?type=unload` (beforeunload beacon) | Removed from registry |
| Stream close with no signal | State → `broken`, kept in registry |

On disconnect, `_handleDisconnected()` applies routing rules:
- Non-default disconnects → notify only (context note queued)
- Default disconnects, 2 total → auto-fallback to remaining, note queued
- Default disconnects, 3+ total → default cleared, note asks Claude to prompt user

Context notes are queued in `this.contextNotes` and consumed via `consumeContextNotes()` for task 08 injection.

## HTTP Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/events` | GET | SSE stream for AG-UI events |
| `/events` | HEAD | Always 200 (multi-connect allowed) |
| `/tool-result` | POST | Frontend returns tool execution result |
| `/disconnect` | POST | Browser signals disconnect intent (`?name=X&type=intentional\|unload`) |
| `/call-tool` | POST | Direct tool call (for `callMCPTool` from browser) |
| `/heartbeat` | GET | Server alive check |
| `/health` | GET | Health check |
| `/emulator-rename` | POST | Rename a connected emulator (`{ oldName, newName }`) |
| `/shutdown` | POST | External shutdown (port reclaim) |

## Sandbox Configuration

All file operations are gated by a sandbox config. Set via `APPLEII_AGENT_SANDBOX` env variable.

**Format** (`~/.appleii/sandbox.config`):
```
# Comment
[key]@/path/to/directory
```

**Usage in tool calls:** `[key]/relative/path/file.dsk`

**Tools that accept sandbox paths:** `load_disk_image`, `load_smartport_image`, `load_file`, `save_to`

Security: path traversal (`../`) blocked. `save_to` defaults to `overwrite: false`.

## Development

### Building and Publishing

```bash
./build.sh
```

Runs `npm install`, packages as Desktop Extension (`.mcpb`), publishes to npm.

### Debugging

- Logs written to `logs/` (gitignored)
- Enable debug mode: `set_debug` tool or `DEBUG=true` env var
- Check state: `get_state` tool

### Adding a New Tool

1. Create `src/tools/my-tool.js` with exported `tool` (schema) and `handler(args, httpServer)`
2. Import and register in `src/tools/index.js`
3. If it makes AG-UI calls, use `routing-helpers.js` for emulator routing
4. If it accesses files, use `pathResolver.resolve(path)` from `../path-resolver.js`
