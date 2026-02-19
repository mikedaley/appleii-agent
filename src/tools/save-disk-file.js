import fs from 'fs';
import path from 'path';
import { pathResolver } from '../path-resolver.js';

export const tool = {
  name: "save_disk_file",
  description: "Save disk file content to the local filesystem. Content should be base64 encoded binary data. Supports sandbox paths like [files]/data.bin or full paths like ~/Documents/file.bin",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to save the file. Use [sandbox]/path syntax or full path with ~ for home directory"
      },
      contentBase64: {
        type: "string",
        description: "Base64 encoded file content"
      },
      overwrite: {
        type: "boolean",
        description: "Allow overwriting existing files (default: false)",
        default: false
      },
      direct: {
        type: "boolean",
        description: "When true (default), decode and save the file, returning only metadata. When false, return the base64 content to the LLM without saving.",
        default: true
      }
    },
    required: ["path", "contentBase64"]
  }
};

export function handler(args) {
  const { path: filePath, contentBase64, overwrite = false, direct = true } = args;

  if (!filePath) {
    return {
      success: false,
      error: "path parameter is required"
    };
  }

  if (!contentBase64) {
    return {
      success: false,
      error: "contentBase64 parameter is required"
    };
  }

  // direct=false: return content to LLM without saving
  if (!direct) {
    const raw = contentBase64.replace(/^data:[^;]+;base64,\s*/, '').trim();
    const buffer = Buffer.from(raw, 'base64');
    return {
      success: true,
      contentBase64: raw,
      size: buffer.length
    };
  }

  try {
    // Resolve path (handles sandbox paths and ~ expansion)
    const expandedPath = pathResolver.resolve(filePath);

    // Check if file exists and overwrite is false
    if (!overwrite && fs.existsSync(expandedPath)) {
      return {
        success: false,
        error: `File already exists: ${expandedPath}. Set overwrite: true to replace it.`
      };
    }

    // Strip data URL prefix if present (e.g. "data:image/png;base64, iVBOR...")
    // The regex handles any media type and optional whitespace after the comma
    const raw = contentBase64.replace(/^data:[^;]+;base64,\s*/, '').trim();

    // Decode base64 content
    const buffer = Buffer.from(raw, 'base64');

    // Ensure directory exists
    const dir = path.dirname(expandedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write file
    fs.writeFileSync(expandedPath, buffer);

    return {
      success: true,
      path: expandedPath,
      size: buffer.length,
      message: `File saved successfully: ${expandedPath} (${buffer.length} bytes)`
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}
