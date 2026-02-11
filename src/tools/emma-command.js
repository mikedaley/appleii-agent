/*
 * emma-command.js - Generic command tool for emulator
 *
 * Written by
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

export const tool = {
  name: "emma_command",
  description: "Send a command to the Apple //e emulator",
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
    },
    required: ["command"],
  },
};

export async function handler(args, httpServer) {
  const toolCallId = `tc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Send TOOL_CALL_START
  await httpServer.sendEvent({
    type: "TOOL_CALL_START",
    tool_call_id: toolCallId,
    tool_call_name: "emma_command",
  });

  // Send TOOL_CALL_ARGS
  await httpServer.sendEvent({
    type: "TOOL_CALL_ARGS",
    tool_call_id: toolCallId,
    delta: JSON.stringify(args),
  });

  // Send TOOL_CALL_END
  await httpServer.sendEvent({
    type: "TOOL_CALL_END",
    tool_call_id: toolCallId,
  });

  // Wait for TOOL_CALL_RESULT from frontend
  const result = await httpServer.waitForToolResult(toolCallId, 10000);

  return result;
}
