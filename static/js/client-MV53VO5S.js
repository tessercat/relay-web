// src/logger.js
function _getPrefix(prefix) {
  return `[${prefix} ${new Date().toLocaleTimeString()}]`;
}
var logger = {
  debug: (caller, ...args) => {
    if (document.debugLogEnabled) {
      console.debug(_getPrefix(caller.constructor.name), ...args);
    }
  },
  info: (caller, ...args) => {
    if (document.infoLogEnabled) {
      console.log(_getPrefix(caller.constructor.name), ...args);
    }
  },
  error: (caller, ...args) => {
    console.error(_getPrefix(caller.constructor.name), ...args);
  }
};

// src/peer.js
var UserMedia = class {
  constructor() {
    this.mediaStream = null;
    this.isGetting = false;
    this.onInitError = null;
    this.onTrackStart = null;
    this.onTrackStop = null;
  }
  getUserMedia() {
    const onSuccess = (mediaStream) => {
      this.mediaStream = mediaStream;
      if (!this.isGetting) {
        const sleep = () => new Promise((resolve) => {
          setTimeout(resolve, 500);
        });
        sleep().then(() => {
          this.stop();
        });
      }
    };
    const onError = (error) => {
      this.isGetting = false;
      logger.error(this, error);
      if (this.onInitError) {
        this.onInitError(error);
      }
    };
    if (!this.mediaStream && !this.isGetting) {
      this.isGetting = true;
      this._getUserMedia(onSuccess, onError);
    }
  }
  stop() {
    this.isGetting = false;
    if (this.mediaStream) {
      for (const track of this.mediaStream.getTracks()) {
        track.stop();
        logger.debug(this, "Stopped using", track.label);
        if (this.onTrackStop) {
          this.onTrackStop(track);
        }
      }
      this.mediaStream = null;
    }
  }
  async _getUserMedia(onSuccess, onError) {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false
      });
      for (const track of mediaStream.getTracks()) {
        logger.debug(this, "Using", track.label);
        if (this.onTrackStart) {
          this.onTrackStart(track);
        }
      }
      onSuccess(mediaStream);
    } catch (error) {
      onError(error);
    }
  }
};
var VertoPeer = class {
  constructor() {
    this.isPolite = true;
    this.pc = null;
    this.isOffering = false;
    this.isIgnoringOffers = false;
    this.onConnected = null;
    this.onClosed = null;
    this.onFailed = null;
    this.onIceData = null;
    this.onSdpOffer = null;
    this.onBundleReady = null;
    this.onRemoteTrack = null;
  }
  close() {
    if (this.pc && this.pc.connectionState !== "closed") {
      this.pc.close();
      this.pc = null;
    }
    this.isOffering = false;
    this.isIgnoringOffers = false;
  }
  addMediaStream(mediaStream) {
    if (!this.pc) {
      this.pc = this._newConnection();
      this.isOffering = false;
      this.isIgnoringOffers = false;
    }
    for (const track of mediaStream.getTracks()) {
      logger.debug(this, "Adding", track.label);
      this.pc.addTrack(track, mediaStream);
    }
  }
  _newConnection() {
    const config = {
      bundlePolicy: "max-compat",
      sdpSemantics: "unified-plan"
    };
    const pc = new RTCPeerConnection(config);
    pc.ontrack = (event) => {
      if (event.track) {
        logger.debug(this, "Receiving media", event.track);
        if (this.onRemoteTrack) {
          this.onRemoteTrack(event.track);
        }
      }
    };
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const candidate = event.candidate.toJSON();
        logger.debug(this, "Offering candidate", candidate);
        if (this.onIceData) {
          this.onIceData(candidate);
        }
      }
    };
    pc.onicegatheringstatechange = async () => {
      if (pc.iceGatheringState === "complete" && pc.localDescription) {
        const sdp = pc.localDescription.toJSON();
        logger.debug(this, "Bundle ready", sdp);
        if (this.onBundleReady) {
          this.onBundleReady(sdp.sdp);
        }
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        logger.debug(this, "Connected");
        if (this.onConnected) {
          this.onConnected();
        }
      } else if (pc.connectionState === "closed") {
        logger.debug(this, "Closed");
        if (this.onClosed) {
          this.onClosed();
        }
      } else if (pc.connectionState === "failed") {
        logger.debug(this, "Failed");
        if (this.onFailed) {
          this.onFailed();
        }
      }
    };
    pc.onnegotiationneeded = async () => {
      try {
        this.isOffering = true;
        const offer = await pc.createOffer();
        if (pc.signalingState !== "stable") {
          logger.debug(this, "Abandoned offer");
          return;
        }
        await pc.setLocalDescription(offer);
        if (pc.localDescription) {
          const sdp = pc.localDescription.toJSON();
          logger.debug(this, "Offering", sdp);
          if (this.onSdpOffer) {
            this.onSdpOffer(sdp);
          }
        }
      } catch (error) {
        logger.error(this, "Negotiation error", error);
      } finally {
        this.isOffering = false;
      }
    };
    return pc;
  }
  async addIceCandidate(candidate) {
    try {
      await this.pc.addIceCandidate(candidate);
    } catch (error) {
      if (!this.isIgnoringOffers) {
        logger.error(this, "Received bad ICE data", candidate);
      }
    }
  }
  async setRemoteDescription(type, sdpString, onAnswer) {
    const sdp = new RTCSessionDescription({ type, sdp: sdpString });
    const isOfferCollision = sdp.type === "offer" && (this.isOffering || this.pc.signalingState !== "stable");
    this.isIgnoringOffers = !this.isPolite && isOfferCollision;
    if (this.isIgnoringOffers) {
      logger.debug(this, "Ignored offer", sdp);
      return;
    }
    if (isOfferCollision) {
      await Promise.all([
        this.pc.setLocalDescription({ type: "rollback" }).catch((error) => {
          logger.error(this, "Rollback error", error);
        }),
        this.pc.setRemoteDescription(sdp)
      ]);
      logger.debug(this, "Rolled back offer");
    } else {
      await this.pc.setRemoteDescription(sdp);
      logger.debug(this, "Accepted offer", sdp);
    }
    if (sdp.type === "offer") {
      await this.pc.setLocalDescription(await this.pc.createAnswer());
      const sdp2 = this.pc.localDescription.toJSON();
      logger.debug(this, "Sending answer", sdp2);
      if (onAnswer) {
        onAnswer(sdp2);
      }
    }
  }
};

