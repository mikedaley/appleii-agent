/*
 * get-version.js - Get MCP server version information
 *
 * Written by
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

import { VERSION, NAME, DESCRIPTION } from "../version.js";

export const tool = {
  name: "get_version",
  description: "Get the Apple II MCP Agent version information",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
  },
};

export function handler() {
  return {
    success: true,
    name: NAME,
    version: VERSION,
    description: DESCRIPTION,
  };
}
