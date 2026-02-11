/*
 * set-debug.js - Debug mode control tool
 *
 * Written by
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

export const tool = {
  name: "set_debug",
  description: "Enable or disable debug logging for the HTTP server",
  inputSchema: {
    type: "object",
    properties: {
      enabled: {
        type: "boolean",
        description: "True to enable debug logs, false to disable",
      },
    },
    required: ["enabled"],
  },
};

export async function handler(args, httpServer) {
  const { enabled } = args;

  httpServer.setDebug(enabled);

  return {
    status: "updated",
    debug: enabled,
    current: httpServer.getStatus(),
  };
}
