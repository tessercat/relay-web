/*
 *  Copyright (c) 2020 Peter Christensen. All Rights Reserved.
 *  CC BY-NC-ND 4.0.
 */
import logger from "./logger.js"
import VertoClient from "./verto.js"

class RelayClient {

  constructor() {
    this.wssUrl = `wss://${location.host}/verto`;
    this.verto = new VertoClient(this.wssUrl);
    this.verto.onConnect = this._onClientConnect.bind(this);
    this.verto.onDisconnect = this._onClientDisconnect.bind(this);
    // this.callee = new URLSearchParams(location.search).get("callee");
  }

  start() {
    this.verto.connect();
  }

  stop() {
    this.verto.disconnect();
  }

  // Client event handlers
  _onClientConnect() {
    logger.info("relay", "client connected")
    // start call.
  }

  _onClientDisconnect() {
    logger.info("relay", "client disconnected")
  }
}

document.debugLogEnabled = true;
document.infoLogEnabled = true;
window.RelayClient = RelayClient;
