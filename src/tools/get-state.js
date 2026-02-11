/*
 * get-state.js - MCP server state tool
 *
 * Written by
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

export const tool = {
  name: "get_state",
  description: "Get current state of the MCP server and HTTP server",
  inputSchema: {
    type: "object",
    properties: {},
  },
};

export function handler(args, httpServer) {
  const status = httpServer.getStatus();
  return {
    mcp: {
      name: "appleii-agent",
      version: "1.0.0",
      connected: true,
    },
    http: {
      current: status,
      defaults: {
        https: false,
        debug: true,
        port: 3033,
      },
    },
  };
}
