/*
 * http-server.js - HTTP/HTTPS server for AG-UI event communication
 *
 * Written by
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

import http from "http";
import https from "https";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { logger } from "./logger.js";
import { tools } from "./tools/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * HTTP/HTTPS Server for AG-UI protocol events
 */
export class HttpServer {
  constructor(port, useHttps = false, debug = true) {
    this.port = port;
    this.useHttps = useHttps;
    this.debug = debug;
    this.server = null;
    this.clients = new Set();
    this.pendingToolResults = new Map();
    this.eventQueue = [];
    this.emulatorDomain = null; // Domain where the emulator is running
    this.portInUse = false; // Track if port is in use by another instance
    this.externallyShutdown = false; // Track if shutdown came from external command
  }

  /**
   * Generate self-signed certificate for HTTPS
   */
  _generateCertificate(certPath, keyPath) {
    // Try mkcert first (locally-trusted certs), fall back to openssl (self-signed)
    try {
      execSync("mkcert -version", { stdio: "pipe" });
      logger.log("Generating locally-trusted certificate with mkcert...");
      execSync(`mkcert -key-file "${keyPath}" -cert-file "${certPath}" localhost 127.0.0.1 ::1`, { stdio: "pipe" });
      logger.log("Certificate generated successfully (trusted by browser)");
      return;
    } catch (e) {
      // mkcert not available, fall back to openssl
    }

    logger.log("Generating self-signed HTTPS certificate with openssl...");
    logger.log("Tip: Install mkcert for browser-trusted certs: brew install mkcert && mkcert -install");

    try {
      const cmd = `openssl req -x509 -newkey rsa:2048 -nodes -sha256 -subj '/CN=localhost' -keyout "${keyPath}" -out "${certPath}" -days 365`;
      execSync(cmd, { stdio: "pipe" });
      logger.log("Certificate generated (self-signed — browser may not trust it)");
    } catch (error) {
      throw new Error(
        "Failed to generate certificate. Install mkcert (recommended) or OpenSSL:\n" +
        "  mkcert: brew install mkcert && mkcert -install\n" +
        "  macOS: brew install openssl\n" +
        "  Linux: sudo apt-get install openssl\n" +
        "  Windows: https://slproweb.com/products/Win32OpenSSL.html"
      );
    }
  }

