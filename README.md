# @retrotech71/appleii-agent

MCP server for the [Apple //e browser emulator](https://github.com/mikedaley/web-a2e) — control the emulator with AI agents via the AG-UI protocol.

## What It Does

This MCP (Model Context Protocol) server bridges AI agents like Claude with the Apple //e browser emulator. Through natural language, agents can:

- **Manage windows** — show, hide, and focus emulator windows (BASIC editor, CPU debugger, disk drives, etc.)
- **Load disk images** — insert floppy disks and SmartPort hard drive images from the filesystem
- **Write BASIC programs** — read, edit, and load Applesoft BASIC programs into the emulator
- **Assemble code** — write 65C02 assembly, assemble, and load into memory
- **Control the emulator** — power on/off, reset, type text, manage expansion slots
- **Inspect state** — read memory, CPU registers, and emulator status
- **Capture the screen** — grab the display (or the printed paper) as a viewable image
- **Save from the emulator** — pull BASIC/ASM source, memory, disk images, or files back to disk
- **Drive multiple emulators** — connect several browser tabs at once and route calls per-emulator

## Prerequisites

- Node.js 18+
- The [Apple //e emulator](https://github.com/mikedaley/web-a2e) running in your browser

## Installation

### From npm

```bash
npm install -g @retrotech71/appleii-agent
```

### From source

```bash
git clone https://github.com/mikedaley/appleii-agent.git
cd appleii-agent
npm install
```

## Configuration

### For Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%/Claude/claude_desktop_config.json` (Windows):

**Using npx (Recommended):**

```json
{
  "mcpServers": {
    "appleii-agent": {
      "command": "npx",
      "args": ["-y", "@retrotech71/appleii-agent"]
    }
  }
}
```

**Using bunx:**

```json
{
  "mcpServers": {
    "appleii-agent": {
      "command": "bunx",
      "args": ["-y", "@retrotech71/appleii-agent"]
    }
  }
}
```

**From source:**

```json
{
  "mcpServers": {
    "appleii-agent": {
      "command": "node",
      "args": ["/absolute/path/to/appleii-agent/src/index.js"]
    }
  }
}
```

**With custom sandbox config location:**

```json
{
  "mcpServers": {
    "appleii-agent": {
      "command": "npx",
      "args": ["-y", "@retrotech71/appleii-agent"],
      "env": {
        "APPLEII_AGENT_SANDBOX": "/path/to/custom/sandbox.config"
      }
    }
  }
}
```

### For Claude Code

Edit `~/.claude/mcp.json`:

**Using bunx (Recommended):**

```json
{
  "mcpServers": {
    "appleii-agent": {
      "type": "stdio",
      "command": "bunx",
      "args": ["-y", "@retrotech71/appleii-agent"]
    }
  }
}
```

**From source:**

```json
{
  "mcpServers": {
    "appleii-agent": {
      "command": "node",
      "args": ["/path/to/appleii-agent/src/index.js"]
    }
  }
}
```

## Usage

1. Start the Apple //e emulator in your browser (`npm run dev` in the emulator repo)
2. Open your MCP client (e.g., Claude Code)
3. The MCP server starts automatically when the client connects
4. Click the sparkle icon in the emulator toolbar to verify the connection (yellow = connected)

### Example Prompts

```
Show the CPU debugger window
Load [disks]/ProDOS_2_4_2.dsk into drive 1
Load [zork]/zork1.dsk into drive 2
Write a BASIC program that draws a sine wave
Install the SmartPort card in slot 7
Load [games]/Total_Replay.hdv into SmartPort device 1
Turn on the emulator and boot from disk
Save the BASIC program to [basic]/sinewave.bas
```

You can also use full paths:
```
Load ~/Documents/ProDOS.dsk into drive 1
Save assembly code to ~/code/program.s
```

## Available Tools

### Emulator Control
| Tool | Description |
|------|-------------|
| `emma_command` | Generic command wrapper — delegates to any frontend app tool (e.g. `showWindow`, `hideWindow`, `focusWindow`, BASIC/ASM editing, memory access). Accepts an optional `emulator` param |

> Window management (`showWindow`, `hideWindow`, `focusWindow`) and most in-emulator actions are frontend tools — call them by name through `emma_command`.

### File Operations — Load
| Tool | Description |
|------|-------------|
| `load_disk_image` | Load a floppy disk image (.dsk, .do, .po, .nib, .woz) |
| `load_smartport_image` | Load a SmartPort hard drive image (.hdv, .po, .2mg) |
| `load_file` | Load any file (base64 for binary, plain text for text) |

### File Operations — Capture / Save From Emulator
| Tool | Description |
|------|-------------|
| `get_screenshot` | Capture the screen (or the printed paper via `source: "printer"`) → viewable image |
| `save_to` | Load content from an emulator source and save it to a sandbox path in one step |

`save_to` sources (`from`): `basic-editor`, `asm-editor`, `basic-memory`, `file-explorer`, `disk` (full disk image for a drive), `memory-range`, `screen`, `printer`, `raw`. For `file-explorer`/`disk`, `drive` selects Apple II drive `1` or `2` (default `1`). Defaults to `direct: true` (saves silently, returns metadata only — base64 never sent to the LLM) and `overwrite: false`.

### Multi-Emulator
| Tool | Description |
|------|-------------|
| `list_connections` | List all connected emulators with name, state, and default status |
| `set_default_emulator` | Set which emulator receives calls when no `emulator` param is given |

Tools that talk to the emulator (`emma_command`, `get_screenshot`, `save_to`) accept an optional `emulator` param: a name, `"all"` to broadcast, or omit to use default routing.

### Server Management
| Tool | Description |
|------|-------------|
| `server_control` | Start, stop, restart, or check server status |
| `set_https` | Toggle HTTPS mode |
| `set_debug` | Toggle debug logging |
| `get_state` | Get current server + emulator state |
| `get_version` | Get MCP server version information |
| `reload_sandbox` | Reload sandbox.config without restarting |
| `shutdown_remote_server` | Shutdown another MCP server instance on the same port |
| `disconnect_clients` | Gracefully disconnect all connected emulator clients |

## Sandbox Paths

Sandbox paths provide convenient shortcuts for frequently accessed directories. Instead of typing full paths, you can define sandboxes in a configuration file and use them across all file operations.

### Configuration

1. **Create a sandbox config file** anywhere you like (e.g., `~/sandbox.config`):

```
# Apple //e Agent - Sandbox Paths Configuration
# Format: [key]@/path/to/directory

[disks]@~/Documents/Apple2/Disks
[games]@~/Documents/Apple2/Games
[zork]@~/Games/Zork
[basic]@~/Documents/Apple2/BASIC
[files]@~/Documents/Apple2/Files
```

2. **Set the `APPLEII_AGENT_SANDBOX` environment variable** to point to your config file in your MCP client configuration (see Configuration section above for examples).

### Usage

All file loading/saving tools support both sandbox syntax and full paths:

**With sandbox paths:**
```
Load [disks]/ProDOS.dsk into drive 1
Load [zork]/zork1.dsk into drive 2
Save BASIC program to [basic]/hello.bas
Load [games]/total-replay.hdv into SmartPort device 1
```

**With full paths:**
```
Load ~/Documents/game.dsk into drive 1
Save assembly to ~/code/program.s
```

### Supported Tools

Sandbox paths work with:
- `load_disk_image` - `[disks]/game.dsk`
- `load_smartport_image` - `[games]/hd.hdv`
- `load_file` - `[files]/data.bin`
- `save_to` - `[basic]/program.bas`, `[asm]/code.s`, `[files]/output.bin`

Path traversal (`../`) is blocked, and `save_to` defaults to `overwrite: false`.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3033` | HTTP server port |
| `HTTPS` | `false` | Set to `true` for HTTPS mode |

## How It Works

```
Claude Code ──MCP (stdio)──> MCP Server ──HTTP/SSE──> Browser Emulator
                                  │
                          AG-UI Protocol
                     (event-based, bidirectional)
```

The MCP server communicates with Claude Code over stdio (standard MCP transport) and with the browser emulator over HTTP using Server-Sent Events (AG-UI protocol). Tool calls from the AI agent are forwarded to the emulator frontend, which executes them and returns results.

## HTTPS Mode

For HTTPS support:

```bash
# Generate self-signed certificate
npm run generate-cert

# Start with HTTPS
HTTPS=true npm start
```

Or toggle at runtime via the `set_https` tool.

## Troubleshooting

**MCP server won't connect**
- Ensure Node.js 18+ is installed
- Check that the path in your MCP config is correct
- Restart your MCP client

**Emulator shows disconnected (gray sparkle)**
- Make sure the emulator is running in your browser
- Click the sparkle icon to view connection details
- Check that port 3033 is not in use by another process

**Reclaiming the Apple II Agent port (multiple MCP instances)**
- The MCP server handles port conflicts gracefully and won't fail
- Use `server_control` with action `status` to check if port is in use
- Use `shutdown_remote_server` to reclaim the port by stopping the other instance
- After shutdown, use `server_control` with action `start` to start this instance on the reclaimed port
- Note: A server stopped via `shutdown_remote_server` can only be restarted by its owning MCP instance

**Tools return errors**
- The emulator must be powered on for most tools to work
- SmartPort tools require the SmartPort card to be installed in an expansion slot
- Disk tools validate file formats before loading

## License

MIT
