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
import * as getVersion from "./get-version.js";
import * as disconnectClients from "./disconnect-clients.js";
import * as shutdownRemoteServer from "./shutdown-remote-server.js";
import * as showWindow from "./show-window.js";
import * as hideWindow from "./hide-window.js";
import * as focusWindow from "./focus-window.js";
import * as loadDiskImage from "./load-disk-image.js";
import * as loadFile from "./load-file.js";
import * as loadSmartportImage from "./load-smartport-image.js";
import * as reloadSandbox from "./reload-sandbox.js";
import * as getScreenshot from "./get-screenshot.js";
import * as saveTo from "./save-to.js";

export const tools = [
  serverControl,
  setHttps,
  setDebug,
  getState,
  getVersion,
  reloadSandbox,
  disconnectClients,
  shutdownRemoteServer,
  showWindow,
  hideWindow,
  focusWindow,
  emmaCommand,
  loadDiskImage,
  loadSmartportImage,
  loadFile,
  getScreenshot,
  saveTo,
];
