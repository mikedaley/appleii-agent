/*
 * save-to.js - Unified load-and-save tool for all emulator content sources
 *
 * Fetches content from an emulator source and saves it directly to a file
 * without exposing the raw data to the LLM (when direct=true).
 *
 * Written by
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

import fs from 'fs';
import path from 'path';
import { pathResolver } from '../path-resolver.js';
import { checkResolution, sendAppToolCall } from './routing-helpers.js';

export const tool = {
  name: "save_to",
  description: "Load content from an emulator source and save it to a file in one step. When direct=true (default), saves silently and returns only metadata — the base64 is never sent to the LLM. When direct=false, returns the content to the LLM without saving.",
  inputSchema: {
    type: "object",
    properties: {
      from: {
        type: "string",
        enum: ["basic-editor", "asm-editor", "basic-memory", "file-explorer", "memory-range", "screen", "raw"],
        description: "Content source: basic-editor (BASIC editor text), asm-editor (ASM editor source), basic-memory (BASIC program from emulator memory), file-explorer (file from disk/SmartPort), memory-range (raw memory bytes), screen (screen capture), raw (LLM-provided content)"
      },
      whereTo: {
        type: "string",
        description: "Sandbox path to save the file (e.g. \"[files]/prog.bas\", \"[t]/dump.bin\")"
      },
      direct: {
        type: "boolean",
        description: "When true (default), save file and return only metadata. When false, return content to LLM without saving.",
        default: true
      },
      overwrite: {
        type: "boolean",
        description: "Allow overwriting an existing file (default: false)",
        default: false
      },
      // raw source
      content: {
        type: "object",
        description: "For from=raw: content provided by the LLM",
        properties: {
          data: {
            type: "string",
            description: "The content to save — UTF-8 text or base64-encoded binary depending on type"
          },
          type: {
            type: "string",
            enum: ["text", "binary"],
            description: "text: save data as UTF-8. binary: decode data from base64 and save as binary."
          }
        },
        required: ["data", "type"]
      },
      // file-explorer source
      filename: {
        type: "string",
        description: "For from=file-explorer: filename on disk to load"
      },
      drive: {
        type: "number",
        description: "For from=file-explorer: drive number 0 or 1 (default 0)",
        default: 0
      },
      // memory-range source
      address: {
        type: "string",
        description: "For from=memory-range: start address — $hex (e.g. \"$0300\") or decimal"
      },
      length: {
        type: "string",
        description: "For from=memory-range: byte count — $hex (e.g. \"$0800\") or decimal"
      },
      // screen source
      screenMode: {
        type: "string",
        enum: ["auto", "text", "graphics"],
        description: "For from=screen: 'graphics' captures as PNG, 'text' captures screen text, 'auto' defaults to graphics (default: auto)",
        default: "auto"
      },
      emulator: {
        type: "string",
        description: "Target emulator name, or omit to use default routing. Not used for from=raw."
      }
    },
    required: ["from", "whereTo"]
  }
};

/**
 * Call a frontend app tool via AG-UI and return parsed result
 */
async function callAppTool(httpServer, command, params = {}, emulatorName = null) {
  return await sendAppToolCall(httpServer, emulatorName, command, params, 15000);
}

/**
 * Fetch content from the requested source.
 * Returns { content, isBinary, isDataUrl }
 *   content   — string: raw base64 (isBinary=true) or UTF-8 text (isBinary=false)
 *   isBinary  — true if content is base64-encoded binary
 *   isDataUrl — true if the base64 has a data URL prefix that must be stripped
 */
