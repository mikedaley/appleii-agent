/*
 * set-default-emulator.js - Set which emulator receives tool calls by default
 *
 * Written by
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

export const tool = {
  name: "set_default_emulator",
  description: "Set which connected emulator receives tool calls by default when no emulator param is specified.",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Name of the emulator to make default (must be currently connected)",
      },
    },
    required: ["name"],
  },
};

export async function handler(args, httpServer) {
  const { name } = args;

  const record = httpServer.emulators.get(name);
  if (!record) {
    const connected = [...httpServer.emulators.values()]
      .filter(r => r.state === "connected")
      .map(r => r.name)
      .join(", ") || "none";
    return {
      success: false,
      error: `Emulator "${name}" not found. Connected emulators: ${connected}.`,
    };
  }

  if (record.state !== "connected") {
    return {
      success: false,
      error: `Emulator "${name}" is not in a connected state (current state: ${record.state}).`,
    };
  }

  // Clear default on all emulators, set on the target
  httpServer.emulators.forEach(r => { r.isDefault = false; });
  record.isDefault = true;

  return {
    success: true,
    message: `"${name}" is now the default emulator.`,
  };
}
