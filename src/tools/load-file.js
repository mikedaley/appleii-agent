import fs from 'fs';
import path from 'path';
import { pathResolver } from '../path-resolver.js';

export const tool = {
  name: "load_file",
  description: "Read a file from the local filesystem. Returns base64 for binary files or plain text for text files. Supports sandbox paths like [files]/program.bas or full paths like ~/Documents/file.txt",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to the file. Use [sandbox]/path syntax or full path with ~ for home directory"
      },
      binary: {
        type: "boolean",
        description: "If true (default), return base64 content. If false, return plain text content.",
        default: true
      }
    },
    required: ["path"]
  }
};

export function handler(args) {
  const { path: filePath, binary = true } = args;

  if (!filePath) {
    return {
      success: false,
      error: "path parameter is required"
    };
  }

  try {
    // Resolve path (handles sandbox paths and ~ expansion)
    const expandedPath = pathResolver.resolve(filePath);

    // Check if file exists
    if (!fs.existsSync(expandedPath)) {
      return {
        success: false,
        error: `File not found: ${expandedPath}`
      };
    }

    // Read file
    const buffer = fs.readFileSync(expandedPath);

    if (binary) {
      // Return as base64
      const base64 = buffer.toString('base64');
      return {
        success: true,
        path: expandedPath,
        size: buffer.length,
        binary: true,
        contentBase64: base64,
        message: `File loaded: ${expandedPath} (${buffer.length} bytes)`
      };
    } else {
      // Return as plain text (UTF-8)
      const text = buffer.toString('utf8');
      return {
        success: true,
        path: expandedPath,
        size: buffer.length,
        binary: false,
        content: text,
        message: `File loaded: ${expandedPath} (${buffer.length} bytes)`
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}
