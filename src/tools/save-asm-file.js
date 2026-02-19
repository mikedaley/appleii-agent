/*
 * save-asm-file.js - Save assembly source to filesystem
 *
 * Written by
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

import fs from 'fs';
import path from 'path';
import { pathResolver } from '../path-resolver.js';

export const tool = {
  name: "save_asm_file",
  description: "Save assembly source code to a file on the local filesystem. Supports sandbox paths like [asm]/program.s or full paths like ~/Documents/program.asm",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to save file. Use [sandbox]/path syntax or full path with ~ for home directory (.s or .asm extension recommended)",
      },
      content: {
        type: "string",
        description: "Assembly source code to save",
      },
      overwrite: {
        type: "boolean",
        description: "Allow overwriting existing file (default: false)",
        default: false,
      },
    },
    required: ["path", "content"],
  },
};

export function handler(args) {
  const { path: filePath, content, overwrite = false } = args;

  if (!filePath) {
    return {
      success: false,
      error: "path parameter is required",
    };
  }

  if (content === undefined || content === null) {
    return {
      success: false,
      error: "content parameter is required",
    };
  }

  try {
    // Resolve path (handles sandbox paths and ~ expansion)
    const absolutePath = pathResolver.resolve(filePath);

    // Ensure parent directory exists
    const dir = path.dirname(absolutePath);
    if (!fs.existsSync(dir)) {
      return {
        success: false,
        error: `Directory does not exist: ${dir}`,
      };
    }

    // Check if file already exists
    if (fs.existsSync(absolutePath) && !overwrite) {
      return {
        success: false,
        error: `File already exists: ${absolutePath}. Use overwrite: true to replace it.`,
        exists: true,
      };
    }

    // Write file
    fs.writeFileSync(absolutePath, content, 'utf8');

    // Get file stats
    const stats = fs.statSync(absolutePath);
    const filename = path.basename(absolutePath);

    return {
      success: true,
      filename: filename,
      path: absolutePath,
      size: stats.size,
      lines: content.split('\n').length,
      message: `Assembly source saved to ${filename}`,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to save file: ${error.message}`,
    };
  }
}
