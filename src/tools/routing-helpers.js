/*
 * routing-helpers.js - Shared emulator routing utilities for MCP tools
 *
 * Written by
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

/**
 * Resolve emulator routing and return a prompt/error response if not ready.
 * Returns null if routing resolved to a single target — caller may proceed.
 * @param {Object} resolution - Result from httpServer.resolveEmulator()
 * @returns {Object|null}
 */
export function checkResolution(resolution) {
  if (resolution.error) {
    return { success: false, error: resolution.error };
  }

  if (resolution.noDefault) {
    const list = resolution.options.map((r, i) => `${i + 1}) ${r.name}`).join("\n");
    return {
      success: false,
      prompt: true,
      message: `Multiple emulators connected but no default is set. Which one?\n\n${list}\n\nReply with a number or name.`,
      options: resolution.options.map(r => r.name),
    };
  }

  if (resolution.brokenTarget) {
    const healthyList = resolution.healthy.length > 0
      ? resolution.healthy.map((r, i) => `${i + 1}) ${r.name}`).join("\n")
      : "  (none available)";
    return {
      success: false,
      prompt: true,
      message: `Emulator "${resolution.brokenTarget.name}" is not responding. What would you like to do?\n\n1) Wait — I'll reconnect it and retry\n2) Use another emulator instead:\n${healthyList}\n3) Abort`,
      brokenName: resolution.brokenTarget.name,
      healthy: resolution.healthy.map(r => r.name),
    };
  }

  if (resolution.broadcast) {
    return { success: false, error: "This tool requires a single emulator target. Specify an emulator name or set a default with set_default_emulator." };
  }

  return null;
}

/**
 * Send an emma_command tool call to a single emulator and wait for the result.
 * @param {Object} httpServer
 * @param {string} emulatorName
 * @param {string} command - Frontend tool name
 * @param {Object} params - Tool params
 * @param {number} timeout - ms
 * @returns {Promise<any>}
 */
export async function sendAppToolCall(httpServer, emulatorName, command, params = {}, timeout = 10000) {
  const toolCallId = `tc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  httpServer.sendEventToEmulator(emulatorName, { type: "TOOL_CALL_START", tool_call_id: toolCallId, tool_call_name: "emma_command" });
  httpServer.sendEventToEmulator(emulatorName, { type: "TOOL_CALL_ARGS", tool_call_id: toolCallId, delta: JSON.stringify({ command, params }) });
  httpServer.sendEventToEmulator(emulatorName, { type: "TOOL_CALL_END", tool_call_id: toolCallId });
  const raw = await httpServer.waitForToolResult(toolCallId, timeout);
  const result = typeof raw === "string" ? JSON.parse(raw) : raw;
  const notes = httpServer.consumeContextNotes();
  if (notes.length === 0) return result;
  return { ...result, _note: notes.map(n => n.message).join("\n") };
}
