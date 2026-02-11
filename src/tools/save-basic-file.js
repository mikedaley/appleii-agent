/*
 * save-basic-file.js - Save BASIC program to filesystem
 *
 * Written by
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

import fs from 'fs';
import path from 'path';
import { homedir } from 'os';

export const tool = {
  name: "save_basic_file",
  description: "Save BASIC program text to a file on the local filesystem",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to save file (supports ~ for home directory, .bas extension recommended)",
      },
      content: {
        type: "string",
        description: "BASIC program text to save",
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
    // Expand ~ to home directory
    let expandedPath = filePath;
    if (filePath.startsWith('~/')) {
      expandedPath = path.join(homedir(), filePath.slice(2));
    } else if (filePath === '~') {
      return {
        success: false,
        error: "Cannot save to home directory root, please specify a filename",
      };
    }

    // Resolve to absolute path
    const absolutePath = path.resolve(expandedPath);

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
      message: `BASIC program saved to ${filename}`,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to save file: ${error.message}`,
    };
  }
}
