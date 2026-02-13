/*
 * shutdown-remote-server.js - Shutdown remote MCP server instance
 *
 * Written by
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

import http from "http";
import https from "https";

export const tool = {
  name: "shutdown_remote_server",
  description: "Shutdown a remote Apple II MCP server instance running on the same port. Use this when port is already in use by another instance. To reclaim or take over a port: (1) Call this tool to shutdown the other instance, then (2) Call server_control with action 'start' to start this instance.",
  inputSchema: {
    type: "object",
    properties: {
      port: {
        type: "number",
        description: "Port number of the remote server (default: 3033)",
        default: 3033,
      },
      useHttps: {
        type: "boolean",
        description: "Whether the remote server is using HTTPS (default: false)",
        default: false,
      },
    },
  },
};

export async function handler(args, httpServer) {
  const port = args.port || 3033;
  const useHttps = args.useHttps || false;
  const protocol = useHttps ? "https" : "http";
  const url = `${protocol}://localhost:${port}/shutdown`;

  return new Promise((resolve, reject) => {
    const requestModule = useHttps ? https : http;

    const options = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      // For self-signed certificates, ignore certificate errors
      rejectUnauthorized: false,
    };

    const req = requestModule.request(url, options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        try {
          const response = JSON.parse(data);
          resolve({
            success: true,
            port,
            protocol,
            message: `Remote server on ${protocol}://localhost:${port} successfully shutdown`,
            response,
          });
        } catch (error) {
          resolve({
            success: true,
            port,
            protocol,
            message: `Remote server on ${protocol}://localhost:${port} shutdown (raw response)`,
            rawResponse: data,
          });
        }
      });
    });

    req.on("error", (error) => {
      // Connection refused or other errors
      if (error.code === "ECONNREFUSED") {
        resolve({
          success: false,
          port,
          protocol,
          error: "connection_refused",
          message: `No server found at ${protocol}://localhost:${port}`,
        });
      } else {
        resolve({
          success: false,
          port,
          protocol,
          error: error.code || "unknown",
          message: `Failed to connect to ${protocol}://localhost:${port}: ${error.message}`,
        });
      }
    });

    req.on("timeout", () => {
      req.destroy();
      resolve({
        success: false,
        port,
        protocol,
        error: "timeout",
        message: `Request to ${protocol}://localhost:${port} timed out`,
      });
    });

    req.setTimeout(5000); // 5 second timeout
    req.end();
  });
}
