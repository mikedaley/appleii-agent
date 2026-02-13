# Port Conflict Handling

## Overview

The Apple II MCP agent now includes graceful port conflict handling that allows multiple MCP instances to coordinate when attempting to use the same HTTP port (default: 3033).

## Key Features

### 1. Graceful Port Conflict Detection

When an MCP instance starts and port 3033 is already in use:
- **The MCP server stays alive** (does not exit)
- HTTP server status is set to `portInUse: true`
- Server reports the conflict via `server_control` status
- User can retry starting the server later

### 2. Remote Shutdown Capability

A new tool `shutdown_remote_server` allows one MCP instance to:
- Send a shutdown command to another instance on the same port
- Stop the remote HTTP server gracefully
- Prevent the remote server from restarting externally

### 3. Ownership Protection

When a server is externally shutdown:
- It cannot be restarted by external commands
- Only the owning MCP instance can restart it
- Or the MCP process must be restarted entirely

## Workflow Example

### Scenario: Two MCP Instances Running

**Instance A** starts first:
```bash
# Instance A starts successfully
MCP Agent initialized
HTTP server listening on http://localhost:3033
```

**Instance B** starts later:
```bash
# Instance B detects port conflict
MCP Agent initialized
Port 3033 already in use - HTTP server not started
Use server_control tool to attempt start again or shutdown_remote_server to stop the other instance
```

### Resolution Steps

**Step 1: Check status on Instance B**
```javascript
// Tool call: server_control
{
  "action": "status"
}

// Response:
{
  "running": false,
  "portInUse": true,
  "port": 3033,
  "message": "Port 3033 is in use. Use shutdown_remote_server to stop the other instance."
}
```

**Step 2: Shutdown Instance A from Instance B**
```javascript
// Tool call: shutdown_remote_server
{
  "port": 3033,
  "useHttps": false
}

// Response:
{
  "success": true,
  "port": 3033,
  "protocol": "http",
  "message": "Remote server on http://localhost:3033 successfully shutdown"
}
```

**Step 3: Start Instance B's server**
```javascript
// Tool call: server_control
{
  "action": "start"
}

// Response:
{
  "status": "started",
  "running": true,
  "port": 3033,
  "portInUse": false
}
```

**Instance A's state after shutdown:**
- HTTP server is stopped
- `externallyShutdown: true`
- Cannot restart via `server_control` tool
- Must restart the MCP process to re-enable

## API Reference

### server_control Tool

Enhanced with port conflict awareness:

**Status Response:**
```json
{
  "running": false,
  "portInUse": true,
  "externallyShutdown": false,
  "port": 3033,
  "protocol": "http",
  "message": "Port 3033 is in use. Use shutdown_remote_server to stop the other instance."
}
```

**Start Response (when port in use):**
```json
{
  "status": "failed_to_start",
  "reason": "port_in_use",
  "message": "Port 3033 is already in use by another instance. Use shutdown_remote_server tool to stop it.",
  "portInUse": true
}
```

**Start Response (when externally shutdown):**
```json
{
  "status": "cannot_start",
  "reason": "externally_shutdown",
  "message": "Server was externally shutdown. Restart the MCP instance to enable.",
  "externallyShutdown": true
}
```

### shutdown_remote_server Tool

**Input Schema:**
```json
{
  "port": 3033,           // Port number (default: 3033)
  "useHttps": false       // Whether remote uses HTTPS (default: false)
}
```

**Success Response:**
```json
{
  "success": true,
  "port": 3033,
  "protocol": "http",
  "message": "Remote server on http://localhost:3033 successfully shutdown",
  "response": {
    "status": "shutting_down",
    "message": "Server shutting down. Can only be restarted by owning MCP instance."
  }
}
```

**Error Response (no server found):**
```json
{
  "success": false,
  "port": 3033,
  "protocol": "http",
  "error": "connection_refused",
  "message": "No server found at http://localhost:3033"
}
```

### get_state Tool

Now includes port conflict information:

```json
{
  "mcp": {
    "name": "appleii-agent",
    "version": "1.0.0",
    "connected": true
  },
  "http": {
    "current": {
      "running": false,
      "portInUse": true,
      "externallyShutdown": false,
      "port": 3033,
      "https": false,
      "debug": true
    },
    "defaults": {
      "https": false,
      "debug": true,
      "port": 3033
    }
  }
}
```

## HTTP Shutdown Endpoint

The HTTP server exposes a new endpoint:

**POST /shutdown**

- Stops the HTTP server gracefully
- Sets `externallyShutdown` flag to prevent restart
- Returns shutdown confirmation
- Server can only be restarted by owning MCP instance

**Request:**
```bash
curl -X POST http://localhost:3033/shutdown
```

**Response:**
```json
{
  "status": "shutting_down",
  "message": "Server shutting down. Can only be restarted by owning MCP instance."
}
```

## State Diagram

```
┌─────────────────────────────────────────────────┐
│ MCP Instance Starts                             │
│ Attempts to bind HTTP server to port 3033      │
└─────────────────┬───────────────────────────────┘
                  │
                  ├─ Port Available ──────────────┐
                  │                               │
                  └─ Port In Use ────────────────┐│
                                                 ││
┌────────────────────────────────────────────┐  ││
│ HTTP Server Running                        │◄─┘│
│ State: running=true, portInUse=false       │   │
└────────────────┬───────────────────────────┘   │
                 │                                │
                 ├─ External Shutdown Received    │
                 │  (from shutdown_remote_server) │
                 ▼                                │
┌────────────────────────────────────────────┐   │
│ HTTP Server Stopped (External)             │   │
│ State: running=false, externallyShutdown=  │   │
│       true, portInUse=false                │   │
│ Cannot restart via tools                   │   │
│ Must restart MCP process                   │   │
└────────────────────────────────────────────┘   │
                                                  │
┌────────────────────────────────────────────┐   │
│ HTTP Server Not Running (Port Conflict)    │◄──┘
│ State: running=false, portInUse=true,      │
│       externallyShutdown=false             │
│ MCP stays alive, can retry start           │
└────────────────┬───────────────────────────┘
                 │
                 ├─ Use shutdown_remote_server
                 │  to stop other instance
                 │
                 └─ Use server_control start
                    to start this instance
```

## Benefits

1. **No MCP Failures**: Port conflicts don't crash the MCP server
2. **Coordination**: Multiple instances can coordinate gracefully
3. **Clear Diagnostics**: Status clearly indicates port conflicts
4. **Safe Handoff**: Shutdown is explicit and controlled
5. **Ownership Protection**: Prevents accidental external restarts

## Use Cases

### Development with Multiple Claude Code Sessions

When working with multiple Claude Code windows:
- Each has its own MCP instance
- They can coordinate on port 3033
- First one to connect owns the port
- Others can take over if needed

### Testing and Development

When developing the MCP server:
- Old instance still running
- New instance detects conflict
- Shutdown old instance remotely
- New instance takes over

### Distributed Agent Scenarios

Multiple agents working on same emulator:
- Agents coordinate via port ownership
- Clean handoffs between agents
- No manual process killing needed
