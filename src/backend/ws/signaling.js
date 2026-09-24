const { WebSocketServer, WebSocket } = require('ws');
const { query } = require('../db');

// In-process room map: session_id → WebSocket[]
// Rooms have at most 2 peers (requester + responder).
const rooms = new Map();

// Therapy room map: booking_id → { member: WebSocket|null, therapist: WebSocket|null }
// Isolated from peer rooms — prefixed 'therapy:' in session_id.
const therapyRooms = new Map();

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
  console.log('[signal] server ready — ICE servers:', JSON.stringify(ICE_SERVERS.map(s => s.urls)));

  // ─── Therapy room handler ─────────────────────────────────────────────────
  async function handleTherapyJoin(ws, booking_id, participant_role) {
    // Validate booking exists and is in a joinable state
    const { rows } = await query(
      `SELECT id, status, ended_at FROM therapy_sessions ts
       JOIN therapist_bookings tb ON tb.id = ts.booking_id
       WHERE ts.booking_id = $1
         AND tb.status IN ('confirmed','in_progress')`,
      [booking_id]
    );

    if (!rows.length) {
      ws.send(JSON.stringify({ type: 'error', code: 'INVALID_ROOM', message: 'Booking not found or not joinable' }));
      ws.close();
      return;
    }

    if (rows[0].ended_at) {
      ws.send(JSON.stringify({ type: 'error', code: 'SESSION_ENDED', message: 'Session has already ended' }));
      ws.close();
      return;
    }

    if (!therapyRooms.has(booking_id)) {
      therapyRooms.set(booking_id, { member: null, therapist: null });
    }

    const room = therapyRooms.get(booking_id);
    const short = booking_id.slice(0, 8);

    if (participant_role !== 'member' && participant_role !== 'therapist') {
      ws.close();
      return;
    }

    if (room[participant_role]) {
      // Already connected — replace stale connection
      try { room[participant_role].close(); } catch {}
    }

    room[participant_role] = ws;
    const other_role = participant_role === 'member' ? 'therapist' : 'member';
    console.log(`[therapy] room=${short} ${participant_role} joined`);

    // Notify other participant if connected
    if (room[other_role]?.readyState === WebSocket.OPEN) {
      room[other_role].send(JSON.stringify({ type: 'peer_joined', role: participant_role }));
    }

    ws.send(JSON.stringify({ type: 'joined', role: participant_role, other_connected: Boolean(room[other_role]) }));

    ws.on('message', (data) => {
      let msg;
      try { msg = JSON.parse(data); } catch { return; }

      // Therapist sends 'end' to close the room immediately
      if (msg.type === 'end' && participant_role === 'therapist') {
        console.log(`[therapy] room=${short} ended by therapist`);
        // Notify member
        if (room.member?.readyState === WebSocket.OPEN) {
          room.member.send(JSON.stringify({ type: 'session_ended' }));
          room.member.close();
        }
        // Update ended_at in DB (best-effort — cron also closes stale sessions)
        query(
          'UPDATE therapy_sessions SET ended_at = NOW() WHERE booking_id = $1 AND ended_at IS NULL',
          [booking_id]
        ).catch((err) => console.error('[therapy] ended_at update failed:', err.message));
        ws.close();
        therapyRooms.delete(booking_id);
        return;
      }

      // Relay offer / answer / ICE / chat to the other participant only
      const other = room[other_role];
      if (other?.readyState === WebSocket.OPEN) {
        other.send(JSON.stringify(msg));
      }
    });

    ws.on('close', () => {
      const current = therapyRooms.get(booking_id);
      if (!current) return;
      if (current[participant_role] === ws) {
        current[participant_role] = null;
        console.log(`[therapy] room=${short} ${participant_role} disconnected`);
        if (current[other_role]?.readyState === WebSocket.OPEN) {
          current[other_role].send(JSON.stringify({ type: 'peer_left', role: participant_role }));
        }
        // Clean up empty rooms
        if (!current.member && !current.therapist) {
          therapyRooms.delete(booking_id);
          console.log(`[therapy] room=${short} empty — deleted`);
        }
      }
    });

    ws.on('error', (err) => {
      console.log(`[therapy] ws error room=${short}:`, err.message);
    });
  }

  // ─── Peer + therapy connection handler ────────────────────────────────────
  wss.on('connection', (ws, req) => {
    let sessionId = null;
    console.log('[signal] new connection from', req.socket.remoteAddress);

    ws.on('message', (data) => {
      let msg;
      try { msg = JSON.parse(data); } catch { return; }

      // First message must be a join with session_id — no user identity transmitted
      if (!sessionId) {
        if (msg.type !== 'join' || !msg.session_id) { ws.close(); return; }
        sessionId = msg.session_id;

        // Route therapy rooms to isolated namespace — requires booking_id + role
        if (sessionId.startsWith('therapy:')) {
          const booking_id = sessionId.slice('therapy:'.length);
          const participant_role = msg.role; // 'member' or 'therapist'
          handleTherapyJoin(ws, booking_id, participant_role).catch((err) => {
            console.error('[therapy] join error:', err.message);
            ws.close();
          });
          return; // therapy handler owns this connection from here on
        }
        const short = sessionId.slice(0, 8);

        if (!rooms.has(sessionId)) rooms.set(sessionId, []);
        const peers = rooms.get(sessionId);

        if (peers.length >= 2) {
          console.log(`[signal] room=${short} FULL — rejecting 3rd peer`);
          ws.close();
          return;
        }
        peers.push(ws);
        console.log(`[signal] room=${short} peer joined — count=${peers.length}`);

        // Tell already-connected peers a new participant arrived.
        // The voice screen uses this to know it should create the WebRTC offer.
        if (peers.length > 1) {
          const peerJoinedMsg = JSON.stringify({ type: 'peer_joined' });
          let sent = 0;
          for (let i = 0; i < peers.length - 1; i++) {
            if (peers[i].readyState === WebSocket.OPEN) { peers[i].send(peerJoinedMsg); sent++; }
          }
          console.log(`[signal] room=${short} peer_joined sent to ${sent} peer(s)`);
        }

        ws.on('close', (code) => {
          const current = rooms.get(sessionId);
          if (!current) return;
          const remaining = current.filter((c) => c !== ws);
          if (remaining.length === 0) {
            rooms.delete(sessionId);
            console.log(`[signal] room=${short} empty — deleted (close code=${code})`);
          } else {
            rooms.set(sessionId, remaining);
            console.log(`[signal] room=${short} peer left — remaining=${remaining.length}`);
            const leaveMsg = JSON.stringify({ type: 'peer_left' });
            for (const peer of remaining) {
              if (peer.readyState === WebSocket.OPEN) peer.send(leaveMsg);
            }
          }
        });

        ws.send(JSON.stringify({ type: 'joined', peer_count: peers.length }));
        return;
      }

      const short = sessionId.slice(0, 8);

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

      if (['offer', 'answer', 'ice'].includes(msg.type)) {
        console.log(`[signal] room=${short} relay ${msg.type}`);
      }

      // Relay offer / answer / ICE candidates / chat to the other peer — no identity forwarded.
      for (const peer of peers) {
        if (peer !== ws && peer.readyState === WebSocket.OPEN) {
          peer.send(JSON.stringify(msg));
        }
      }
    });

    ws.on('error', (err) => {
      console.log(`[signal] ws error room=${sessionId?.slice(0, 8) ?? 'unknown'}:`, err.message);
    });
  });

  // Keepalive: ping every 25 s so Render's 30 s idle proxy timeout never fires.
  const keepalive = setInterval(() => {
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) client.ping();
    });
  }, 25000);

  wss.on('close', () => clearInterval(keepalive));

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