async function fetchContent(httpServer, args, emulatorName = null) {
  const { from, content, filename, drive = 0, address, length, screenMode = "auto" } = args;

  switch (from) {

    case "raw": {
      if (!content?.data) throw new Error("content.data is required for from=raw");
      if (!content?.type) throw new Error("content.type is required for from=raw");
      return {
        content: content.data,
        isBinary: content.type === "binary",
      };
    }

    case "basic-editor": {
      const result = await callAppTool(httpServer, "basicProgramGet", {}, emulatorName);
      if (!result?.success) throw new Error(result?.error || "Failed to get BASIC program from editor");
      return { content: result.program, isBinary: false };
    }

    case "asm-editor": {
      const result = await callAppTool(httpServer, "asmGet", {}, emulatorName);
      if (!result?.success) throw new Error(result?.error || "Failed to get ASM source from editor");
      return { content: result.source, isBinary: false };
    }

    case "basic-memory": {
      const result = await callAppTool(httpServer, "directReadBasic", {}, emulatorName);
      if (!result?.success) throw new Error(result?.error || "Failed to read BASIC from memory");
      return { content: result.program, isBinary: false };
    }

    case "file-explorer": {
      if (!filename) throw new Error("filename is required for from=file-explorer");
      const result = await callAppTool(httpServer, "getDiskFileContent", { filename, drive }, emulatorName);
      if (!result?.success) throw new Error(result?.error || "Failed to read file from disk");
      if (result.isBinary) {
        return { content: result.contentBase64, isBinary: true };
      }
      return { content: result.content ?? result.text ?? result.contentBase64, isBinary: false };
    }

    case "memory-range": {
      if (!address) throw new Error("address is required for from=memory-range");
      if (!length) throw new Error("length is required for from=memory-range");
      const result = await callAppTool(httpServer, "directSaveBinaryRangeTo", { address, length }, emulatorName);
      if (!result?.success) throw new Error(result?.error || "Failed to read memory range");
      return { content: result.contentBase64, isBinary: true };
    }

    case "screen": {
      if (screenMode === "text") {
        const result = await callAppTool(httpServer, "captureScreenText", {}, emulatorName);
        if (!result?.success) throw new Error(result?.error || "Failed to capture screen text");
        return { content: result.text, isBinary: false };
      }
      // "auto" and "graphics" → PNG
      const result = await callAppTool(httpServer, "captureScreenshot", {}, emulatorName);
      if (!result?.success) throw new Error(result?.error || "Failed to capture screenshot");
      return { content: result.imageBase64, isBinary: true, isDataUrl: true };
    }

    default:
      throw new Error(`Unknown source: ${from}`);
  }
}

export async function handler(args, httpServer) {
  const { from, whereTo, direct = true, overwrite = false, emulator: emulatorParam } = args;

  if (!whereTo) {
    return { success: false, error: "whereTo parameter is required" };
  }

  // Resolve emulator for AG-UI sources (not needed for raw content)
  let emulatorName = null;
  if (from !== "raw") {
    const resolution = httpServer.resolveEmulator(emulatorParam);
    const prompt = checkResolution(resolution);
    if (prompt) return prompt;
    emulatorName = resolution.target.name;
  }

  // Fetch content from the source
  let fetched;
  try {
    fetched = await fetchContent(httpServer, args, emulatorName);
  } catch (err) {
    return { success: false, error: err.message };
  }

  const { isBinary, isDataUrl } = fetched;
  let content = fetched.content;

  // Strip data URL prefix if present (e.g. "data:image/png;base64, ")
  if (isDataUrl && isBinary) {
    content = content.replace(/^data:[^;]+;base64,\s*/, '').trim();
  }

  // direct=false: return content to LLM without saving
  if (!direct) {
    return {
      success: true,
      isBinary,
      ...(isBinary ? { contentBase64: content } : { content }),
      message: "Content loaded — not saved (direct=false)"
    };
  }

  // direct=true: save to file, scrub content from response
  let expandedPath;
  try {
    expandedPath = pathResolver.resolve(whereTo);
  } catch (err) {
    return { success: false, error: err.message };
  }

  if (!overwrite && fs.existsSync(expandedPath)) {
    return {
      success: false,
      error: `File already exists: ${expandedPath}. Set overwrite: true to replace it.`
    };
  }

  try {
    const dir = path.dirname(expandedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let size;
    if (isBinary) {
      const buffer = Buffer.from(content, 'base64');
      fs.writeFileSync(expandedPath, buffer);
      size = buffer.length;
    } else {
      fs.writeFileSync(expandedPath, content, 'utf8');
      size = Buffer.byteLength(content, 'utf8');
    }

    return {
      success: true,
      path: expandedPath,
      size,
      from: args.from,
      message: `Saved ${size} bytes to ${expandedPath}`
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
