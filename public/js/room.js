(() => {
  const room = document.getElementById("practice-room");
  if (!room) return;
  const sid = room.dataset.session,
    uid = room.dataset.user,
    partner = room.dataset.partner;
  const input = document.getElementById("chat-input"),
    send = document.getElementById("send-message");
  const messages = document.getElementById("messages"),
    connection = document.getElementById("connection-status");
  let endsAt = room.dataset.ends ? new Date(room.dataset.ends).getTime() : null;
  let status = room.dataset.status,
    offset = 0,
    socket,
    typingTimer,
    polling = false,
    entered = false,
    expiredLocally = false;
  const seen = new Set();
  const isActive = () =>
    status === "active" && (!endsAt || endsAt > Date.now() + offset);
  const call = new SpeakForwardCallUI({
    sessionId: sid,
    partnerId: partner,
    isActive,
  });

  function state(data) {
    status = data.status;
    if (data.endsAt) endsAt = new Date(data.endsAt).getTime();
    if (data.serverNow) offset = data.serverNow - Date.now();
    const extend = document.getElementById("extend-session");
    if (extend) extend.disabled = !!data.extensionUsed || !isActive();
    if (["completed", "cancelled"].includes(status)) {
      input.disabled = true;
      send.disabled = true;
      connection.textContent = "Practice " + status;
      document.getElementById("timer-label").textContent = status;
      document.getElementById("end-session").disabled = true;
      call.end();
      socket?.disconnect();
    }
    tick();
  }

  function tick() {
    const timer = document.getElementById("timer");
    if (status === "scheduled") {
      timer.textContent = "Not started";
      document.getElementById("timer-label").textContent = "scheduled";
      return;
    }
    if (["completed", "cancelled"].includes(status)) {
      timer.textContent = "Finished";
      return;
    }
    const remaining = Math.max(
      0,
      Math.ceil((endsAt - Date.now() - offset) / 1000),
    );
    timer.textContent =
      Math.floor(remaining / 60)
        .toString()
        .padStart(2, "0") +
      ":" +
      (remaining % 60).toString().padStart(2, "0");
    document.getElementById("timer-label").textContent = "practice time";
    if (!remaining && !expiredLocally) {
      expiredLocally = true;
      input.disabled = true;
      send.disabled = true;
      call.end();
    }
  }

  function add(message) {
    if (seen.has(String(message.id))) return;
    seen.add(String(message.id));
    const el = document.createElement("article");
    el.className = "message" + (message.senderId === uid ? " mine" : "");
    el.dataset.created = new Date(message.createdAt).getTime();
    const meta = document.createElement("div");
    meta.className = "message-meta";
    const name = document.createElement("span");
    name.textContent = message.senderId === uid ? "You" : message.name;
    const time = document.createElement("time");
    time.dateTime = message.createdAt;
    time.textContent = new Date(message.createdAt).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    meta.append(name, time);
    const text = document.createElement("p");
    text.textContent = message.text;
    el.append(meta, text);
    const later = [...messages.querySelectorAll(".message")].find(
      (m) => Number(m.dataset.created) > Number(el.dataset.created),
    );
    messages.insertBefore(el, later || null);
    messages.scrollTop = messages.scrollHeight;
  }

  async function connect() {
    if (entered) return;
    entered = true;
    try {
      state(await api("/api/sessions/" + sid + "/enter"));
      if (status !== "active") return;
      socket = io({
        auth: {
          csrf: document.querySelector('meta[name="csrf-token"]').content,
        },
      });
      call.attach(socket);
      socket.on("connect", () =>
        socket.emit("join", sid, async (reply) => {
          if (reply.error) {
            notify(reply.error, true);
            connection.textContent = "Unable to join";
            return;
          }
          connection.textContent = "Connected · private chat";
          input.disabled = false;
          send.disabled = false;
          await call.ready();
          try {
            (
              await api("/api/sessions/" + sid + "/messages", null, "GET")
            ).forEach(add);
          } catch (e) {
            notify(e.message, true);
          }
        }),
      );
      socket.on("chat:message", add);
      socket.on("session:update", state);
      socket.on("presence", (data) => {
        document.getElementById("partner-status").textContent =
          data.userIds.includes(partner) ? "Partner online" : "Partner offline";
      });
      socket.on("typing", (data) => {
        const el = document.getElementById("typing");
        el.textContent = data.name + " is typing…";
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => (el.textContent = ""), 1500);
      });
      socket.on("disconnect", () => {
        input.disabled = true;
        send.disabled = true;
        if (status === "active")
          connection.textContent = "Disconnected · reconnecting…";
      });
      socket.on("connect_error", (e) => {
        connection.textContent = "Connection unavailable";
        notify(e.message, true);
      });
    } catch (e) {
      entered = false;
      connection.textContent = "Waiting to enter";
      notify(e.message, true);
    }
  }

  async function poll() {
    if (polling) return;
    polling = true;
    try {
      state(await api("/api/sessions/" + sid, null, "GET"));
      if (
        !entered &&
        ["scheduled", "active"].includes(status) &&
        new Date(room.dataset.scheduled) <= Date.now() + offset
      )
        await connect();
    } catch (e) {
      connection.textContent = e.message;
      input.disabled = true;
      send.disabled = true;
      call.end();
      socket?.disconnect();
      entered = false;
    } finally {
      polling = false;
    }
  }

  document.getElementById("chat-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || !socket?.connected) return;
    send.disabled = true;
    socket.timeout(7000).emit("chat:send", { text }, (error, reply) => {
      send.disabled = !isActive();
      if (error || reply?.error) {
        notify(
          reply?.error ||
            "Message not confirmed. Check the chat before retrying.",
          true,
        );
        return;
      }
      input.value = "";
      input.focus();
    });
  });
  input.addEventListener("input", () => socket?.emit("typing"));
  document
    .getElementById("extend-session")
    ?.addEventListener("click", async (e) => {
      e.currentTarget.disabled = true;
      try {
        await api("/api/sessions/" + sid + "/extend");
        notify("Five more minutes, for both of you.");
      } catch (err) {
        notify(err.message, true);
      }
      await poll();
    });
  document.getElementById("end-session").addEventListener("click", async () => {
    if (!confirm("End this practice for both participants?")) return;
    try {
      await api("/api/sessions/" + sid + "/end");
      call.end();
      location.href = "/dashboard";
    } catch (e) {
      notify(e.message, true);
    }
  });
  document.getElementById("leave-room").addEventListener("click", async () => {
    if (["completed", "cancelled"].includes(status)) {
      call.end();
      location.href = "/dashboard";
      return;
    }
    if (
      !confirm(
        "Leave and cancel this session? It will not count toward either tally.",
      )
    )
      return;
    try {
      await api("/api/sessions/" + sid + "/end", { cancel: true });
      call.end();
      location.href = "/dashboard";
    } catch (e) {
      notify(e.message, true);
    }
  });
  const prompts = [
    "What’s a place you’d love to visit, and why?",
    "Tell me about a food that reminds you of home.",
    "What does a perfect weekend look like to you?",
    "Teach me a useful phrase in your language.",
    "What’s something you’ve learned recently?",
  ];
  let promptIndex = 0;
  document
    .getElementById("next-prompt")
    .addEventListener(
      "click",
      () =>
        (document.getElementById("conversation-prompt").textContent =
          prompts[promptIndex++ % prompts.length]),
    );
  const countdown = setInterval(tick, 1000),
    refresh = setInterval(poll, 4000);
  window.addEventListener("pagehide", () => {
    call.end();
    socket?.disconnect();
    clearInterval(countdown);
    clearInterval(refresh);
  });
  poll();
})();
