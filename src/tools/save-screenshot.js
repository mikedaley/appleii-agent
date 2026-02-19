/*
 * save-screenshot.js - Capture and save emulator screenshot in one step
 *
 * Written by
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

import fs from 'fs';
import path from 'path';
import { pathResolver } from '../path-resolver.js';

export const tool = {
  name: "save_screenshot",
  description: "Capture the current Apple //e screen and save it as a PNG file. Handles the full capture-decode-save pipeline without returning the image data to the LLM.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Sandbox path to save the PNG (e.g. \"[t]/cap.png\" or \"[files]/screen.png\")"
      },
      overwrite: {
        type: "boolean",
        description: "Allow overwriting an existing file (default: false)",
        default: false
      }
    },
    required: ["path"]
  }
};

export async function handler(args, httpServer) {
  const { path: filePath, overwrite = false } = args;

  if (!filePath) {
    return { success: false, error: "path parameter is required" };
  }

  // Resolve sandbox path
  let expandedPath;
  try {
    expandedPath = pathResolver.resolve(filePath);
  } catch (err) {
    return { success: false, error: err.message };
  }

  // Check overwrite
  if (!overwrite && fs.existsSync(expandedPath)) {
    return {
      success: false,
      error: `File already exists: ${expandedPath}. Set overwrite: true to replace it.`
    };
  }

  // Call the captureScreenshot app tool via AG-UI
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

  const toolResult = await httpServer.waitForToolResult(toolCallId, 10000);
  const captureResult = typeof toolResult === "string" ? JSON.parse(toolResult) : toolResult;

  if (!captureResult?.success) {
    return { success: false, error: captureResult?.error || "Screenshot capture failed" };
  }

  const { imageBase64 } = captureResult;
  if (!imageBase64) {
    return { success: false, error: "No image data returned from emulator" };
  }

  // Strip data URL prefix (e.g. "data:image/png;base64, ") to get raw base64
  const raw = imageBase64.replace(/^data:[^;]+;base64,\s*/, '').trim();

  // Decode and save
  try {
    const buffer = Buffer.from(raw, 'base64');

    const dir = path.dirname(expandedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(expandedPath, buffer);

    return {
      success: true,
      path: expandedPath,
      size: buffer.length,
      width: 560,
      height: 384,
      message: `Screenshot saved to ${expandedPath} (${buffer.length} bytes)`
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
