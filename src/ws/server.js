import { WebSocket, WebSocketServer } from "ws";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isValidMatchId = (matchId) =>
  typeof matchId === "string" && UUID_RE.test(matchId);

const matchSubscribers = new Map();

const subscribe = (matchId, socket) => {
  if (!matchSubscribers.has(matchId)) {
    matchSubscribers.set(matchId, new Set());
  }

  matchSubscribers.get(matchId).add(socket);
};

const unsubscribe = (matchId, socket) => {
  const subscribers = matchSubscribers.get(matchId);
  if (!subscribers) return;

  subscribers.delete(socket);

  if (subscribers.size === 0) {
    matchSubscribers.delete(matchId);
  }
};

const cleanupSubscriptions = (socket) => {
  for (const matchId of socket.subscriptions) {
    unsubscribe(matchId, socket);
  }
};

const broadcastToMatch = (matchId, payload) => {
  const subscribers = matchSubscribers.get(matchId);

  if (!subscribers || subscribers.size === 0) return;

  const message = JSON.stringify(payload);

  for (const client of subscribers) {
    if (client.readyState !== WebSocket.OPEN) continue;

    client.send(message);
  }
};

const broadcastToAll = (wss, payload) => {
  for (const client of wss.clients) {
    if (client.readyState !== WebSocket.OPEN) continue;

    client.send(JSON.stringify(payload));
  }
};

const sendJson = (socket, payload) => {
  if (socket.readyState !== WebSocket.OPEN) return;

  socket.send(JSON.stringify(payload));
};

const handleMessage = (socket, data) => {
  let message;
  try {
    message = JSON.parse(data.toString());
  } catch {
    sendJson(socket, { type: "error", message: "Invalid JSON" });
    return;
  }

  if (message?.type === "subscribe" && isValidMatchId(message.matchId)) {
    subscribe(message.matchId, socket);
    socket.subscriptions.add(message.matchId);
    sendJson(socket, { type: "subscribed", matchId: message.matchId });
    return;
  }

  if (message?.type === "unsubscribe" && isValidMatchId(message.matchId)) {
    unsubscribe(message.matchId, socket);
    socket.subscriptions.delete(message.matchId);
    sendJson(socket, { type: "unsubscribed", matchId: message.matchId });
    return;
  }

  sendJson(socket, { type: "error", message: "Unknown message type" });
};

export const attachWebSocketServer = (server) => {
  const wss = new WebSocketServer({
    server,
    path: "/ws",
    maxPayload: 1024 * 1024,
  });

  wss.on("connection", (socket) => {
    socket.isAlive = true;
    socket.on("pong", () => {
      socket.isAlive = true;
    });

    socket.subscriptions = new Set();

    sendJson(socket, { type: "welcome" });

    socket.on("message", (data) => {
      handleMessage(socket, data);
    });

    socket.on("error", (err) => {
      console.error(err);
      socket.terminate();
    });

    socket.on("close", () => {
      cleanupSubscriptions(socket);
    });
  });

  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);
  wss.on("close", () => {
    clearInterval(interval);
  });

  const broadcastMatchCreated = (match) => {
    broadcastToAll(wss, {
      type: "match_created",
      data: match,
    });
  };

  const broadcastCommentary = (matchId, commentary) => {
    broadcastToMatch(matchId, {
      type: "commentary",
      data: commentary,
    });
  };

  return { broadcastMatchCreated, broadcastCommentary };
};
