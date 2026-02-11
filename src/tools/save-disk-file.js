import fs from 'fs';
import path from 'path';
import os from 'os';

export const tool = {
  name: "save_disk_file",
  description: "Save disk file content to the local filesystem. Content should be base64 encoded binary data.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to save the file (supports ~ for home directory)"
      },
      contentBase64: {
        type: "string",
        description: "Base64 encoded file content"
      },
      overwrite: {
        type: "boolean",
        description: "Allow overwriting existing files (default: false)",
        default: false
      }
    },
    required: ["path", "contentBase64"]
  }
};

export function handler(args) {
  const { path: filePath, contentBase64, overwrite = false } = args;

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

  try {
    // Expand ~ to home directory
    let expandedPath = filePath;
    if (filePath.startsWith('~')) {
      expandedPath = path.join(os.homedir(), filePath.slice(1));
    }

    // Check if file exists and overwrite is false
    if (!overwrite && fs.existsSync(expandedPath)) {
      return {
        success: false,
        error: `File already exists: ${expandedPath}. Set overwrite: true to replace it.`
      };
    }

    // Decode base64 content
    const buffer = Buffer.from(contentBase64, 'base64');

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
