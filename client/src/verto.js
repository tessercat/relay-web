/*
 *  Copyright (c) 2020 Peter Christensen. All Rights Reserved.
 *  CC BY-NC-ND 4.0.
 */
import logger from "./logger.js";

class VertoSocket {

  constructor(wssUrl) {
    this.wssUrl = wssUrl;
    this.socket = null;
    this.isOpening = false;
    this.isClosed = true;
    this.retryCount = 0;
    this.retryBackoff = 5 * 1000;
    this.retryMaxWait = 30 * 1000;
    this.retryRange = 5 * 1000;
    this.retryTimer = null;

    // Events bindings
    this.onOpen = null;
    this.onClose = null;
    this.onMessage = null;
  }

  _retryInterval() {
    let delay = this.retryCount * this.retryBackoff;
    if (delay > this.retryMaxWait) {
      delay = this.retryMaxWait;
    }
    if (delay) {
      const minDelay = delay - this.retryRange;
      const maxDelay = delay + this.retryRange;
      delay = Math.floor(Math.random() * (maxDelay - minDelay + 1) + minDelay);
    }
    return delay;
  }

  isOpen() {
    return this.socket && this.socket.readyState <= 1;
  }

  open() {
    if (this.isOpen() || this.isOpening) {
      return;
    }
    this.isOpening = true;
    this.isClosed = false;
    clearTimeout(this.retryTimer);
    const socket = new WebSocket(this.wssUrl);
    socket.onopen = () => {
      if (this.isOpening) {
        this.isOpening = false;
        this.socket = socket;
        this.retryCount = 0;
        if (this.onOpen) {
          this.onOpen();
        }
      }
    }
    socket.onclose = () => {
      this.isOpening = false;
      this.socket = null;
      if (this.onClose) {
        this.onClose();
      }
      if (!this.isClosed) {
        const delay = this._retryInterval();
        logger.debug("socket", `Waiting ${delay} after ${this.retryCount} tries`);
        this.retryTimer = setTimeout(() => {
          this.retryCount += 1;
          this.open();
        }, delay);
      }
    }
    socket.onmessage = (message) => {
      if (this.onMessage) {
        this.onMessage(message);
      }
    }
  }

  close() {
    this.isClosed = true;
    this.isOpening = false;
    clearTimeout(this.retryTimer);
    this.retryCount = 0;
    if (this.isOpen()) {
      this.socket.close();
    }
  }

  send(message) {
    if (this.socket && this.socket.readyState === 1) {
      this.socket.send(JSON.stringify(message));
    } else {
      throw new Error("Error sending message");
    }
  }
}

class VertoRequest {
  constructor(sessionId, requestId, method, params) {
    this.jsonrpc = "2.0";
    this.id = requestId;
    this.method = method;
    this.params = {sessid: sessionId, ...params};
  }
}

class ResponseCallbacks {
  constructor(onSuccess, onError) {
    this.sent = new Date();
    this.onSuccess = onSuccess;
    this.onError = onError;
  }
}

export default class VertoClient {

  constructor(wssUrl) {
    this.wssUrl = wssUrl;
    this.responseCallbacks = {};
    this.requestExpiry = 30 * 1000;
    this.socket = null;
    this.sessionId = this.newUuid();
    this.lastPing = null;

    this.onConnect = null;
    this.onDisconnect = null;
  }

  connect() {
    if (!this.socket) {
      this.socket = new VertoSocket(this.wssUrl);
      this.socket.onOpen = this._onSocketOpen.bind(this);
      this.socket.onClose = this._onSocketClose.bind(this);
      this.socket.onMessage = this._onSocketMessage.bind(this);
      this.socket.open();
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.close();
    }
  }

  newUuid() {
    const url = URL.createObjectURL(new Blob());
    URL.revokeObjectURL(url);
    return url.split("/").pop();
  }

  sendRequest(method, params, onSuccess, onError) {
    const request = new VertoRequest(
      this.sessionId,
      this.newUuid(),
      method,
      params
    );
    this.responseCallbacks[request.id] = new ResponseCallbacks(
      onSuccess, onError
    );
    logger.debug("client", "Request", request);
    this.socket.send(request);
  }

  // Socket handlers

  _onSocketOpen() {
    logger.debug("client", "Socket open");
    this._resetClientState();
    if (this.onConnect) {
      this.onConnect();
    }
  }

  _onSocketClose() {
    logger.debug("client", "Socket closed");
    this._resetClientState();
    if (this.onDisconnect) {
      this.onDisconnect();
    }
  }

  _onSocketMessage(event) {
    let message = null;
    try {
      message = JSON.parse(event.data);
    } catch (error) {
      throw new Error("Message parse error");
    }
    if (this.responseCallbacks[message.id]) {
      this._handleResponse(message);
    } else {
      this._handleEvent(message);
    }
  }

  // Client state helpers

  _cleanResponseCallbacks(cleanAll) {
    logger.debug("client", "Cleaning callbacks");
    const expired = [];
    const now = new Date();
    for (const requestId in this.responseCallbacks) {
      if (cleanAll) {
        expired.push(requestId);
      } else {
        const diff = now - this.responseCallbacks[requestId].sent;
        if (diff > this.requestExpiry) {
          expired.push(requestId);
        }
      }
    }
    for (const requestId of expired) {
      delete this.responseCallbacks[requestId];
      logger.error("client", "Deleted callback", requestId);
    }
  }

  _resetClientState() {
    this.lastPing = null;
    this._cleanResponseCallbacks(true);
  }

  // Response/event handlers

  _handleResponse(message) {
    if (message.result) {
      logger.debug("client", "Response", message);
      const onSuccess = this.responseCallbacks[message.id].onSuccess;
      if (onSuccess) {
        onSuccess(message);
      }
    } else if (message.error) {
      logger.error("client", "Response error", message);
      const onError = this.responseCallbacks[message.id].onError;
      if (onError) {
        onError(message);
      }
    } else {
      logger.error("client", "Response unhandled", message);
    }
    delete this.responseCallbacks[message.id];
  }

  _handleEvent(event) {
    if (event.method === "verto.ping") {
      this._cleanResponseCallbacks(false);
      this.lastPing = event.params.serno;
    } else {
      logger.debug("client", "Event", event);
    }
  }
}
