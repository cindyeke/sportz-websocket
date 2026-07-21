import { WebSocket, WebSocketServer } from "ws";

const sendJson = (socket, payload) => {
  if (socket.readyState !== WebSocket.OPEN) return;

  socket.send(JSON.stringify(payload));
};

const broadcast = (wss, payload) => {
  for (const client of wss.clients) {
    if (client.readyState !== WebSocket.OPEN) continue;

    client.send(JSON.stringify(payload));
  }
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
    sendJson(socket, { type: "welcome" });

    socket.on("error", console.error);
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
    broadcast(wss, {
      type: "match_created",
      data: match,
    });
  };

  return { broadcastMatchCreated };
};
