/*
 * reload-sandbox.js - Reload sandbox paths config without restarting MCP server
 *
 * Written by
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

import { pathResolver } from "../path-resolver.js";

export const tool = {
  name: "reload_sandbox",
  description: "Reload the sandbox paths configuration from disk without restarting the MCP server. Use this after editing your sandbox.config file to pick up new paths.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
  },
};

export function handler() {
  pathResolver.reload();
  const sandboxes = pathResolver.getSandboxes();
  const keys = Object.keys(sandboxes);

  return {
    success: true,
    config: pathResolver.configPath,
    loaded: keys.length,
    sandboxes: keys.length > 0
      ? sandboxes
      : null,
    message: keys.length > 0
      ? `Loaded ${keys.length} sandbox path(s): ${keys.map(k => `[${k}]`).join(", ")}`
      : "No sandbox paths found in config.",
  };
}
