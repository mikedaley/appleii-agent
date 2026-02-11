/*
 * hide-window.js - Hide a window in the emulator
 *
 * Written by
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

export const tool = {
  name: "hideWindow",
  description: "Hide a window in the Apple //e emulator",
  inputSchema: {
    type: "object",
    properties: {
      windowId: {
        type: "string",
        description: "Window ID (e.g., 'disk-drives', 'basic-program', 'cpu-debugger')",
      },
    },
    required: ["windowId"],
  },
};

export async function handler(args, httpServer) {
  const toolCallId = `tc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  await httpServer.sendEvent({
    type: "TOOL_CALL_START",
    tool_call_id: toolCallId,
    tool_call_name: "hideWindow",
  });

  await httpServer.sendEvent({
    type: "TOOL_CALL_ARGS",
    tool_call_id: toolCallId,
    delta: JSON.stringify(args),
  });

  await httpServer.sendEvent({
    type: "TOOL_CALL_END",
    tool_call_id: toolCallId,
  });

  const result = await httpServer.waitForToolResult(toolCallId, 10000);
  return result;
}
