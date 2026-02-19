/*
 * path-resolver.js - Sandbox path resolution for convenient file access
 *
 * Written by
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import { logger } from "./logger.js";

/**
 * PathResolver - Manages sandbox paths for convenient file access
 *
 * Format: [key]@/path/to/directory
 * Usage: [key]/relative/path/to/file.dsk or /full/path/to/file.dsk
 */
export class PathResolver {
  constructor(configPath = null) {
    // User must specify config location via constructor or APPLEII_AGENT_SANDBOX env var
    const expandTilde = (p) => p.startsWith("~") ? p.replace("~", os.homedir()) : p;

    if (configPath) {
      this.configPath = expandTilde(configPath);
    } else if (process.env.APPLEII_AGENT_SANDBOX) {
      this.configPath = expandTilde(process.env.APPLEII_AGENT_SANDBOX);
    } else {
      // No config specified - sandbox paths will not be available
      this.configPath = null;
    }
    this.sandboxes = new Map();
    this.loadConfig();
  }

  /**
   * Load sandbox paths from config file
   */
  loadConfig() {
    // No config path specified - all file access will be blocked
    if (!this.configPath) {
      logger.log("[PathResolver] No sandbox config specified. All file operations are blocked. Set APPLEII_AGENT_SANDBOX to enable file access.");
      return;
    }

    try {
      // Check if config file exists
      if (!fs.existsSync(this.configPath)) {
        logger.log(`[PathResolver] Sandbox config not found: ${this.configPath}`);
        logger.log(`[PathResolver] Create the file or update APPLEII_AGENT_SANDBOX to point to a valid config.`);
        return;
      }

      // Read and parse config
      const content = fs.readFileSync(this.configPath, "utf8");
      const lines = content.split("\n");

      this.sandboxes.clear();

      for (const line of lines) {
        const trimmed = line.trim();

        // Skip empty lines and comments
        if (!trimmed || trimmed.startsWith("#")) {
          continue;
        }

        // Parse [key]@path format
        const match = trimmed.match(/^\[([a-zA-Z0-9_-]+)\]@(.+)$/);
        if (match) {
          const [, key, pathValue] = match;

          // Expand ~ to home directory
          let resolvedPath = pathValue;
          if (resolvedPath.startsWith("~")) {
            resolvedPath = resolvedPath.replace("~", os.homedir());
          }

          // Convert to absolute path
          if (!path.isAbsolute(resolvedPath)) {
            resolvedPath = path.resolve(resolvedPath);
          }

          this.sandboxes.set(key, resolvedPath);
        }
      }

      if (this.sandboxes.size > 0) {
        logger.log(`[PathResolver] Loaded ${this.sandboxes.size} sandbox paths from ${this.configPath}`);
      } else {
        logger.log(`[PathResolver] No sandbox paths found in ${this.configPath}`);
      }
    } catch (error) {
      logger.log(`[PathResolver] Error loading config: ${error.message}`);
    }
  }

  /**
   * Resolve a path with sandbox syntax [key]/path or regular path.
   * If sandboxes are configured, full paths must fall within a trusted directory.
   *
   * @param {string} pathString - Path to resolve (e.g., "[disks]/game.dsk" or "~/file.txt")
   * @returns {string} Resolved absolute path
   * @throws {Error} If sandbox is unknown, path traversal detected, or path outside trusted directories
   */
  resolve(pathString) {
    if (!pathString) {
      return pathString;
    }

    // Check if path uses sandbox syntax [key]/path
    const sandboxMatch = pathString.match(/^\[([a-zA-Z0-9_-]+)\](.*)$/);

    if (sandboxMatch) {
      const [, key, relativePath] = sandboxMatch;

      // Check if key exists
      if (!this.sandboxes.has(key)) {
        if (this.sandboxes.size === 0) {
          throw new Error(
            this.configPath
              ? `No sandboxes loaded from ${this.configPath}. Check the file has valid [key]@/path entries.`
              : `No sandbox config set. Set APPLEII_AGENT_SANDBOX environment variable and restart the MCP server.`
          );
        }
        const available = [...this.sandboxes.keys()].map(k => `[${k}]`).join(", ");
        throw new Error(`Unknown sandbox path: [${key}]. Available sandboxes: ${available}`);
      }

      const basePath = this.sandboxes.get(key);

      // Remove leading slash from relative path if present
      const cleanRelativePath = relativePath.startsWith("/")
        ? relativePath.slice(1)
        : relativePath;

      // Resolve and normalize the full path
      const resolved = path.normalize(path.join(basePath, cleanRelativePath));

      // Prevent path traversal escaping the sandbox directory
      if (!resolved.startsWith(path.normalize(basePath))) {
        throw new Error(`Path traversal detected: [${key}]${relativePath} escapes its trusted directory.`);
      }

      return resolved;
    }

    // No sandbox syntax - treat as regular full path
    let expandedPath = pathString;
    if (pathString.startsWith("~")) {
      expandedPath = pathString.replace("~", os.homedir());
    }
    const resolved = path.normalize(path.resolve(expandedPath));

    // Full paths must always be within a trusted sandbox directory
    if (!this._isWithinTrustedPath(resolved)) {
      throw new Error(
        `Access denied: "${resolved}" is outside all trusted directories. ` +
        `Use a sandbox path like [key]/file or add a trusted path to ${this.configPath}`
      );
    }

    return resolved;
  }

  /**
   * Check if a resolved absolute path falls within any configured sandbox directory
   */
  _isWithinTrustedPath(absolutePath) {
    for (const trustedPath of this.sandboxes.values()) {
      const normalizedTrusted = path.normalize(trustedPath);
      if (absolutePath === normalizedTrusted || absolutePath.startsWith(normalizedTrusted + path.sep)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get list of available sandbox paths
   */
  getSandboxes() {
    const result = {};
    for (const [key, value] of this.sandboxes.entries()) {
      result[key] = value;
    }
    return result;
  }

  /**
   * Reload config from disk
   */
  reload() {
    this.loadConfig();
  }
}

// Singleton instance
export const pathResolver = new PathResolver();
