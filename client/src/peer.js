import { logger } from "./logger.js";

class UserMedia {

  constructor() {
    this.mediaStream = null;
    this.isGetting = false;

    // Event handlers
    this.onInitError = null;
    this.onTrackStart = null;
    this.onTrackStop = null;
  }

  getUserMedia() {
    const onSuccess = (mediaStream) => {
      this.mediaStream = mediaStream;
      if (!this.isGetting) {

        /*
         * This runs when stop() is called before getUserMedia returns.
         *
         * In September of 2020, there must be some kind of race condition
         * in Android Chromium (Android 10 Chrome, Android 6 Vivaldi)
         * when media stream tracks are stopped too soon after starting.
         *
         * Tracks are live before they're stopped, and ended after,
         * but stopping them so soon after starting must leave a reference
         * behind somewhere, because the browser shows media devices
         * as active, even after stream tracks close.
         *
         * A slight pause before stopping tracks seems to take care
         * of the problem.
         *
         * I haven't seen this in Firefox, Chromium or Vivaldi on Linux,
         * so I assume it's Android only.
         */

        const sleep = () => new Promise((resolve) => {
          setTimeout(resolve, 500)
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
}

class VertoPeer {

  constructor() {
    this.isPolite = true;
    this.pc = null;
    this.isOffering = false;
    this.isIgnoringOffers = false;

    // Event handlers
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
      // No ICE!
      bundlePolicy: "max-compat",
      sdpSemantics: "unified-plan",
    }
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
        logger.debug(this, "Offering candidate", candidate)
        if (this.onIceData) {
          this.onIceData(candidate);
        }
      }
    };
    pc.onicegatheringstatechange = async () => {
      if (pc.iceGatheringState === "complete" && pc.localDescription) {
        const sdp = pc.localDescription.toJSON();
        logger.debug(this, "Bundle ready", sdp)
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
    }
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
          logger.debug(this, "Offering", sdp)
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

  // Inbound message handlers.

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
    const sdp = new RTCSessionDescription({type: type, sdp: sdpString});
    const isOfferCollision = (
      sdp.type === "offer"
      && (this.isOffering || this.pc.signalingState !== "stable")
    );
    this.isIgnoringOffers = !this.isPolite && isOfferCollision;
    if (this.isIgnoringOffers) {
      logger.debug(this, "Ignored offer", sdp);
      return;
    }
    if (isOfferCollision) {
      await Promise.all([
        this.pc.setLocalDescription({type: "rollback"}).catch((error) => {
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
      const sdp = this.pc.localDescription.toJSON();
      logger.debug(this, "Sending answer", sdp);
      if (onAnswer) {
        onAnswer(sdp);
      }
    }
  }
}

export { UserMedia, VertoPeer }
