/*
 * disconnect-clients.js - Disconnect all connected clients
 *
 * Written by
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

export const tool = {
  name: "disconnect_clients",
  description: "Gracefully disconnect all connected Apple //e emulators",
  inputSchema: {
    type: "object",
    properties: {},
  },
};

export function handler(args, httpServer) {
  const result = httpServer.disconnectAllClients();

  return {
    success: true,
    disconnected: result.disconnected,
    message: result.disconnected > 0
      ? `Disconnected ${result.disconnected} emulator(s)`
      : "No emulators were connected",
  };
}
