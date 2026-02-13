/*
 * version.js - Version information from package.json
 *
 * Written by
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const packageJsonPath = join(__dirname, "..", "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));

export const VERSION = packageJson.version;
export const NAME = packageJson.name;
export const DESCRIPTION = packageJson.description;
