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

        // Tell already-connected peers a new participant arrived.
        // The voice screen uses this to know it should create the WebRTC offer.
        if (peers.length > 1) {
          const peerJoinedMsg = JSON.stringify({ type: 'peer_joined' });
          for (let i = 0; i < peers.length - 1; i++) {
            if (peers[i].readyState === WebSocket.OPEN) peers[i].send(peerJoinedMsg);
          }
        }

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

// ICE server list sent to clients.
// When TURN_USERNAME + TURN_CREDENTIAL are set (Metered.ca), all 4 relay entries are included
// for maximum NAT traversal coverage across mobile carriers.
const TURN_ENTRIES = (process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL)
  ? [
      { urls: 'stun:stun.relay.metered.ca:80' },
      { urls: 'turn:global.relay.metered.ca:80',                    username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL },
      { urls: 'turn:global.relay.metered.ca:80?transport=tcp',      username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL },
      { urls: 'turn:global.relay.metered.ca:443',                   username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL },
      { urls: 'turns:global.relay.metered.ca:443?transport=tcp',    username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL },
    ]
  : (process.env.TURN_URL
      ? [{ urls: process.env.TURN_URL, username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL }]
      : []);

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  ...TURN_ENTRIES,
];

module.exports = { createSignalingServer, ICE_SERVERS };
