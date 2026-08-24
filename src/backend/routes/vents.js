const express = require('express');
const multer = require('multer');
const { Readable } = require('stream');
const Groq = require('groq-sdk');
const { query } = require('../db');
const auth = require('../middleware/auth');
const { classify } = require('../utils/riskClassifier');
const { stripHtml } = require('../utils/sanitizer');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
let _groq = null;
function getGroq() {
  if (!_groq) _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return _groq;
}

const MAX_VENT_LEN = 2000;
const router = express.Router();

// ─── POST /vents ──────────────────────────────────────────────────────────────
router.post('/', auth, async (req, res) => {
  const { content } = req.body;

  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return res.status(400).json({ error: 'content is required', code: 'MISSING_CONTENT' });
  }
  const cleanContent = stripHtml(content.trim());
  if (cleanContent.length === 0) {
    return res.status(400).json({ error: 'content is required', code: 'MISSING_CONTENT' });
  }
  if (cleanContent.length > MAX_VENT_LEN) {
    return res.status(400).json({ error: `content must be ${MAX_VENT_LEN} characters or fewer`, code: 'CONTENT_TOO_LONG' });
  }

  const riskResult = classify(cleanContent);
  const risk_flagged = riskResult ? ['critical', 'high'].includes(riskResult.severity) : false;

  const { rows } = await query(
    `INSERT INTO vents (user_id, content, risk_flagged)
     VALUES ($1, $2, $3) RETURNING id, created_at`,
    [req.user.id, cleanContent, risk_flagged]
  );

  // Passive admin alert on risk — category/keyword only, raw content never stored here.
  if (risk_flagged) {
    await query(
      `INSERT INTO notifications (user_id, type, payload, channel)
       SELECT id, 'emergency_alert', $1, 'in_app'
       FROM users WHERE role = 'admin' AND is_active = true`,
      [JSON.stringify({ source: 'vent_flag', category: riskResult.category, keyword: riskResult.keyword })]
    );
  }

  return res.status(201).json({ vent_id: rows[0].id, created_at: rows[0].created_at });
});

// ─── POST /vents/:id/promote ──────────────────────────────────────────────────
// User opts to save their vent to the journal. Creates a new journal entry;
// the vent record is retained for audit/safety purposes.
router.post('/:id/promote', auth, async (req, res) => {
  const { rows: ventRows } = await query(
    'SELECT content FROM vents WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );
  if (!ventRows.length) {
    return res.status(404).json({ error: 'Vent not found', code: 'NOT_FOUND' });
  }

  const { content } = ventRows[0];
  const riskResult = classify(content);
  const risk_flagged = riskResult ? ['critical', 'high'].includes(riskResult.severity) : false;

  const { rows } = await query(
    `INSERT INTO journals (user_id, content, risk_flagged) VALUES ($1, $2, $3) RETURNING id`,
    [req.user.id, content, risk_flagged]
  );

  return res.status(201).json({ journal_id: rows[0].id });
});

// ─── POST /vents/transcribe ───────────────────────────────────────────────────
// Accepts audio blob, returns transcript text. Audio is never persisted.
router.post('/transcribe', auth, upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'audio file required', code: 'MISSING_AUDIO' });

  const ext = (req.file.originalname?.split('.').pop() || 'webm').toLowerCase();
  const filename = `vent.${ext}`;

  try {
    // Groq Whisper expects a File-like object — wrap the buffer in a Readable with .name
    const audioFile = new File([req.file.buffer], filename, { type: req.file.mimetype || 'audio/webm' });
    const transcription = await getGroq().audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-large-v3-turbo',
      response_format: 'json',
    });

    const text = (transcription.text || '').trim().slice(0, 2000);

    // Run risk classification on the transcript — same safety path as text vents
    const riskResult = classify(text);
    const risk_flagged = riskResult ? ['critical', 'high'].includes(riskResult.severity) : false;
    if (risk_flagged) {
      await query(
        `INSERT INTO notifications (user_id, type, payload, channel)
         SELECT id, 'emergency_alert', $1, 'in_app'
         FROM users WHERE role = 'admin' AND is_active = true`,
        [JSON.stringify({ source: 'voice_vent_flag', category: riskResult.category, keyword: riskResult.keyword })]
      );
    }

    return res.status(200).json({ text });
  } catch (err) {
    console.error('[vents/transcribe] Groq error:', err.message);
    return res.status(502).json({ error: 'Transcription failed', code: 'TRANSCRIBE_ERROR' });
  }
});

module.exports = router;
