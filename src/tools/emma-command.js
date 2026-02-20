/*
 * emma-command.js - Generic command tool for emulator with routing
 *
 * Written by
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

export const tool = {
  name: "emma_command",
  description: "Send a command to the Apple //e emulator. Use the `emulator` param to target a specific emulator by name, 'all' to broadcast, or omit to route to the default.",
  inputSchema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "Command name",
      },
      params: {
        type: "object",
        description: "Command parameters",
        additionalProperties: true,
      },
      emulator: {
        type: "string",
        description: "Target emulator name, 'all' to broadcast, or omit to use default routing",
      },
      skipBroken: {
        type: "boolean",
        description: "When broadcasting, skip broken emulators silently for the rest of this session",
      },
    },
    required: ["command"],
  },
};

export async function handler(args, httpServer) {
  const { command, params = {}, emulator: emulatorParam, skipBroken } = args;

  // Apply session-level skip flag if requested
  if (skipBroken) {
    httpServer.skipBrokenOnBroadcast = true;
  }

  const resolution = httpServer.resolveEmulator(emulatorParam);

  // Hard error (not found, none connected)
  if (resolution.error) {
    return { success: false, error: resolution.error };
  }

  // Prompt: no default set — present numbered list
  if (resolution.noDefault) {
    const list = resolution.options.map((r, i) => `${i + 1}) ${r.name}`).join("\n");
    return {
      success: false,
      prompt: true,
      message: `Multiple emulators are connected but no default is set. Which one should I use?\n\n${list}\n\nReply with a number or name.`,
      options: resolution.options.map(r => r.name),
    };
  }

  // Prompt: target emulator is broken
  if (resolution.brokenTarget) {
    const healthyList = resolution.healthy.length > 0
      ? resolution.healthy.map((r, i) => `${i + 1}) ${r.name}`).join("\n")
      : "  (none available)";
    return {
      success: false,
      prompt: true,
      message: `Emulator "${resolution.brokenTarget.name}" is not responding (broken connection). What would you like to do?\n\n1) Wait — I'll reconnect it and retry\n2) Use another emulator instead:\n${healthyList}\n3) Abort — tell me what to do next`,
      brokenName: resolution.brokenTarget.name,
      healthy: resolution.healthy.map(r => r.name),
    };
  }

  // Broadcast: emulator: "all"
  if (resolution.broadcast) {
    // Warn about broken emulators unless session flag is set
    if (resolution.broken.length > 0 && !httpServer.skipBrokenOnBroadcast) {
      const skippedList = resolution.broken.map(r => `  - ${r.name} (${r.state})`).join("\n");
      const availableList = resolution.targets.map(r => r.name).join(", ") || "none";
      return {
        success: false,
        prompt: true,
        message: `Some emulators are not reachable and will be skipped:\n${skippedList}\n\nProceed with the rest (${availableList})?\n\n1) Yes, skip them and continue\n2) Wait — I'll reconnect them first\n3) Abort\n\n(Include skipBroken: true to stop asking for the rest of this session)`,
        skipped: resolution.broken.map(r => r.name),
        available: resolution.targets.map(r => r.name),
      };
    }

    if (resolution.targets.length === 0) {
      return { success: false, error: "No connected emulators to broadcast to." };
    }

    const result = await _executeBroadcast(command, params, resolution.targets, resolution.broken, httpServer);
    return _attachNotes(result, httpServer);
  }

  // Single target
  const result = await _executeOnEmulator(command, params, resolution.target.name, httpServer);
  return _attachNotes(result, httpServer);
}

/**
 * Attach any pending context notes to a successful result
 */
function _attachNotes(result, httpServer) {
  const notes = httpServer.consumeContextNotes();
  if (notes.length === 0) return result;
  const parsed = typeof result === "string" ? JSON.parse(result) : result;
  return { ...parsed, _note: notes.map(n => n.message).join("\n") };
}

/**
 * Execute a command on a single named emulator
 */
async function _executeOnEmulator(command, params, emulatorName, httpServer) {
  const toolCallId = `tc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  httpServer.sendEventToEmulator(emulatorName, {
    type: "TOOL_CALL_START",
    tool_call_id: toolCallId,
    tool_call_name: "emma_command",
  });

  httpServer.sendEventToEmulator(emulatorName, {
    type: "TOOL_CALL_ARGS",
    tool_call_id: toolCallId,
    delta: JSON.stringify({ command, params }),
  });

  httpServer.sendEventToEmulator(emulatorName, {
    type: "TOOL_CALL_END",
    tool_call_id: toolCallId,
  });

  return await httpServer.waitForToolResult(toolCallId, 10000);
}

/**
 * Broadcast a command to multiple emulators and collect all results
 */
async function _executeBroadcast(command, params, targets, broken, httpServer) {
  const results = {};

  await Promise.all(targets.map(async (record) => {
    const toolCallId = `tc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    httpServer.sendEventToEmulator(record.name, {
      type: "TOOL_CALL_START",
      tool_call_id: toolCallId,
      tool_call_name: "emma_command",
    });

    httpServer.sendEventToEmulator(record.name, {
      type: "TOOL_CALL_ARGS",
      tool_call_id: toolCallId,
      delta: JSON.stringify({ command, params }),
    });

    httpServer.sendEventToEmulator(record.name, {
      type: "TOOL_CALL_END",
      tool_call_id: toolCallId,
    });

    results[record.name] = await httpServer.waitForToolResult(toolCallId, 10000);
  }));

  return {
    success: true,
    results,
    skipped: broken.map(r => r.name),
  };
}
