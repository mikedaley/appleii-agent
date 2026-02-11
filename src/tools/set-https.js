/*
 * set-https.js - HTTPS mode control tool
 *
 * Written by
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

export const tool = {
  name: "set_https",
  description: "Enable or disable HTTPS mode for the server",
  inputSchema: {
    type: "object",
    properties: {
      enabled: {
        type: "boolean",
        description: "True for HTTPS, false for HTTP",
      },
    },
    required: ["enabled"],
  },
};

export async function handler(args, httpServer) {
  const { enabled } = args;
  const oldStatus = httpServer.getStatus();

  await httpServer.setHttps(enabled);

  return {
    status: "updated",
    previous: oldStatus,
    current: httpServer.getStatus(),
  };
}
