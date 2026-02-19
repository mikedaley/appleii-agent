# Apple //e Agent - MCP Server

This is an MCP (Model Context Protocol) server that bridges AI agents like Claude with the Apple //e browser emulator.

## Project Structure

```
appleii-agent/
├── src/
│   ├── index.js           # Main entry point
│   ├── mcp-server.js      # MCP protocol handler
│   ├── http-server.js     # HTTP/SSE server for AG-UI
│   ├── logger.js          # File logging
│   ├── path-resolver.js   # Sandbox path resolution
│   ├── version.js         # Version info from package.json
│   └── tools/             # MCP tool implementations
├── build.sh               # Build and publish script
└── manifest.json          # Desktop Extension manifest
```

## Configuration Files

### `sandbox.config` (User-specified)

This file defines sandbox paths for convenient and secure file operations.

**Location:** User must specify via `APPLEII_AGENT_SANDBOX` environment variable

**Setup:**
1. Create a file anywhere (e.g., `~/sandbox.config`)
2. Set `APPLEII_AGENT_SANDBOX` in your MCP client config

**Format:**
```
# Comment
[key]@/path/to/directory
```

**Example:**
```
# Apple II disk images
[disks]@~/Documents/Apple2/Disks
[games]@~/Documents/Apple2/Games
[zork]@~/Games/Zork

# Development files
[basic]@~/Documents/Apple2/BASIC
[asm]@~/Documents/Apple2/Assembly
[files]@~/Documents/Apple2/Files
```

**Usage in prompts:**
```
Load [disks]/ProDOS.dsk into drive 1
Load [zork]/zork1.dsk into drive 2
Save BASIC program to [basic]/hello.bas
```

**Security Note:**
See `.claude/agents/sandbox.md` for future security sandbox implementation that will restrict file access to only sandboxed directories.

## Development

### Building and Publishing

```bash
./build.sh
```

This script:
1. Runs `npm install`
2. Packages as Desktop Extension (`.mcpb` file)
3. Publishes to npm with public access

### Testing Sandbox Paths

1. Create `sandbox.config` in project root
2. Add test paths:
   ```
   [test]@~/Documents/test
   ```
3. Start MCP server
4. Use sandbox path in file operations:
   ```
   load [test]/file.dsk
   ```

### Debugging

- Logs are written to `logs/` directory (gitignored)
- Enable debug mode with `set_debug` tool or `DEBUG=true` env var
- Check HTTP server status with `get_state` tool

## MCP Tools

All tools are in `src/tools/` and registered in `src/tools/index.js`.

**File operations with sandbox path support:**
- `load_disk_image` - Load `.dsk`, `.do`, `.po`, `.nib`, `.woz`
- `load_smartport_image` - Load `.hdv`, `.po`, `.2mg`
- `load_file` - Load any file (binary or text)
- `save_basic_file` - Save BASIC program
- `save_asm_file` - Save assembly source
- `save_disk_file` - Save binary data

**Server management:**
- `server_control` - Start/stop/restart/status
- `get_state` - Get server state and emulator connection
- `get_version` - Get MCP server version
- `set_https` - Toggle HTTPS mode
- `set_debug` - Toggle debug logging
- `shutdown_remote_server` - Stop remote instance on same port
- `disconnect_clients` - Disconnect emulator clients

**Emulator control:**
- `emma_command` - Generic AG-UI command wrapper
- `showWindow` / `hideWindow` / `focusWindow` - Window management

## Contributing

When adding new file operation tools:
1. Import `pathResolver` from `../path-resolver.js`
2. Use `pathResolver.resolve(filePath)` to resolve paths
3. This automatically supports both `[sandbox]/path` and full paths
4. Update tool description to mention sandbox path support
