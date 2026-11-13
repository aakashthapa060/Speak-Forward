const crypto = require('crypto');

// Media travels browser-to-browser. This module only relays bounded connection
// metadata between the two authenticated participants of an active practice.
module.exports = function callSignaling(io, guard) {
  const rooms = new Map();

  function detach(socket) {
    const sid = socket.data.callRoom;
    const room = rooms.get(sid);
    socket.data.callRoom = null;
    if (!room || room.members.get(socket.data.userId)?.id !== socket.id) return;
    room.members.delete(socket.data.userId);
    room.callId = null;
    for (const peer of room.members.values()) peer.emit('call:peer-left');
    if (!room.members.size) rooms.delete(sid);
  }

  function validate(data) {
    if (!data || typeof data !== 'object') throw new Error('Invalid call signal.');
    if (['offer', 'answer'].includes(data.type)) {
      if (typeof data.sdp !== 'string' || data.sdp.length < 1 || data.sdp.length > 65536) throw new Error('Invalid session description.');
      return { type: data.type, sdp: data.sdp };
    }
    if (data.type === 'candidate') {
      const c = data.candidate;
      if (!c || typeof c.candidate !== 'string' || c.candidate.length > 4096 ||
          !(c.sdpMid == null || typeof c.sdpMid === 'string' && c.sdpMid.length < 80) ||
          !(c.sdpMLineIndex == null || Number.isInteger(c.sdpMLineIndex) && c.sdpMLineIndex >= 0 && c.sdpMLineIndex < 16) ||
          !(c.usernameFragment == null || typeof c.usernameFragment === 'string' && c.usernameFragment.length < 256)) throw new Error('Invalid ICE candidate.');
      return { type: 'candidate', candidate: { candidate: c.candidate, sdpMid: c.sdpMid ?? null, sdpMLineIndex: c.sdpMLineIndex ?? null, usernameFragment: c.usernameFragment } };
    }
    if (data.type === 'media' && typeof data.video === 'boolean' && typeof data.audio === 'boolean') return { type: 'media', video: data.video, audio: data.audio };
    throw new Error('Unknown call signal.');
  }

  function attach(socket) {
    let windowStart = Date.now(), count = 0, lastReady = 0;
    socket.on('call:ready', async (_payload, callback) => {
      const ack = typeof callback === 'function' ? callback : () => {};
      try {
        if (Date.now() - lastReady < 500) throw new Error('Please wait before reconnecting.');
        lastReady = Date.now();
        const sid = socket.data.room;
        if (!sid) throw new Error('Join your practice first.');
        const session = await guard(socket, sid);
        if (socket.data.callRoom && socket.data.callRoom !== sid) detach(socket);
        let room = rooms.get(sid);
        if (!room) { room = { members: new Map(), callId: null }; rooms.set(sid, room); }
        const previous = room.members.get(socket.data.userId);
        if (previous && previous.id !== socket.id) {
          previous.data.callRoom = null;
          previous.emit('call:replaced');
        }
        room.members.set(socket.data.userId, socket);
        socket.data.callRoom = sid;
        if (room.members.size === 2) {
          room.callId = crypto.randomUUID();
          for (const peer of room.members.values()) {
            peer.emit('call:paired', {
              callId: room.callId,
              initiator: peer.data.userId === String(session.helperId),
              peerUserId: [...room.members.keys()].find(id => id !== peer.data.userId)
            });
          }
        }
        ack({ ok: true });
      } catch (e) { ack({ error: e.message }); }
    });

    socket.on('call:signal', async (payload, callback) => {
      const ack = typeof callback === 'function' ? callback : () => {};
      try {
        if (Date.now() - windowStart > 10000) { windowStart = Date.now(); count = 0; }
        if (++count > 200) throw new Error('Too many call signals.');
        const sid = socket.data.callRoom;
        if (!sid || sid !== socket.data.room) throw new Error('Join the call first.');
        await guard(socket, sid);
        const room = rooms.get(sid);
        if (!room || !room.callId || room.callId !== payload?.callId || room.members.get(socket.data.userId)?.id !== socket.id) throw new Error('This call connection has expired.');
        const signal = validate(payload.signal);
        for (const [uid, peer] of room.members) {
          if (uid !== socket.data.userId) peer.emit('call:signal', { callId: room.callId, from: socket.data.userId, signal });
        }
        ack({ ok: true });
      } catch (e) { ack({ error: e.message }); }
    });
    socket.on('call:leave', () => detach(socket));
    socket.on('disconnect', () => detach(socket));
  }
  return { attach, detach };
};
