/*
 * load-disk-image.js - Load disk image from filesystem
 *
 * Written by
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

import fs from 'fs';
import path from 'path';
import { pathResolver } from '../path-resolver.js';

export const tool = {
  name: "load_disk_image",
  description: "Load a disk image file from the local filesystem and return as base64. Supports sandbox paths like [disks]/game.dsk or full paths like ~/Documents/game.dsk",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to disk image file. Use [sandbox]/path syntax or full path with ~ for home directory",
      },
    },
    required: ["path"],
  },
};

export function handler(args) {
  const { path: filePath } = args;

  if (!filePath) {
    return {
      success: false,
      error: "path parameter is required",
    };
  }

  try {
    // Resolve path (handles sandbox paths and ~ expansion)
    const absolutePath = pathResolver.resolve(filePath);

    // Check if file exists
    if (!fs.existsSync(absolutePath)) {
      return {
        success: false,
        error: `File not found: ${absolutePath}`,
      };
    }

    // Check if it's a file (not a directory)
    const stats = fs.statSync(absolutePath);
    if (!stats.isFile()) {
      return {
        success: false,
        error: `Path is not a file: ${absolutePath}`,
      };
    }

    // Validate disk format
    const supportedFormats = ['.dsk', '.do', '.po', '.nib', '.woz'];
    const ext = path.extname(absolutePath).toLowerCase();
    if (!supportedFormats.includes(ext)) {
      return {
        success: false,
        error: `Unsupported disk format: ${ext}. Supported formats: ${supportedFormats.join(', ')}`,
      };
    }

    // Read file
    const buffer = fs.readFileSync(absolutePath);

    // Convert to base64
    const base64Data = buffer.toString('base64');

    // Get filename
    const filename = path.basename(absolutePath);

    return {
      success: true,
      data: base64Data,
      filename: filename,
      size: buffer.length,
      path: absolutePath,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to load disk image: ${error.message}`,
    };
  }
}
