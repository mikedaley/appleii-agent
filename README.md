# @appleii/mcp-agent

MCP server for the [Apple //e browser emulator](https://github.com/mikedaley/web-a2e) — control the emulator with AI agents via the AG-UI protocol.

## What It Does

This MCP (Model Context Protocol) server bridges AI agents like Claude with the Apple //e browser emulator. Through natural language, agents can:

- **Manage windows** — show, hide, and focus emulator windows (BASIC editor, CPU debugger, disk drives, etc.)
- **Load disk images** — insert floppy disks and SmartPort hard drive images from the filesystem
- **Write BASIC programs** — read, edit, and load Applesoft BASIC programs into the emulator
- **Assemble code** — write 65C02 assembly, assemble, and load into memory
- **Control the emulator** — power on/off, reset, type text, manage expansion slots
- **Inspect state** — read memory, CPU registers, and emulator status

## Prerequisites

- Node.js 18+
- The [Apple //e emulator](https://github.com/mikedaley/web-a2e) running in your browser

## Installation

### From npm

```bash
npm install -g @appleii/mcp-agent
```

### From source

```bash
git clone https://github.com/mikedaley/appleii-agent.git
cd appleii-agent
npm install
```

## Configuration

Add to your MCP client configuration. For Claude Code, edit `~/.claude/mcp.json`:

### If installed globally

```json
{
  "mcpServers": {
    "appleii-agent": {
      "command": "appleii-agent"
    }
  }
}
```

### If installed from source

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
Load ~/Documents/ProDOS_2_4_2.dsk into drive 1
Write a BASIC program that draws a sine wave
Install the SmartPort card in slot 7
Load ~/Images/Total_Replay.hdv into SmartPort device 1
Turn on the emulator and boot from disk
Save 256 bytes from memory address $0800 to ~/output.bin
```

## Available Tools

### Emulator Control
| Tool | Description |
|------|-------------|
| `emma_command` | Generic command wrapper — routes to all frontend tools |
| `showWindow` | Show and bring a window to front |
| `hideWindow` | Hide a window |
| `focusWindow` | Bring a window to front |

### File Operations
| Tool | Description |
|------|-------------|
| `load_disk_image` | Load a floppy disk image (.dsk, .do, .po, .nib, .woz) |
| `load_smartport_image` | Load a SmartPort hard drive image (.hdv, .po, .2mg) |
| `load_file` | Load any file (binary or text) |
| `save_basic_file` | Save a BASIC program to a .bas file |
| `save_asm_file` | Save assembly source to a .s or .asm file |
| `save_disk_file` | Save binary disk data to a file |

### Server Management
| Tool | Description |
|------|-------------|
| `server_control` | Start, stop, restart, or check server status |
| `set_https` | Toggle HTTPS mode |
| `set_debug` | Toggle debug logging |
| `get_state` | Get current server state |
| `shutdown_remote_server` | Shutdown another MCP server instance on the same port |
| `disconnect_clients` | Gracefully disconnect all connected emulator clients |

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
