(() => {
  window.SpeakForwardCallUI = class {
    constructor({ sessionId, partnerId, isActive }) {
      this.sid = sessionId;
      this.partnerId = partnerId;
      this.isActive = isActive;
      this.local = new MediaStream();
      this.remote = new MediaStream();
      this.remoteFlags = { video: false, audio: false };
      this.generation = 0;
      this.peer = null;
      this.callId = null;
      this.readyForMedia = false;
      this.remoteVideo = document.getElementById('remote-video');
      this.localVideo = document.getElementById('local-video');
      this.remoteVideo.srcObject = this.remote;
      this.localVideo.srcObject = this.local;
      this.remoteVideo.addEventListener('loadeddata', () => this.renderRemote());
      document.getElementById('camera-toggle').addEventListener('click', () => this.toggle('video'));
      document.getElementById('mic-toggle').addEventListener('click', () => this.toggle('audio'));
      document.getElementById('retry-call').addEventListener('click', () => this.ready());
      document.getElementById('play-remote').addEventListener('click', () => this.play());
      this.renderLocal();
    }

    label(text, detail) {
      document.getElementById('call-status').textContent = text;
      if (detail) document.getElementById('call-detail').textContent = detail;
    }

    attach(socket) {
      this.socket = socket;
      socket.on('call:paired', data => this.pair(data));
      socket.on('call:signal', data => {
        if (!this.peer || data.callId !== this.callId || data.from !== this.partnerId) return;
        if (data.signal.type === 'media') {
          this.remoteFlags = data.signal;
          this.renderRemote();
          this.play();
        } else this.peer.receive(data.signal);
      });
      socket.on('call:peer-left', () => {
        this.closePeer();
        this.label('Waiting for your partner', 'Your partner left the call. Your media will reconnect when they return.');
      });
      socket.on('call:replaced', () => {
        this.stop();
        this.readyForMedia = false;
        this.label('Call opened in another tab', 'Only one call tab per account is active. Use Reconnect call here to take it back.');
      });
      socket.on('disconnect', () => {
        this.readyForMedia = false;
        this.stop();
        this.label(this.isActive() ? 'Connection lost' : 'Call ended', this.isActive() ? 'Camera and microphone were stopped. Re-enable them after reconnecting.' : 'Your camera and microphone are off.');
      });
    }

    emit(event, payload) {
      return new Promise((resolve, reject) => {
        if (!this.socket?.connected) return reject(new Error('Chat connection is offline.'));
        this.socket.timeout(6000).emit(event, payload, (error, result) => {
          if (error || result?.error) reject(new Error(result?.error || 'Call connection timed out.'));
          else resolve(result);
        });
      });
    }

    async ready() {
      if (!this.isActive() || !this.socket?.connected) return;
      if (!window.RTCPeerConnection || !window.SpeakForwardPeer) {
        this.label('Video unavailable', 'This browser does not support WebRTC. Text chat is still available.');
        return;
      }
      try {
        this.configuration = await api('/api/sessions/' + this.sid + '/rtc-config', null, 'GET');
        if (!this.isActive()) return;
        this.readyForMedia = true;
        await this.emit('call:ready', {});
        if (!this.peer) this.label('Waiting for your partner', 'Both participants need this practice room open. Enable camera and microphone when you’re ready.');
      } catch (e) { this.label('Call unavailable', e.message); }
    }

    pair(data) {
      if (!this.isActive() || !this.readyForMedia || data.peerUserId !== this.partnerId) return;
      this.closePeer();
      this.callId = data.callId;
      const id = data.callId;
      this.label('Connecting call…', 'Your camera and microphone start off. Turn on each one to share with your partner.');
      const peer = new SpeakForwardPeer({
        configuration: { iceServers: this.configuration.iceServers },
        initiator: data.initiator,
        send: signal => this.emit('call:signal', { callId: id, signal }),
        onTrack: event => {
          if (this.peer !== peer) return;
          this.remote.getTracks().filter(t => t.kind === event.track.kind).forEach(t => this.remote.removeTrack(t));
          this.remote.addTrack(event.track);
          event.track.onunmute = () => { this.renderRemote(); this.play(); };
          event.track.onmute = () => this.renderRemote();
          event.track.onended = () => this.renderRemote();
          this.renderRemote();
          this.play();
        },
        onState: state => {
          if (this.peer !== peer) return;
          if (state === 'connected') {
            this.label('Live · private call', 'Camera and microphone controls share live media only when enabled. Nothing is recorded.');
            this.sendMedia();
            this.play();
          } else if (state === 'failed' || state === 'disconnected') {
            this.label('Call connection interrupted', this.configuration.relayConfigured
              ? 'Try Reconnect call. Check both devices’ network connections; text chat can continue.'
              : 'Try Reconnect call. Some networks require a TURN relay; see README for setup. Text chat can continue.');
          }
          this.renderRemote();
        },
        onError: e => {
          if (this.peer !== peer) return;
          this.label('Call needs to reconnect', e.message + ' Use Reconnect call; text chat can continue.');
        }
      });
      this.peer = peer;
      Promise.all(this.local.getTracks().map(t => peer.setTrack(t.kind, t)))
        .then(() => { if (this.peer === peer) return peer.start(); })
        .catch(e => { if (this.peer === peer) this.label('Call needs to reconnect', e.message); });
      this.sendMedia();
    }

    flags() {
      return {
        video: this.local.getVideoTracks().some(t => t.readyState === 'live' && t.enabled),
        audio: this.local.getAudioTracks().some(t => t.readyState === 'live' && t.enabled)
      };
    }

    sendMedia() {
      if (this.peer) this.peer.signal({ type: 'media', ...this.flags() });
    }

    renderLocal() {
      const flags = this.flags();
      this.localVideo.hidden = !flags.video;
      const placeholder = document.getElementById('local-placeholder');
      placeholder.hidden = flags.video;
      placeholder.style.display = flags.video ? 'none' : 'flex';
      placeholder.querySelector(':scope > span:last-child').textContent = flags.audio ? 'You · mic on, camera off' : 'You · camera & mic off';
      for (const kind of ['video', 'audio']) {
        const button = document.getElementById(kind === 'video' ? 'camera-toggle' : 'mic-toggle');
        const name = kind === 'video' ? 'camera' : 'microphone';
        button.setAttribute('aria-pressed', String(flags[kind]));
        button.setAttribute('aria-label', (flags[kind] ? 'Turn off ' : 'Turn on ') + name);
        button.title = button.getAttribute('aria-label');
      }
    }

    renderRemote() {
      const track = this.remote.getVideoTracks()[0];
      const visible = this.remoteFlags.video && track && track.readyState === 'live' && !track.muted && this.peer?.pc.connectionState === 'connected';
      this.remoteVideo.hidden = !visible;
      document.getElementById('remote-placeholder').hidden = !!visible;
      const hint = this.remoteFlags.video ? 'Connecting your partner’s video…' : this.remoteFlags.audio ? 'Your partner’s camera is off. Their microphone is on.' : 'Your partner’s camera and microphone are off.';
      document.getElementById('remote-hint').textContent = this.peer ? hint : 'Waiting for your partner to join this practice room.';
    }

    async play() {
      if (!this.peer || !this.remote.getTracks().length || !this.remoteFlags.audio && !this.remoteFlags.video) return;
      const peer = this.peer;
      try {
        await this.remoteVideo.play();
        document.getElementById('play-remote').hidden = true;
      } catch {
        if (this.peer === peer) document.getElementById('play-remote').hidden = false;
      }
    }

    async toggle(kind) {
      if (!this.isActive() || !this.readyForMedia) { notify('Wait for your practice room to connect first.', true); return; }
      if (!navigator.mediaDevices?.getUserMedia) { notify('Camera and microphone need localhost or HTTPS. Open the app securely, then try again.', true); return; }
      const button = document.getElementById(kind === 'video' ? 'camera-toggle' : 'mic-toggle');
      button.disabled = true;
      const generation = this.generation;
      try {
        const existing = this.local.getTracks().find(t => t.kind === kind);
        if (existing) {
          await this.peer?.setTrack(kind, null);
          existing.onended = null;
          existing.stop();
          this.local.removeTrack(existing);
        } else {
          const media = await navigator.mediaDevices.getUserMedia(kind === 'video'
            ? { video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }
            : { audio: { echoCancellation: true, noiseSuppression: true }, video: false });
          if (generation !== this.generation || !this.isActive() || !this.readyForMedia) { media.getTracks().forEach(t => t.stop()); return; }
          const track = media.getTracks()[0];
          this.local.addTrack(track);
          track.onended = () => {
            this.local.removeTrack(track);
            this.peer?.setTrack(kind, null).catch(() => {});
            this.renderLocal(); this.sendMedia();
            notify((kind === 'video' ? 'Camera' : 'Microphone') + ' disconnected.', true);
          };
          await this.peer?.setTrack(kind, track);
        }
        this.renderLocal(); this.sendMedia();
      } catch (e) {
        const device = kind === 'video' ? 'Camera' : 'Microphone';
        notify(e.name === 'NotAllowedError' ? device + ' permission was denied. Allow it in your browser’s site settings.' : device + ' is unavailable or in use by another app. You can still use chat.', true);
      } finally { button.disabled = false; }
    }

    closePeer() {
      this.peer?.close();
      this.peer = null; this.callId = null;
      this.remote.getTracks().forEach(t => { t.stop(); this.remote.removeTrack(t); });
      this.remoteFlags = { video: false, audio: false };
      document.getElementById('play-remote').hidden = true;
      this.renderRemote();
    }

    stop() {
      this.generation++;
      this.closePeer();
      this.local.getTracks().forEach(t => { t.onended = null; t.stop(); this.local.removeTrack(t); });
      this.renderLocal();
    }

    end() {
      this.stop();
      this.readyForMedia = false;
      this.socket?.emit('call:leave');
      this.label('Call ended', 'Camera and microphone are off.');
    }
  };
})();