  /**
   * Start the HTTP/HTTPS server
   */
  async start() {
    // Log if restarting after external shutdown (informational only)
    if (this.externallyShutdown && this.debug) {
      logger.log("[HTTP] Restarting after external shutdown");
    }

    return new Promise((resolve, reject) => {
      const requestHandler = (req, res) => {
        this._handleRequest(req, res);
      };

      if (this.useHttps) {
        const certPath = path.join(__dirname, "cert.pem");
        const keyPath = path.join(__dirname, "key.pem");

        // Auto-generate certificates if they don't exist
        if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
          try {
            this._generateCertificate(certPath, keyPath);
          } catch (error) {
            reject(error);
            return;
          }
        }

        this.server = https.createServer({
          key: fs.readFileSync(keyPath),
          cert: fs.readFileSync(certPath),
        }, requestHandler);
      } else {
        this.server = http.createServer(requestHandler);
      }

      this.server.listen(this.port, () => {
        // Successfully started - clear flags
        this.portInUse = false;
        this.externallyShutdown = false;
        if (this.debug) {
          logger.log(`[HTTP] Server listening on port ${this.port}`);
        }
        resolve();
      });

      this.server.on("error", (error) => {
        // Handle port already in use gracefully
        if (error.code === "EADDRINUSE") {
          this.portInUse = true;
          this.server = null;
          if (this.debug) {
            logger.log(`[HTTP] Port ${this.port} already in use - server not started`);
          }
          // Resolve instead of reject to keep MCP alive
          resolve();
        } else {
          // Other errors still reject
          reject(error);
        }
      });
    });
  }

  /**
   * Handle incoming HTTP requests
   */
  async _handleRequest(req, res) {
    // Log requests in debug mode, but skip heartbeat to reduce noise
    if (this.debug && req.url !== "/heartbeat") {
      logger.log(`[HTTP] ${req.method} ${req.url}`);
    }

    // Enable CORS with Private Network Access (required for public HTTPS → localhost)
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Private-Network", "true");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === "HEAD" && req.url.startsWith("/events")) {
      // Check if connection is allowed (for single-client mode)
      if (this.clients.size > 0) {
        res.writeHead(409, { "Content-Type": "text/plain" });
        res.end("Another Apple //e Emulator Already Connected");
      } else {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.end();
      }
      return;
    }

    if (req.method === "GET" && req.url.startsWith("/events")) {
      // SSE endpoint for streaming events to frontend
      this._handleEventStream(req, res);
      return;
    }

    if (req.method === "POST" && req.url === "/tool-result") {
      // Receive TOOL_CALL_RESULT from frontend
      await this._handleToolResult(req, res);
      return;
    }

    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    if (req.method === "GET" && req.url === "/heartbeat") {
      // Lightweight heartbeat endpoint for checking if server is running
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(JSON.stringify({ alive: true }));
      return;
    }

    if (req.method === "POST" && req.url === "/call-tool") {
      // Call an MCP tool from the frontend
      await this._handleCallTool(req, res);
      return;
    }

    if (req.method === "POST" && req.url === "/shutdown") {
      // External shutdown command - stops server and prevents restart
      if (this.debug) {
        logger.log("[HTTP] Received external shutdown command");
      }

      // Mark as externally shutdown
      this.externallyShutdown = true;

      // Send response before shutting down
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        status: "shutting_down",
        message: "Server shutting down. Can only be restarted by owning MCP instance."
      }));

      // Stop the server after response is sent (internal=false to preserve externallyShutdown flag)
      setTimeout(async () => {
        await this.stop(false);
        if (this.debug) {
          logger.log("[HTTP] Server stopped by external shutdown");
        }
      }, 100);

      return;
    }

    res.writeHead(404);
    res.end("Not Found");
  }

  /**
   * Handle Server-Sent Events stream
   */
  _handleEventStream(req, res) {
    // Check if a client is already connected (single client mode)
    if (this.clients.size > 0) {
      if (this.debug) {
        logger.log("[HTTP] Rejecting connection - another client already connected");
      }
      res.writeHead(409, { "Content-Type": "text/plain" });
      res.end("Another Apple //e Emulator Already Connected");
      return;
    }

    // Parse domain from query parameter
    const url = new URL(req.url, `http://localhost:${this.port}`);
    const domain = url.searchParams.get("domain");

    if (domain) {
      this.emulatorDomain = domain;
      if (this.debug) {
        logger.log(`[HTTP] SSE client connected from emulator domain: ${domain}`);
      }
    } else {
      if (this.debug) {
        logger.log("[HTTP] SSE client connected (no domain provided)");
      }
    }

    // Set SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });

    // Send initial comment to establish connection
    // This ensures the browser fires the 'onopen' event
    res.write(": connected\n\n");

    // Add client to set
    const client = { req, res, domain };
    this.clients.add(client);

    // Send queued events to new client
    this.eventQueue.forEach((event) => {
      this._writeSSE(res, event);
    });

    // Handle client disconnect
    req.on("close", () => {
      if (this.debug) {
        logger.log("[HTTP] SSE client disconnected");
      }
      this.clients.delete(client);

      // Clear event queue when all clients disconnect
      // This prevents replaying old commands to new sessions
      if (this.clients.size === 0) {
        this.eventQueue = [];
        if (this.debug) {
          logger.log("[HTTP] All clients disconnected, cleared event queue");
        }
      }
    });
  }

  /**
   * Handle tool result from frontend
   */
  async _handleToolResult(req, res) {
    const body = await this._readBody(req);

    if (this.debug) {
      logger.log("[HTTP] Received:", body);
    }

    try {
      const event = JSON.parse(body);

      if (event.type === "TOOL_CALL_RESULT") {
        const { tool_call_id, content } = event;

        if (this.debug) {
          logger.log(`[HTTP] Tool result for ${tool_call_id}:`, content);
        }

        // Resolve pending promise
        const pending = this.pendingToolResults.get(tool_call_id);
        if (pending) {
          pending.resolve(content);
          this.pendingToolResults.delete(tool_call_id);
        }
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));

    } catch (error) {
      if (this.debug) {
        logger.log("[HTTP] Error:", error.message);
      }
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: error.message }));
    }
  }

  /**
   * Handle call tool request from frontend
   */
  async _handleCallTool(req, res) {
    const body = await this._readBody(req);

    if (this.debug) {
      logger.log("[HTTP] Call tool request:", body);
    }

    try {
      const request = JSON.parse(body);
      const { tool: toolName, args = {} } = request;

      if (!toolName) {
        throw new Error("tool parameter is required");
      }

      // Find the tool
      const toolModule = tools.find(t => t.tool.name === toolName);
      if (!toolModule) {
        throw new Error(`Unknown tool: ${toolName}`);
      }

      // Call the tool handler
      const result = await toolModule.handler(args, this);

      if (this.debug) {
        logger.log(`[HTTP] Tool ${toolName} result:`, JSON.stringify(result));
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));

    } catch (error) {
      if (this.debug) {
        logger.log("[HTTP] Error:", error.message);
      }
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: false,
        error: error.message
      }));
    }
  }

  /**
   * Read request body
   */
  _readBody(req) {
    return new Promise((resolve, reject) => {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk.toString();
      });
      req.on("end", () => {
        resolve(body);
      });
      req.on("error", (error) => {
        reject(error);
      });
    });
  }

  /**
   * Send AG-UI event to all connected clients
   */
  async sendEvent(event) {
    if (this.debug) {
      logger.log("[HTTP] Sending event:", JSON.stringify(event));
    }

    // Add to queue (keep last 100 events for reconnecting clients)
    this.eventQueue.push(event);
    if (this.eventQueue.length > 100) {
      this.eventQueue.shift();
    }

    // Send to all connected clients
    this.clients.forEach((client) => {
      this._writeSSE(client.res, event);
    });
  }

  /**
   * Write Server-Sent Event
   */
  _writeSSE(res, event) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  /**
   * Wait for tool result from frontend
   */
  waitForToolResult(toolCallId, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingToolResults.delete(toolCallId);
        reject(new Error("Tool result timeout"));
      }, timeoutMs);

      this.pendingToolResults.set(toolCallId, {
        resolve: (result) => {
          clearTimeout(timeout);
          resolve(result);
        },
        reject,
      });
    });
  }

  /**
   * Stop the HTTP/HTTPS server
   */
  async stop(internal = true) {
    if (this.server) {
      // Close all SSE connections
      this.clients.forEach((client) => {
        client.res.end();
      });
      this.clients.clear();

      return new Promise((resolve) => {
        this.server.close(() => {
          this.server = null;
          // Only clear externallyShutdown flag if this is an internal stop
          // (from the owning MCP instance)
          if (internal && this.externallyShutdown) {
            this.externallyShutdown = false;
            if (this.debug) {
              logger.log("[HTTP] External shutdown flag cleared by owning instance");
            }
          }
          resolve();
        });
      });
    }
  }

  /**
   * Restart the HTTP/HTTPS server
   */
  async restart() {
    await this.stop();
    await this.start();
  }

  /**
   * Change HTTPS mode and restart
   */
  async setHttps(enabled) {
    const wasRunning = this.server !== null;
    if (wasRunning) {
      await this.stop();
    }
    this.useHttps = enabled;
    if (wasRunning) {
      await this.start();
    }
  }

  /**
   * Set debug mode
   */
  setDebug(enabled) {
    this.debug = enabled;
    if (this.debug) {
      logger.log("[HTTP] Debug mode enabled");
    } else {
      logger.log("[HTTP] Debug mode disabled");
    }
  }

  /**
   * Get server status
   */
  getStatus() {
    return {
      running: this.server !== null,
      https: this.useHttps,
      debug: this.debug,
      port: this.port,
      clients: this.clients.size,
      protocol: this.useHttps ? "https" : "http",
      url: `${this.useHttps ? "https" : "http"}://localhost:${this.port}`,
      emulatorDomain: this.emulatorDomain,
      llmsTxtUrl: this.emulatorDomain ? `${this.emulatorDomain}/llms.txt` : null,
      portInUse: this.portInUse,
      externallyShutdown: this.externallyShutdown,
    };
  }

  /**
   * Get the llms.txt URL for the connected emulator
   */
  getLlmsTxtUrl() {
    return this.emulatorDomain ? `${this.emulatorDomain}/llms.txt` : null;
  }

  /**
   * Gracefully disconnect all clients
   */
  disconnectAllClients() {
    if (this.clients.size === 0) {
      if (this.debug) {
        logger.log("[HTTP] No clients to disconnect");
      }
      return { disconnected: 0 };
    }

    const count = this.clients.size;

    // Send disconnect event to all clients before closing
    this.clients.forEach((client) => {
      try {
        // Send a custom disconnect event
        this._writeSSE(client.res, {
          type: "DISCONNECT",
          reason: "Server requested disconnect",
          graceful: true,
        });
        // Close the connection
        client.res.end();
      } catch (error) {
        if (this.debug) {
          logger.log(`[HTTP] Error disconnecting client: ${error.message}`);
        }
      }
    });

    this.clients.clear();
    this.eventQueue = [];
    this.emulatorDomain = null;

    if (this.debug) {
      logger.log(`[HTTP] Gracefully disconnected ${count} client(s)`);
    }

    return { disconnected: count };
  }
}
