/* Shared by the browser and native WebRTC integration tests. The helper offers
   two send/receive transceivers once; camera/mic toggles use replaceTrack so
   either person can start media later without competing SDP offers. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.SpeakForwardPeer = factory(root.RTCPeerConnection);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (RTCPeerConnection) {
  return class SpeakForwardPeer {
    constructor({ configuration, initiator, send, onTrack, onState, onError }) {
      this.pc = new RTCPeerConnection(configuration);
      this.initiator = initiator;
      this.send = send;
      this.onError = onError || (() => {});
      this.closed = false;
      this.tracks = { audio: null, video: null };
      this.candidates = [];
      this.receiveQueue = Promise.resolve();
      this.sendQueue = Promise.resolve();
      this.descriptionSent = false;
      this.localCandidates = [];
      this.pc.ontrack = event => { if (!this.closed) onTrack?.(event); };
      this.pc.onconnectionstatechange = () => { if (!this.closed) onState?.(this.pc.connectionState); };
      this.pc.onicecandidate = event => {
        if (!event.candidate || this.closed) return;
        const candidate = event.candidate.toJSON ? event.candidate.toJSON() : event.candidate;
        if (!this.descriptionSent) this.localCandidates.push(candidate);
        else this.signal({ type: 'candidate', candidate });
      };
      if (initiator) {
        this.pc.addTransceiver('audio', { direction: 'sendrecv' });
        this.pc.addTransceiver('video', { direction: 'sendrecv' });
      }
    }

    signal(signal) {
      this.sendQueue = this.sendQueue.then(async () => {
        if (!this.closed) await this.send(signal);
      }).catch(e => { if (!this.closed) this.onError(e); });
      return this.sendQueue;
    }

    async describe(description) {
      await this.pc.setLocalDescription(description);
      if (this.closed) return;
      await this.signal({ type: this.pc.localDescription.type, sdp: this.pc.localDescription.sdp });
      this.descriptionSent = true;
      for (const candidate of this.localCandidates.splice(0)) this.signal({ type: 'candidate', candidate });
    }

    async start() {
      if (!this.initiator || this.closed) return;
      await this.attachTracks();
      await this.describe(await this.pc.createOffer());
    }

    async setTrack(kind, track) {
      if (this.closed) return;
      this.tracks[kind] = track;
      await this.attachTracks();
    }

    async attachTracks() {
      if (this.closed) return;
      for (const transceiver of this.pc.getTransceivers()) {
        const kind = transceiver.receiver.track.kind;
        transceiver.direction = 'sendrecv';
        if (transceiver.sender.track !== this.tracks[kind]) await transceiver.sender.replaceTrack(this.tracks[kind]);
      }
    }

    receive(signal) {
      // ICE may arrive before a remote description due to async authorization.
      this.receiveQueue = this.receiveQueue.then(async () => {
        if (this.closed) return;
        if (signal.type === 'candidate') {
          if (!this.pc.remoteDescription) {
            if (this.candidates.length >= 100) throw new Error('Too many pending ICE candidates.');
            this.candidates.push(signal.candidate);
          } else await this.pc.addIceCandidate(signal.candidate);
          return;
        }
        if (!['offer', 'answer'].includes(signal.type)) return;
        if (signal.type === 'offer' && this.initiator || signal.type === 'answer' && !this.initiator) throw new Error('Unexpected call description.');
        await this.pc.setRemoteDescription({ type: signal.type, sdp: signal.sdp });
        if (this.closed) return;
        await this.attachTracks();
        for (const candidate of this.candidates.splice(0)) await this.pc.addIceCandidate(candidate);
        if (signal.type === 'offer') await this.describe(await this.pc.createAnswer());
      }).catch(e => { if (!this.closed) this.onError(e); });
      return this.receiveQueue;
    }

    close() {
      this.closed = true;
      this.pc.ontrack = null;
      this.pc.onconnectionstatechange = null;
      this.pc.onicecandidate = null;
      this.pc.close();
      this.candidates = [];
      this.localCandidates = [];
    }
  };
});
