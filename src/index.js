#!/usr/bin/env node

/*
 * index.js - Main entry point for Apple II MCP Agent
 *
 * Written by
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

import { McpServer } from "./mcp-server.js";
import { HttpServer } from "./http-server.js";
import { logger } from "./logger.js";

const HTTP_PORT = process.env.PORT || 3033;
const USE_HTTPS = process.env.HTTPS === "true"; // Default false, set HTTPS=true to enable

/**
 * Start both MCP and HTTP servers
 */
async function main() {
  try {
    // Start HTTP/HTTPS server for AG-UI communication
    const httpServer = new HttpServer(HTTP_PORT, USE_HTTPS);
    await httpServer.start();

    // Start MCP server (stdio mode)
    const mcpServer = new McpServer(httpServer);
    await mcpServer.start();

    const protocol = USE_HTTPS ? "https" : "http";
    logger.log("Apple II MCP Agent initialized");

    // Check if HTTP server actually started
    const status = httpServer.getStatus();
    if (status.running) {
      logger.log(`${protocol.toUpperCase()} server listening on ${protocol}://localhost:${HTTP_PORT}`);
    } else if (status.portInUse) {
      logger.log(`Port ${HTTP_PORT} already in use - HTTP server not started`);
      logger.log("Use server_control tool to attempt start again or shutdown_remote_server to stop the other instance");
    } else if (status.externallyShutdown) {
      logger.log("HTTP server cannot start - was externally shutdown");
      logger.log("Restart the MCP instance to enable HTTP server");
    }

  } catch (error) {
    logger.log("Failed to start Apple II MCP Agent:", error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  logger.log("Shutting down...");
  logger.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  logger.log("Shutting down...");
  logger.close();
  process.exit(0);
});

main();
