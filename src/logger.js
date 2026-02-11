/*
 * logger.js - Dual console/file logger
 *
 * Written by
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class Logger {
  constructor() {
    this.logFile = null;
    this._initLogFile();
  }

  /**
   * Initialize log file with timestamp
   */
  _initLogFile() {
    const logsDir = path.join(__dirname, "..", "logs");

    // Create logs directory if it doesn't exist
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    // Generate timestamp for log filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const logPath = path.join(logsDir, `log-${timestamp}.log`);

    // Open log file for appending
    this.logFile = fs.createWriteStream(logPath, { flags: "a" });

    this.log(`=== Apple II MCP Agent Started at ${new Date().toISOString()} ===`);
  }

  /**
   * Log a message to both console and file
   */
  log(...args) {
    const message = args.map(arg =>
      typeof arg === "object" ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(" ");

    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${message}`;

    // Write to console (using console.error since stdout is used by MCP)
    console.error(message);

    // Write to file
    if (this.logFile) {
      this.logFile.write(logLine + "\n");
    }
  }

  /**
   * Close the log file
   */
  close() {
    if (this.logFile) {
      this.log("=== Apple II MCP Agent Stopped ===");
      this.logFile.end();
      this.logFile = null;
    }
  }
}

// Export singleton instance
export const logger = new Logger();
