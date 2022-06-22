import { logger } from "./logger.js";
import { UserMedia, VertoPeer } from "./peer.js";
import { VertoClient } from "./verto.js";

class RelayClient {

  constructor() {

    // Media stream
    this.userMedia = new UserMedia();
    this.userMedia.onInitError = this._onUserMediaInitError.bind(this);
    this.userMedia.onTrackStart = this._onUserMediaTrackStart.bind(this);
    this.userMedia.onTrackStop = this._onUserMediaTrackStop.bind(this);

    // Verto socket
    this.wssUrl = `wss://${location.host}/verto`;
    this.verto = new VertoClient(this.wssUrl);
    this.verto.onConnect = this._onVertoConnect.bind(this);
    this.verto.onDisconnect = this._onVertoDisconnect.bind(this);
    this.verto.onEvent = this._onVertoEvent.bind(this);

    // Peer connection
    this.peer = new VertoPeer();
    this.peer.onBundleReady = this._onPeerBundleReady.bind(this);
    this.peer.onRemoteTrack = this._onPeerRemoteTrack.bind(this);

    // Call
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
    // update status message
    this.stop();
  }

  _onUserMediaTrackStart(track) {
    // attach track to audio element
    logger.debug(this, "Attached", track.label)
    this.verto.connect();
  }

  _onUserMediaTrackStop(track) {
    // detach track from audio element
    logger.debug(this, "Detached", track.label)
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
      sdp: sdp
    };
    this.verto.sendRequest("verto.invite", params, onSuccess, onError);
  }

  _onPeerRemoteTrack(track) {
    logger.info(this, "Receiving", track.label);
  }
}

window.RelayClient = RelayClient;
