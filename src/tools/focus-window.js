/*
 * focus-window.js - Focus (bring to front) a window in the emulator
 *
 * Written by
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

export const tool = {
  name: "focusWindow",
  description: "Bring an already-visible window to the front in the Apple //e emulator",
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
    tool_call_name: "focusWindow",
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
