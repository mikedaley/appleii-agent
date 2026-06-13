/*
 * get-screenshot.js - Capture and return emulator screenshot as an image
 *
 * Written by
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

import { checkResolution, sendAppToolCall } from "./routing-helpers.js";

export const tool = {
  name: "get_screenshot",
  description: "Capture the Apple //e screen (or the printer paper) and return it as a viewable image.",
  inputSchema: {
    type: "object",
    properties: {
      emulator: {
        type: "string",
        description: "Target emulator name, or omit to use default routing",
      },
      source: {
        type: "string",
        enum: ["screen", "printer"],
        description: 'What to capture: "screen" (default) or "printer" (the printed paper).',
      },
    },
  }
};

export async function handler(args, httpServer) {
  const { emulator: emulatorParam, source = "screen" } = args;

  const resolution = httpServer.resolveEmulator(emulatorParam);
  const prompt = checkResolution(resolution);
  if (prompt) return prompt;

  const command = source === "printer" ? "printerCapturePaper" : "captureScreenshot";
  const result = await sendAppToolCall(httpServer, resolution.target.name, command, {});

  if (!result?.success) {
    return { success: false, error: result?.error || "Screenshot capture failed" };
  }

  const { imageBase64 } = result;
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
