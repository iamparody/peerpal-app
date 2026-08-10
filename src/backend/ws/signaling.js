const { WebSocketServer, WebSocket } = require('ws');

// In-process room map: session_id → WebSocket[]
// Rooms have at most 2 peers (requester + responder).
const rooms = new Map();

// Contact-info screening — warn both parties, never block the message.
const CONTACT_PATTERNS = [
  { category: 'phone', pattern: /\b(\+?254|0)[17]\d{8}\b/ },           // Kenyan: 07xx / 01xx / +2547xx
  { category: 'phone', pattern: /\+\d[\d\s\-]{8,13}\d\b/ },            // International: +xx...
  { category: 'phone', pattern: /\b\d{3}[\s.\-]\d{3}[\s.\-]\d{4}\b/ }, // Formatted: 555-555-5555
  { category: 'email', pattern: /\b[a-zA-Z0-9._%+\-]{2,}@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b/ },
];

function detectContactInfo(text) {
  if (typeof text !== 'string') return null;
  for (const { category, pattern } of CONTACT_PATTERNS) {
    if (pattern.test(text)) return category;
  }
  return null;
}

function createSignalingServer(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws/signal' });

  wss.on('connection', (ws) => {
    let sessionId = null;

    ws.on('message', (data) => {
      let msg;
      try { msg = JSON.parse(data); } catch { return; }

      // First message must be a join with session_id — no user identity transmitted
      if (!sessionId) {
        if (msg.type !== 'join' || !msg.session_id) { ws.close(); return; }
        sessionId = msg.session_id;

        if (!rooms.has(sessionId)) rooms.set(sessionId, []);
        const peers = rooms.get(sessionId);

        if (peers.length >= 2) { ws.close(); return; }
        peers.push(ws);

        ws.on('close', () => {
          const current = rooms.get(sessionId);
          if (!current) return;
          const remaining = current.filter((c) => c !== ws);
          if (remaining.length === 0) {
            rooms.delete(sessionId);
          } else {
            rooms.set(sessionId, remaining);
            // Notify remaining participant that this peer disconnected
            const leaveMsg = JSON.stringify({ type: 'peer_left' });
            for (const peer of remaining) {
              if (peer.readyState === WebSocket.OPEN) peer.send(leaveMsg);
            }
          }
        });

        ws.send(JSON.stringify({ type: 'joined', peer_count: peers.length }));
        return;
      }

      // Screen chat messages for contact info — warn both parties, always relay.
      const peers = rooms.get(sessionId) || [];
      if (msg.type === 'chat' && msg.text) {
        const flagged = detectContactInfo(msg.text);
        if (flagged) {
          const warning = JSON.stringify({ type: 'contact_warning', category: flagged });
          for (const peer of peers) {
            if (peer.readyState === WebSocket.OPEN) peer.send(warning);
          }
        }
      }

      // Relay offer / answer / ICE candidates / chat to the other peer — no identity forwarded.
      for (const peer of peers) {
        if (peer !== ws && peer.readyState === WebSocket.OPEN) {
          peer.send(JSON.stringify(msg));
        }
      }
    });
  });

  return wss;
}

// STUN configuration to expose to clients via the session endpoint
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  // TURN server configured via env: TURN_URL, TURN_USERNAME, TURN_CREDENTIAL
  ...(process.env.TURN_URL
    ? [{ urls: process.env.TURN_URL, username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL }]
    : []),
];

module.exports = { createSignalingServer, ICE_SERVERS };
