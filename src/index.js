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
    logger.log(`${protocol.toUpperCase()} server listening on ${protocol}://localhost:${HTTP_PORT}`);

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
