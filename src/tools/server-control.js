/*
 * server-control.js - HTTP server control tool
 *
 * Written by
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

export const tool = {
  name: "server_control",
  description: "Control the AG-UI HTTP/HTTPS server (start, stop, restart, status). To reclaim or take over a port when another instance is using it: (1) First call shutdown_remote_server to stop the other instance, then (2) Call this tool with action 'start' to start this instance.",
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
    case "start": {
      const currentStatus = httpServer.getStatus();

      if (currentStatus.running) {
        return { status: "already_running", ...currentStatus };
      }

      await httpServer.start();
      const newStatus = httpServer.getStatus();

      if (newStatus.portInUse) {
        return {
          status: "failed_to_start",
          reason: "port_in_use",
          message: `Port ${newStatus.port} is already in use by another instance. Use shutdown_remote_server tool to stop it.`,
          ...newStatus
        };
      }

      return { status: "started", ...newStatus };
    }

    case "stop": {
      const currentStatus = httpServer.getStatus();
      if (!currentStatus.running) {
        return { status: "already_stopped", ...currentStatus };
      }
      await httpServer.stop();
      return { status: "stopped", ...httpServer.getStatus() };
    }

    case "restart": {
      await httpServer.restart();
      const newStatus = httpServer.getStatus();

      if (newStatus.portInUse) {
        return {
          status: "failed_to_restart",
          reason: "port_in_use",
          message: `Port ${newStatus.port} is already in use by another instance. Use shutdown_remote_server tool to stop it.`,
          ...newStatus
        };
      }

      return { status: "restarted", ...newStatus };
    }

    case "status": {
      const status = httpServer.getStatus();

      // Add helpful messages based on state
      if (status.portInUse && !status.running) {
        status.message = `Port ${status.port} is in use. Use shutdown_remote_server to stop the other instance.`;
      } else if (status.externallyShutdown && !status.running) {
        status.message = "Server was externally shutdown. Use server_control to restart.";
      }

      return status;
    }

    default:
      throw new Error(`Unknown action: ${action}`);
  }
}
