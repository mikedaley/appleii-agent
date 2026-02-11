/*
 * index.js - Tool registry
 *
 * Written by
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

import * as emmaCommand from "./emma-command.js";
import * as serverControl from "./server-control.js";
import * as setHttps from "./set-https.js";
import * as setDebug from "./set-debug.js";
import * as getState from "./get-state.js";
import * as showWindow from "./show-window.js";
import * as hideWindow from "./hide-window.js";
import * as focusWindow from "./focus-window.js";
import * as loadDiskImage from "./load-disk-image.js";
import * as loadFile from "./load-file.js";
import * as saveBasicFile from "./save-basic-file.js";
import * as saveAsmFile from "./save-asm-file.js";
import * as saveDiskFile from "./save-disk-file.js";
import * as loadSmartportImage from "./load-smartport-image.js";

export const tools = [
  serverControl,
  setHttps,
  setDebug,
  getState,
  showWindow,
  hideWindow,
  focusWindow,
  emmaCommand,
  loadDiskImage,
  loadSmartportImage,
  loadFile,
  saveBasicFile,
  saveAsmFile,
  saveDiskFile,
];