// src/verto.js
var VertoSocket = class {
  constructor(wssUrl) {
    this.wssUrl = wssUrl;
    this.socket = null;
    this.isOpening = false;
    this.isClosing = false;
    this.retryCount = 0;
    this.retryBackoff = 5 * 1e3;
    this.retryMaxWait = 30 * 1e3;
    this.retryRange = 5 * 1e3;
    this.retryTimer = null;
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
    this.isClosing = false;
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
    };
    socket.onclose = () => {
      this.isOpening = false;
      this.socket = null;
      if (this.onClose) {
        this.onClose();
      }
      if (!this.isClosing) {
        const delay = this._retryInterval();
        logger.info(this, `Waiting ${delay} after ${this.retryCount} tries`);
        this.retryTimer = setTimeout(() => {
          this.retryCount += 1;
          this.open();
        }, delay);
      }
    };
    socket.onmessage = (message) => {
      if (this.onMessage) {
        this.onMessage(message);
      }
    };
  }
  close() {
    this.isClosing = true;
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
};
var VertoRequest = class {
  constructor(sessionId, requestId, method, params) {
    this.jsonrpc = "2.0";
    this.id = requestId;
    this.method = method;
    this.params = { sessid: sessionId, ...params };
  }
};
var ResponseCallbacks = class {
  constructor(onSuccess, onError) {
    this.sent = new Date();
    this.onSuccess = onSuccess;
    this.onError = onError;
  }
};
var VertoClient = class {
  constructor(wssUrl) {
    this.wssUrl = wssUrl;
    this.responseCallbacks = {};
    this.requestExpiry = 30 * 1e3;
    this.socket = null;
    this.sessionId = this.newUuid();
    this.lastPing = null;
    this.onConnect = null;
    this.onDisconnect = null;
    this.onEvent = null;
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
      this.socket = null;
    }
  }
  newUuid() {
    const url = URL.createObjectURL(new Blob());
    URL.revokeObjectURL(url);
    return url.split("/").pop();
  }
  sendRequest(method, params, onSuccess, onError) {
    const request = new VertoRequest(this.sessionId, this.newUuid(), method, params);
    this.responseCallbacks[request.id] = new ResponseCallbacks(onSuccess, onError);
    logger.debug(this, "Request", request);
    this.socket.send(request);
  }
  _onSocketOpen() {
    logger.debug(this, "Socket open");
    this._resetClientState();
    if (this.onConnect) {
      this.onConnect();
    }
  }
  _onSocketClose() {
    logger.debug(this, "Socket closed");
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
  _cleanResponseCallbacks(cleanAll) {
    logger.debug(this, "Cleaning callbacks");
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
      logger.error(this, "Deleted callback", requestId);
    }
  }
  _resetClientState() {
    this.lastPing = null;
    this._cleanResponseCallbacks(true);
  }
  _handleResponse(message) {
    if (message.result) {
      logger.debug(this, "Response", message);
      const onSuccess = this.responseCallbacks[message.id].onSuccess;
      if (onSuccess) {
        onSuccess(message);
      }
    } else if (message.error) {
      logger.error(this, "Response error", message);
      const onError = this.responseCallbacks[message.id].onError;
      if (onError) {
        onError(message);
      }
    } else {
      logger.error(this, "Response unhandled", message);
    }
    delete this.responseCallbacks[message.id];
  }
  _handleEvent(event) {
    if (event.method === "verto.ping") {
      this._cleanResponseCallbacks(false);
      this.lastPing = event.params.serno;
    } else if (this.onEvent) {
      this.onEvent(event);
    } else {
      logger.debug(this, "Event", event);
    }
  }
};

