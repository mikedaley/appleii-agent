/*
 * mcp-server.js - MCP protocol server implementation
 *
 * Written by
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { tools } from "./tools/index.js";

/**
 * MCP Server for Apple //e emulator agent
 */
export class McpServer {
  constructor(httpServer) {
    this.httpServer = httpServer;
    this.server = new Server(
      {
        name: "appleii-agent",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this._setupHandlers();
  }

  /**
   * Register MCP request handlers
   */
  _setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: tools.map(t => t.tool),
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        // Find the tool
        const toolModule = tools.find(t => t.tool.name === name);
        if (!toolModule) {
          throw new Error(`Unknown tool: ${name}`);
        }

        // Call the handler
        const result = await toolModule.handler(args, this.httpServer);

        return {
          content: [
            {
              type: "text",
              text: typeof result === "string" ? result : JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  /**
   * Start the MCP server
   */
  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}
