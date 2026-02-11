/*
 * server-control.js - HTTP server control tool
 *
 * Written by
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

export const tool = {
  name: "server_control",
  description: "Control the AG-UI HTTP/HTTPS server (start, stop, restart)",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["start", "stop", "restart", "status"],
        description: "Action to perform",
      },
    },
    required: ["action"],
  },
};

export async function handler(args, httpServer) {
  const { action } = args;

  switch (action) {
    case "start":
      if (httpServer.getStatus().running) {
        return { status: "already_running", ...httpServer.getStatus() };
      }
      await httpServer.start();
      return { status: "started", ...httpServer.getStatus() };

    case "stop":
      if (!httpServer.getStatus().running) {
        return { status: "already_stopped", ...httpServer.getStatus() };
      }
      await httpServer.stop();
      return { status: "stopped", ...httpServer.getStatus() };

    case "restart":
      await httpServer.restart();
      return { status: "restarted", ...httpServer.getStatus() };

    case "status":
      return httpServer.getStatus();

    default:
      throw new Error(`Unknown action: ${action}`);
  }
}
