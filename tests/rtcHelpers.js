const assert = require('node:assert/strict');
const rtc = require('@roamhq/wrtc');
const Peer = require('../public/js/peer-call')(rtc.RTCPeerConnection);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, label, timeout = 10000) {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeout) throw new Error('Timed out: ' + label);
    await pause(20);
  }
}

// These are actual encoded/decoded WebRTC media frames over a local peer
// connection, with the production browser peer class and real Socket.IO relay.
module.exports = async function verifyMedia({ learnerSocket, helperSocket, emit }) {
  const peers = {}, errors = [], sinks = [], tracks = [], intervals = [];
  const frames = { learner: [], helper: [] }, audio = { learner: 0, helper: 0 };
  const sources = {};
  for (const [role, socket] of [['learner', learnerSocket], ['helper', helperSocket]]) {
    socket.on('call:paired', pair => {
      peers[role]?.close();
      const peer = new Peer({
        configuration: { iceServers: [] }, initiator: pair.initiator,
        send: async signal => {
          const result = await emit(socket, 'call:signal', { callId: pair.callId, signal });
          if (result.error) throw new Error(result.error);
        },
        onTrack: event => {
          if (event.track.kind === 'video') {
            const sink = new rtc.nonstandard.RTCVideoSink(event.track);
            sink.onframe = ({ frame }) => frames[role].push(frame.data[0]); sinks.push(sink);
          } else {
            const sink = new rtc.nonstandard.RTCAudioSink(event.track);
            sink.ondata = data => { if (data.samples.some(v => v !== 0)) audio[role]++; }; sinks.push(sink);
          }
        },
        onError: e => errors.push(e.message)
      });
      peer.callId = pair.callId;
      peers[role] = peer;
      peer.start().catch(e => errors.push(e.message));
    });
    socket.on('call:signal', packet => {
      if (peers[role]?.callId === packet.callId) peers[role].receive(packet.signal);
    });
  }
  try {
    assert.equal((await emit(learnerSocket, 'call:ready', {})).ok, true);
    assert.equal((await emit(helperSocket, 'call:ready', {})).ok, true);
    await until(() => peers.learner?.pc.connectionState === 'connected' && peers.helper?.pc.connectionState === 'connected', 'both media peers connected');
    for (const [role, brightness] of [['learner', 50], ['helper', 170]]) {
      const source = new rtc.nonstandard.RTCVideoSource(), track = source.createTrack(); tracks.push(track);
      sources[role] = source;
      await peers[role].setTrack('video', track);
      const frame = new Uint8ClampedArray(32 * 32 * 1.5); frame.fill(128); frame.fill(brightness, 0, 32 * 32);
      intervals.push(setInterval(() => source.onFrame({ width: 32, height: 32, data: frame }), 33));
      const audioSource = new rtc.nonstandard.RTCAudioSource(), audioTrack = audioSource.createTrack(); tracks.push(audioTrack);
      await peers[role].setTrack('audio', audioTrack);
      const samples = new Int16Array(480); for (let i = 0; i < samples.length; i++) samples[i] = Math.round(Math.sin(i / 12) * 1500);
      intervals.push(setInterval(() => audioSource.onData({ samples, sampleRate: 48000, bitsPerSample: 16, channelCount: 1, numberOfFrames: 480 }), 10));
    }
    await until(() => frames.learner.some(v => Math.abs(v - 170) < 10) && frames.helper.some(v => Math.abs(v - 50) < 10), 'different remote video frames in both directions');
    await until(() => audio.learner > 3 && audio.helper > 3, 'remote audio in both directions');
    await peers.learner.setTrack('video', null);
    assert.equal(peers.learner.pc.getTransceivers().find(t => t.receiver.track.kind === 'video').sender.track, null);
    await peers.learner.setTrack('audio', null);
    assert.equal(peers.learner.pc.getTransceivers().find(t => t.receiver.track.kind === 'audio').sender.track, null);
    await pause(200);
    const before = frames.helper.length;
    const replacement = sources.learner.createTrack(); tracks.push(replacement);
    await peers.learner.setTrack('video', replacement);
    await until(() => frames.helper.length > before + 2, 'camera resumes without renegotiation');
    assert.deepEqual(errors, []);
  } catch (e) {
    e.message += ' | errors: ' + JSON.stringify(errors) + ' | states: ' + JSON.stringify(Object.fromEntries(Object.entries(peers).map(([name,p])=>[name,{connection:p.pc.connectionState,ice:p.pc.iceConnectionState,signaling:p.pc.signalingState,local:p.pc.localDescription?.type,remote:p.pc.remoteDescription?.type}])));
    throw e;
  } finally {
    intervals.forEach(clearInterval);
    sinks.forEach(sink => sink.stop());
    tracks.forEach(track => track.stop());
    Object.values(peers).forEach(peer => peer.close());
    learnerSocket.disconnect(); helperSocket.disconnect();
  }
};
