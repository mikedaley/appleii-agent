/*
 * get-screenshot.js - Capture and return emulator screenshot as an image
 *
 * Written by
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

export const tool = {
  name: "get_screenshot",
  description: "Capture the current Apple //e screen and return it as a viewable image.",
  inputSchema: {
    type: "object",
    properties: {},
    required: []
  }
};

export async function handler(args, httpServer) {
  const toolCallId = `tc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  await httpServer.sendEvent({
    type: "TOOL_CALL_START",
    tool_call_id: toolCallId,
    tool_call_name: "emma_command",
  });

  await httpServer.sendEvent({
    type: "TOOL_CALL_ARGS",
    tool_call_id: toolCallId,
    delta: JSON.stringify({ command: "captureScreenshot", params: {} }),
  });

  await httpServer.sendEvent({
    type: "TOOL_CALL_END",
    tool_call_id: toolCallId,
  });

  const raw = await httpServer.waitForToolResult(toolCallId, 10000);
  const captureResult = typeof raw === "string" ? JSON.parse(raw) : raw;

  if (!captureResult?.success) {
    return { success: false, error: captureResult?.error || "Screenshot capture failed" };
  }

  const { imageBase64 } = captureResult;
  if (!imageBase64) {
    return { success: false, error: "No image data returned from emulator" };
  }

  // Strip data URL prefix to get raw base64
  const data = imageBase64.replace(/^data:[^;]+;base64,\s*/, '').trim();

  // Return as MCP image content so the LLM can view it directly
  return {
    _mcpContent: [
      { type: "image", data, mimeType: "image/png" }
    ]
  };
}
