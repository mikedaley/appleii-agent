/*
 * list-emulators.js - List all connected emulators
 *
 * Written by
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

export const tool = {
  name: "list_connections",
  description: "List all connected Apple //e emulators with their name, connection state, and default status.",
  inputSchema: {
    type: "object",
    properties: {},
  },
};

export function handler(args, httpServer) {
  const status = httpServer.getStatus();
  return {
    emulators: status.emulators,
    defaultEmulator: status.defaultEmulator,
  };
}