// src/client.js
var RelayClient = class {
  constructor() {
    this.userMedia = new UserMedia();
    this.userMedia.onInitError = this._onUserMediaInitError.bind(this);
    this.userMedia.onTrackStart = this._onUserMediaTrackStart.bind(this);
    this.userMedia.onTrackStop = this._onUserMediaTrackStop.bind(this);
    this.wssUrl = `wss://${location.host}/verto`;
    this.verto = new VertoClient(this.wssUrl);
    this.verto.onConnect = this._onVertoConnect.bind(this);
    this.verto.onDisconnect = this._onVertoDisconnect.bind(this);
    this.verto.onEvent = this._onVertoEvent.bind(this);
    this.peer = new VertoPeer();
    this.peer.onBundleReady = this._onPeerBundleReady.bind(this);
    this.peer.onRemoteTrack = this._onPeerRemoteTrack.bind(this);
    this.callId = null;
    this.callee = new URLSearchParams(location.search).get("callee");
  }
  start() {
    this.userMedia.getUserMedia();
  }
  stop() {
    this.peer.close();
    this.userMedia.stop();
    this.verto.disconnect();
  }
  _onUserMediaInitError(error) {
    logger.debug(this, error.message);
    this.stop();
  }
  _onUserMediaTrackStart(track) {
    logger.debug(this, "Attached", track.label);
    this.verto.connect();
  }
  _onUserMediaTrackStop(track) {
    logger.debug(this, "Detached", track.label);
  }
  _onVertoConnect() {
    logger.info(this, "Connected");
    this.peer.addMediaStream(this.userMedia.mediaStream);
  }
  _onVertoDisconnect() {
    logger.info(this, "Disconnected");
  }
  _onVertoEvent(event) {
    logger.info(this, event);
  }
  _onPeerBundleReady(sdp) {
    logger.info(this, sdp);
    const onSuccess = (message) => {
      logger.info(this, message);
    };
    const onError = (error) => {
      logger.error(this, error);
    };
    this.callId = this.verto.newUuid();
    const params = {
      dialogParams: {
        callID: this.callId,
        destination_number: this.callee,
        caller_id_number: "TODO",
        caller_id_name: "TODO"
      },
      sdp
    };
    this.verto.sendRequest("verto.invite", params, onSuccess, onError);
  }
  _onPeerRemoteTrack(track) {
    logger.info(this, "Receiving", track.label);
  }
};
export {
  RelayClient
};
