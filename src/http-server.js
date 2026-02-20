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
 *
 * Maintains a registry of connected emulator instances:
 *   Map<name, EmulatorRecord>
 *
 * EmulatorRecord shape:
 *   {
 *     name: string,           // emulator instance name (single word, alphanumeric)
 *     stream: ServerResponse, // SSE response object
 *     state: "connected" | "broken" | "disconnected",
 *     connectedAt: Date,
 *     isDefault: boolean,
 *     domain: string|null,
 *   }
 */
export class HttpServer {
  constructor(port, useHttps = false, debug = true) {
    this.port = port;
    this.useHttps = useHttps;
    this.debug = debug;
    this.server = null;
    this.emulators = new Map(); // Map<name, EmulatorRecord>
    this.pendingToolResults = new Map();
    this.eventQueue = [];
    this.portInUse = false;
    this.externallyShutdown = false;
    this.skipBrokenOnBroadcast = false; // Session flag: skip broken emulators silently on "all"
    this.contextNotes = []; // Queued context notes for task 08 injection
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
        this.portInUse = false;
        this.externallyShutdown = false;
        if (this.debug) {
          logger.log(`[HTTP] Server listening on port ${this.port}`);
        }
        resolve();
      });

      this.server.on("error", (error) => {
        if (error.code === "EADDRINUSE") {
          this.portInUse = true;
          this.server = null;
          if (this.debug) {
            logger.log(`[HTTP] Port ${this.port} already in use - server not started`);
          }
          resolve();
        } else {
          reject(error);
        }
      });
    });
  }

  /**
   * Handle incoming HTTP requests
   */
  async _handleRequest(req, res) {
    if (this.debug && req.url !== "/heartbeat") {
      logger.log(`[HTTP] ${req.method} ${req.url}`);
    }

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
      // Multiple emulators may connect — always allow
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.end();
      return;
    }

    if (req.method === "GET" && req.url.startsWith("/events")) {
      this._handleEventStream(req, res);
      return;
    }

    if (req.method === "POST" && req.url === "/tool-result") {
      await this._handleToolResult(req, res);
      return;
    }

    if (req.method === "POST" && req.url.startsWith("/disconnect")) {
      this._handleDisconnectSignal(req, res);
      return;
    }

    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    if (req.method === "GET" && req.url === "/heartbeat") {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(JSON.stringify({ alive: true }));
      return;
    }

    if (req.method === "POST" && req.url === "/call-tool") {
      await this._handleCallTool(req, res);
      return;
    }

    if (req.method === "POST" && req.url === "/emulator-rename") {
      await this._handleEmulatorRename(req, res);
      return;
    }

    if (req.method === "POST" && req.url === "/shutdown") {
      if (this.debug) {
        logger.log("[HTTP] Received external shutdown command");
      }

      this.externallyShutdown = true;

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        status: "shutting_down",
        message: "Server shutting down. Can only be restarted by owning MCP instance."
      }));

      setTimeout(async () => {
        // Notify emulators to reconnect before stopping — new MCP instance will be starting
        this.disconnectAllClients({ reconnect: true });
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
   * Validate an emulator name: single word, Unicode letters + hyphens + underscores, no numbers
   * @param {string} name
   * @returns {boolean}
   */
  _isValidName(name) {
    return typeof name === "string" && /^[\p{L}_-]+$/u.test(name);
  }

  /**
   * Handle Server-Sent Events stream — registers a new emulator instance
   */
  _handleEventStream(req, res) {
    const url = new URL(req.url, `http://localhost:${this.port}`);
    const requestedName = url.searchParams.get("name");
    const domain = url.searchParams.get("domain");

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });

    // Validate name format
    if (!this._isValidName(requestedName)) {
      if (this.debug) {
        logger.log(`[HTTP] Rejected connection — invalid name: "${requestedName}"`);
      }
      this._writeSSE(res, { type: "CONNECT_ACK", accepted: false, reason: "invalid_name" });
      res.end();
      return;
    }

    // Reject if name is already taken by an active connection; allow reconnect if disconnected
    if (this.emulators.has(requestedName) && this.emulators.get(requestedName).state === "connected") {
      if (this.debug) {
        logger.log(`[HTTP] Rejected connection — name taken: "${requestedName}"`);
      }
      this._writeSSE(res, { type: "CONNECT_ACK", accepted: false, reason: "name_taken" });
      res.end();
      return;
    }

    // Remove stale disconnected entry so the reconnect gets a fresh record
    if (this.emulators.has(requestedName)) {
      if (this.debug) {
        logger.log(`[HTTP] Clearing stale disconnected entry for "${requestedName}"`);
      }
      this.emulators.delete(requestedName);
    }

    const name = requestedName;

    // Become default only if no current default exists.
    // wasDefault=true yields to an already-set default; only reclaims if the slot is free.
    const wasDefault = url.searchParams.get("wasDefault") === "true";
    const hasDefault = [...this.emulators.values()].some(r => r.isDefault);
    const connectedCount = [...this.emulators.values()].filter(r => r.state === "connected").length;
    const isDefault = !hasDefault && (wasDefault || connectedCount === 0);

    if (this.debug) {
      logger.log(`[HTTP] Emulator connected: ${name}${isDefault ? " (default)" : ""}${domain ? ` from ${domain}` : ""}`);
    }

    // Send acceptance acknowledgement
    this._writeSSE(res, { type: "CONNECT_ACK", accepted: true, name, isDefault });

    // Register emulator instance
    const record = {
      name,
      stream: res,
      state: "connected",
      connectedAt: new Date(),
      isDefault,
      domain: domain || null,
    };

    this.emulators.set(name, record);

    // Send queued events to newly connected emulator
    this.eventQueue.forEach((event) => {
      this._writeSSE(res, event);
    });

    // Handle stream close — branch based on disconnect signal set by /disconnect endpoint
    req.on("close", () => {
      // Use record.name (not the captured original name) — rename updates record.name in place
      // so this closure always sees the current name even after a rename.
      const currentName = record.name;
      if (!this.emulators.has(currentName)) return; // Already removed (e.g. server stop)

      record.stream = null;
      const signal = record.disconnectSignal;

      if (signal === "unload") {
        // Tab closed or page refreshed — remove from registry
        if (this.debug) logger.log(`[HTTP] Emulator tab closed: ${currentName}`);
        this._handleDisconnected(currentName, record);
        this.emulators.delete(currentName);
      } else if (signal === "intentional") {
        // Clean disconnect — keep in registry with state "disconnected"
        if (this.debug) logger.log(`[HTTP] Emulator disconnected cleanly: ${currentName}`);
        record.state = "disconnected";
        this._handleDisconnected(currentName, record);
      } else {
        // No signal — broken connection, keep in registry
        if (this.debug) logger.log(`[HTTP] Emulator connection broken: ${currentName}`);
        record.state = "broken";
        record._wasBroken = true;
        this._handleBroken(currentName, record);
      }

      if (this.emulators.size === 0) {
        this.eventQueue = [];
        if (this.debug) logger.log("[HTTP] All emulators disconnected, cleared event queue");
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

      const toolModule = tools.find(t => t.tool.name === toolName);
      if (!toolModule) {
        throw new Error(`Unknown tool: ${toolName}`);
      }

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
   * Handle /emulator-rename — rename a connected emulator in the registry
   */
  async _handleEmulatorRename(req, res) {
    const body = await this._readBody(req);
    const { oldName, newName } = JSON.parse(body);

    const respond = (payload) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(payload));
    };

    if (!this._isValidName(newName)) {
      return respond({ success: false, reason: "invalid_name" });
    }

    const record = this.emulators.get(oldName);
    if (!record || record.state !== "connected") {
      return respond({ success: false, reason: "not_found" });
    }

    if (this.emulators.has(newName) && this.emulators.get(newName).state === "connected") {
      return respond({ success: false, reason: "name_taken" });
    }

    // Rename: update record and re-key the map
    record.name = newName;
    this.emulators.delete(oldName);
    this.emulators.set(newName, record);

    this._queueNote(`Emulator "${oldName}" has been renamed to "${newName}".`);

    if (this.debug) {
      logger.log(`[HTTP] Emulator renamed: "${oldName}" → "${newName}"`);
    }

    respond({ success: true, name: newName });
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
   * Resolve which emulator(s) to route a tool call to.
   *
   * Returns one of:
   *   { target: EmulatorRecord }                         — single target, proceed
   *   { broadcast: true, targets: [], broken: [] }       — emulator: "all"
   *   { noDefault: true, options: [] }                   — multiple connected, no default → prompt
   *   { brokenTarget: EmulatorRecord, healthy: [] }      — target is broken → prompt
   *   { error: string }                                  — hard error (not found, none connected)
  /**
   * Handle /disconnect POST from browser — marks disconnect intent before stream closes
   */
  _handleDisconnectSignal(req, res) {
    res.writeHead(200);
    res.end();

    const url = new URL(req.url, "http://localhost");
    const name = url.searchParams.get("name");
    const type = url.searchParams.get("type") || "intentional";

    if (!name || !this.emulators.has(name)) return;

    const record = this.emulators.get(name);
    record.disconnectSignal = type;

    if (this.debug) logger.log(`[HTTP] Disconnect signal from "${name}": ${type}`);

    // If stream already closed (was broken), handle routing now
    if (record.state === "broken") {
      this._handleDisconnected(name, record);
      if (type === "unload") {
        this.emulators.delete(name);
      } else {
        record.state = "disconnected";
      }
    }
  }

  /**
   * Apply routing rules when an emulator disconnects or its tab closes.
   * Queues a context note for task 08 to inject.
   */
  _handleDisconnected(name, record) {
    const wasDefault = record.isDefault;
    const wasBroken = record._wasBroken || false;

    record.isDefault = false;

    const remaining = [...this.emulators.values()].filter(
      r => r.name !== name && r.state === "connected"
    );

    if (!wasDefault) {
      // Non-default disconnect is silent — routing unaffected
      return;
    }

    // Was default — apply fallback rules
    if (remaining.length === 0) {
      // Routing will return "No emulators connected" error — no note needed
      return;
    }

    if (remaining.length === 1) {
      // Auto-promotion: routing still works but Claude's mental model is stale — queue note
      remaining[0].isDefault = true;
      const note = wasBroken
        ? `"${name}" had a broken connection and was disconnected. "${remaining[0].name}" is now the default emulator.`
        : `"${name}" disconnected. "${remaining[0].name}" is now the default emulator.`;
      this._queueNote(note);
      return;
    }

    // 2+ remaining — routing will return noDefault error — no note needed
  }

  /**
   * Handle broken connection — routing will return brokenTarget error — no note needed.
   */
  _handleBroken(name, record) {
    // Intentionally silent — the routing error surfaces this when Claude tries to use the emulator
  }

  /**
   * Queue a context note for task 08 injection
   */
  _queueNote(message) {
    this.contextNotes.push({ message, timestamp: new Date() });
    if (this.debug) logger.log(`[HTTP] Context note queued: ${message}`);
  }

  /**
   * Get and clear all queued context notes
   */
  consumeContextNotes() {
    const notes = [...this.contextNotes];
    this.contextNotes = [];
    return notes;
  }

  /**
   * @param {string|undefined} emulatorParam - Value of the `emulator` tool arg
   */
  resolveEmulator(emulatorParam) {
    const all = [...this.emulators.values()];
    const connected = all.filter(r => r.state === "connected");

    // emulator: "all" — broadcast
    if (emulatorParam === "all") {
      const broken = all.filter(r => r.state !== "connected");
      return { broadcast: true, targets: connected, broken };
    }

    // emulator: "<name>" — specific emulator
    if (emulatorParam) {
      const record = this.emulators.get(emulatorParam);
      if (!record) {
        const names = connected.map(r => r.name).join(", ") || "none";
        return { error: `Emulator "${emulatorParam}" not found. Connected: ${names}.` };
      }
      if (record.state !== "connected") {
        const healthy = connected.filter(r => r.name !== emulatorParam);
        return { brokenTarget: record, healthy };
      }
      return { target: record };
    }

    // No emulator param — auto-routing
    if (connected.length === 0) {
      return { error: "No emulators are connected." };
    }

    if (connected.length === 1) {
      return { target: connected[0] };
    }

    // Multiple connected — find default
    const defaultRecord = connected.find(r => r.isDefault);
    if (defaultRecord) {
      return { target: defaultRecord };
    }

    // Multiple connected, no default — prompt
    return { noDefault: true, options: connected };
  }

  /**
   * Send AG-UI event to a single named emulator
   * @param {string} name - Emulator name
   * @param {Object} event - Event to send
   */
  sendEventToEmulator(name, event) {
    const record = this.emulators.get(name);
    if (!record || record.state !== "connected") return;
    if (this.debug) {
      logger.log(`[HTTP] → ${name}:`, JSON.stringify(event));
    }
    this._writeSSE(record.stream, event);
  }

  /**
   * Send AG-UI event to all connected emulators
   */
  async sendEvent(event) {
    if (this.debug) {
      logger.log("[HTTP] Sending event:", JSON.stringify(event));
    }

    this.eventQueue.push(event);
    if (this.eventQueue.length > 100) {
      this.eventQueue.shift();
    }

    this.emulators.forEach((record) => {
      if (record.state === "connected") {
        this._writeSSE(record.stream, event);
      }
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
      this.emulators.forEach((record) => {
        record.stream.end();
      });
      this.emulators.clear();

      return new Promise((resolve) => {
        this.server.close(() => {
          this.server = null;
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
    const emulatorList = [...this.emulators.values()].map((r) => ({
      name: r.name,
      state: r.state,
      isDefault: r.isDefault,
      connectedAt: r.connectedAt,
    }));

    const defaultRecord = [...this.emulators.values()].find((r) => r.isDefault);
    const emulatorDomain = defaultRecord?.domain
      || [...this.emulators.values()][0]?.domain
      || null;

    return {
      running: this.server !== null,
      https: this.useHttps,
      debug: this.debug,
      port: this.port,
      clients: this.emulators.size, // kept for backward compat
      emulators: emulatorList,
      defaultEmulator: defaultRecord?.name || null,
      protocol: this.useHttps ? "https" : "http",
      url: `${this.useHttps ? "https" : "http"}://localhost:${this.port}`,
      emulatorDomain,
      llmsTxtUrl: emulatorDomain ? `${emulatorDomain}/llms.txt` : null,
      portInUse: this.portInUse,
      externallyShutdown: this.externallyShutdown,
    };
  }

  /**
   * Get the llms.txt URL for the connected emulator
   */
  getLlmsTxtUrl() {
    const domain = [...this.emulators.values()].find((r) => r.isDefault)?.domain
      || [...this.emulators.values()][0]?.domain
      || null;
    return domain ? `${domain}/llms.txt` : null;
  }

  /**
   * Gracefully disconnect all emulators
   * @param {Object} options
   * @param {boolean} options.reconnect - If true, emulators should reconnect (e.g. port reclaim)
   */
  disconnectAllClients({ reconnect = false } = {}) {
    const connected = [...this.emulators.values()].filter((r) => r.state === "connected");

    if (connected.length === 0) {
      if (this.debug) {
        logger.log("[HTTP] No emulators to disconnect");
      }
      return { disconnected: 0 };
    }

    const count = connected.length;

    connected.forEach((record) => {
      try {
        this._writeSSE(record.stream, {
          type: "DISCONNECT",
          reason: reconnect ? "port_reclaim" : "Server requested disconnect",
          graceful: true,
          reconnect,
        });
        record.stream.end();
      } catch (error) {
        if (this.debug) {
          logger.log(`[HTTP] Error disconnecting ${record.name}: ${error.message}`);
        }
      }
    });

    this.emulators.clear();
    this.eventQueue = [];

    if (this.debug) {
      logger.log(`[HTTP] Gracefully disconnected ${count} emulator(s)`);
    }

    return { disconnected: count };
  }
}
