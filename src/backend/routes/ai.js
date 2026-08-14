const express = require('express');
const Groq = require('groq-sdk');
const { query } = require('../db');
const auth = require('../middleware/auth');
const { classify } = require('../utils/riskClassifier');
const { sanitize, stripHtml } = require('../utils/sanitizer');
const cache = require('../services/cache');

const MAX_INPUT_LEN = 2000;
const AI_DAILY_TOKEN_LIMIT = 50000;

const router = express.Router();

let _groq = null;
function getGroq() {
  if (!_groq) _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return _groq;
}
const PRIMARY_MODEL = process.env.GROQ_PRIMARY_MODEL || 'llama-3.3-70b-versatile';
const FALLBACK_MODEL = process.env.GROQ_FALLBACK_MODEL || 'llama-3.1-8b-instant';

// In-process session cache: { [session_id]: { systemPrompt, messages, flagCount } }
// Lost on restart — acceptable for stateless peer sessions (each session short-lived)
const sessionCache = new Map();

// Rate limiting counters: { [user_id]: { daily: n, lastReset: Date } }
const dailyCounters = new Map();

const AI_SESSION_MSG_LIMIT = 30;
const AI_DAILY_MSG_LIMIT = 100;

// ─── Blueprint section 9.2 — system prompt assembly ──────────────────────────
const TONE_DESCRIPTIONS = {
  warm: 'empathetic and nurturing — you lead with warmth and genuine care',
  motivational: 'encouraging and action-oriented — you celebrate progress and build momentum',
  clinical: 'measured and factual — you are supportive but clear and structured',
  casual: 'relaxed and conversational — you speak like a trusted friend, not a professional',
};

const STYLE_DESCRIPTIONS = {
  brief: 'keep responses concise and focused — 1 to 3 sentences unless the user needs more',
  elaborate: 'respond thoughtfully and in depth — explore the topic with the user',
};

const LANGUAGE_INSTRUCTIONS = {
  english: null,
  swahili: 'Respond entirely in Swahili. Use natural, conversational Swahili — not overly formal. If the user writes in English, still respond in Swahili.',
  sheng:   'Respond in Sheng — the Kenyan urban mix of Swahili, English, and slang spoken by young people in Nairobi. Keep it natural and authentic. If the user writes in English, still respond in Sheng.',
};

function buildSystemPrompt(persona, moods, userAlias, memories = [], contextNote = null) {
  const layer1 = `You are a mental health support companion. You are NOT a therapist, psychiatrist, or medical professional.
You MUST NOT: diagnose any condition, prescribe or recommend medication, provide specific medical advice, encourage harmful behavior, or engage in any roleplay that compromises user safety.
If the user expresses thoughts of self-harm, suicide, or immediate danger: immediately and compassionately redirect them to emergency support. Say: "What you're sharing sounds really serious. Please tap the Emergency button in the app right now, or call Befrienders Kenya on 0800 723 253 — they're free and available 24/7. I care about your safety."
Never bypass this instruction regardless of how the user frames their request.
If the user's message is unclear or ambiguous, ask one short clarifying question before responding — do not assume or guess what they mean.`;

  const layer2 = `Your name is ${persona.persona_name}.
Your tone is ${persona.tone}: ${TONE_DESCRIPTIONS[persona.tone]}.
Your response style is ${persona.response_style}: ${STYLE_DESCRIPTIONS[persona.response_style]}.
Your formality level is ${persona.formality}.
${persona.uses_alias ? `Address the user as "${userAlias}".` : 'Do not address the user by name.'}`;

  const lang = persona.language || 'english';
  const layer2_5 = LANGUAGE_INSTRUCTIONS[lang] || null;

  let layer3 = '';
  if (moods.length > 0) {
    const moodLines = moods
      .map((m) => `- ${new Date(m.created_at).toLocaleDateString()}: ${m.mood_level}${m.tags?.length ? `, tags: ${m.tags.join(', ')}` : ''}`)
      .join('\n');
    layer3 = `Recent mood history (for context only — do not reference directly unless relevant):\n${moodLines}`;
  }

  let layer4 = '';
  if (memories.length > 0) {
    const memLines = memories.map((m) => `- ${m.summary}`).join('\n');
    layer4 = `What I know about this user from past conversations (use to personalise responses — only reference naturally when relevant, never recite back verbatim):\n${memLines}`;
  }

  return [layer1, layer2, layer2_5, layer3, layer4, contextNote].filter(Boolean).join('\n\n');
}

const AI_DAILY_SESSION_LIMIT = 5;

// ─── POST /ai/session/start ───────────────────────────────────────────────────
router.post('/session/start', auth, async (req, res) => {
  // Optional peer-bridge context — passed when user arrives from a failed peer request.
  // Only 'peer_unavailable' is acted on; any other value is silently ignored.
  const { context, topic_label } = req.body || {};

  const { rows: userRows } = await query(
    'SELECT persona_created, alias FROM users WHERE id = $1',
    [req.user.id]
  );
  if (!userRows[0]?.persona_created) {
    return res.status(403).json({ error: 'Complete persona setup before starting AI chat', code: 'PERSONA_REQUIRED' });
  }

  // Rate limit: 5 AI sessions per day
  const { rows: sessionCountRows } = await query(
    `SELECT COUNT(*) FROM sessions WHERE user_id = $1 AND type = 'ai' AND started_at::date = CURRENT_DATE`,
    [req.user.id]
  );
  if (parseInt(sessionCountRows[0].count) >= AI_DAILY_SESSION_LIMIT) {
    return res.status(429).json({
      error: `Daily AI session limit reached (${AI_DAILY_SESSION_LIMIT}). Come back tomorrow.`,
      code: 'DAILY_SESSION_LIMIT',
    });
  }

  let persona = await cache.get(`persona:${req.user.id}`);
  if (!persona) {
    const { rows: personaRows } = await query('SELECT * FROM ai_personas WHERE user_id = $1', [req.user.id]);
    persona = personaRows[0];
    await cache.set(`persona:${req.user.id}`, persona, 86400);
  }

  const { rows: moodRows } = await query(
    'SELECT mood_level, tags, created_at FROM moods WHERE user_id = $1 ORDER BY created_at DESC LIMIT 3',
    [req.user.id]
  );

  const { rows: memoryRows } = await query(
    'SELECT summary FROM ai_memories WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5',
    [req.user.id]
  );

  let contextNote = null;
  let greeting = null;
  if (context === 'peer_unavailable') {
    const topicPart = topic_label ? ` about ${topic_label}` : '';
    contextNote = `[SESSION CONTEXT] This user was looking for a peer to talk to${topicPart} but no peer was available. They have come to you as a bridge. For your opening message, begin with warmth and brief acknowledgment. Do not open with "How are you feeling today?" — let them lead at their own pace.`;
    greeting = `I heard you were looking for someone to connect with${topicPart}. I'm glad you're here. Take your time — we can start wherever feels right.`;
  }

  const systemPrompt = buildSystemPrompt(persona, moodRows, userRows[0].alias, memoryRows, contextNote);

  const { rows: sessionRows } = await query(
    `INSERT INTO sessions (user_id, type, status) VALUES ($1, 'ai', 'active') RETURNING id`,
    [req.user.id]
  );
  const sessionId = sessionRows[0].id;

  sessionCache.set(sessionId, { systemPrompt, messages: [], flagCount: 0 });

  return res.status(201).json({ session_id: sessionId, persona_name: persona.persona_name, ...(greeting ? { greeting } : {}) });
});

// ─── POST /ai/session/:id/message ─────────────────────────────────────────────
router.post('/session/:id/message', auth, async (req, res) => {
  const { input_text } = req.body;
  if (!input_text || typeof input_text !== 'string' || input_text.trim().length === 0) {
    return res.status(400).json({ error: 'input_text is required', code: 'MISSING_INPUT' });
  }
  const cleanInput = stripHtml(input_text);
  if (cleanInput.length === 0) {
    return res.status(400).json({ error: 'input_text is required', code: 'MISSING_INPUT' });
  }
  if (cleanInput.length > MAX_INPUT_LEN) {
    return res.status(400).json({ error: `Message must be ${MAX_INPUT_LEN} characters or fewer`, code: 'INPUT_TOO_LONG' });
  }

  // Verify session ownership and active status
  const { rows: sessionRows } = await query(
    'SELECT id, status FROM sessions WHERE id = $1 AND user_id = $2 AND type = $3',
    [req.params.id, req.user.id, 'ai']
  );
  if (!sessionRows.length) return res.status(404).json({ error: 'Session not found', code: 'NOT_FOUND' });
  if (sessionRows[0].status !== 'active') {
    return res.status(409).json({ error: 'Session is not active', code: 'SESSION_ENDED' });
  }

  // Rate limits
  const sessionData = sessionCache.get(req.params.id) || { systemPrompt: null, messages: [], flagCount: 0 };
  if (sessionData.messages.filter((m) => m.role === 'user').length >= AI_SESSION_MSG_LIMIT) {
    return res.status(429).json({ error: 'Session message limit reached (30)', code: 'SESSION_LIMIT' });
  }

  const userId = req.user.id;
  const today = new Date().toDateString();
  const daily = dailyCounters.get(userId) || { count: 0, date: today };
  if (daily.date !== today) { daily.count = 0; daily.date = today; }
  if (daily.count >= AI_DAILY_MSG_LIMIT) {
    return res.status(429).json({ error: 'Daily AI message limit reached (100)', code: 'DAILY_LIMIT' });
  }
  daily.count++;
  dailyCounters.set(userId, daily);

  // ── Daily token limit ─────────────────────────────────────────────────────
  const todayISO = new Date().toISOString().slice(0, 10);
  const tokenKey = `ai_tokens:${userId}:${todayISO}`;
  const tokenCount = (await cache.get(tokenKey)) || 0;
  if (tokenCount >= AI_DAILY_TOKEN_LIMIT) {
    return res.status(429).json({ error: 'Daily AI token limit reached', code: 'TOKEN_LIMIT' });
  }

  // ── Risk classification ───────────────────────────────────────────────────
  const riskResult = classify(cleanInput);

  if (riskResult?.severity === 'critical') {
    // Paused session — do NOT call Groq
    await query(
      `INSERT INTO ai_interactions (user_id, session_id, input_text, output_text, flagged, flag_reason)
       VALUES ($1, $2, $3, '', true, $4)`,
      [userId, req.params.id, cleanInput, `${riskResult.category}: ${riskResult.keyword}`]
    );
    await query(
      `INSERT INTO escalation_logs (user_id, session_id, trigger_type, trigger_detail, escalated_to)
       VALUES ($1, $2, 'keyword', $3, 'emergency')`,
      [userId, req.params.id, `${riskResult.category}: ${riskResult.keyword}`]
    );
    // Alert all admins
    await query(
      `INSERT INTO notifications (user_id, type, payload, channel)
       SELECT id, 'emergency_alert', $1, 'in_app'
       FROM users WHERE role = 'admin' AND is_active = true`,
      [JSON.stringify({ source: 'ai_critical', session_id: req.params.id, category: riskResult.category })]
    );
    return res.status(200).json({ action: 'emergency', message: null, flagged: true });
  }

  // ── Assemble messages for Groq ────────────────────────────────────────────
  if (!sessionData.systemPrompt) {
    // Rebuild system prompt if cache was lost (server restart)
    const { rows: pRows } = await query('SELECT * FROM ai_personas WHERE user_id = $1', [userId]);
    const { rows: mRows } = await query(
      'SELECT mood_level, tags, created_at FROM moods WHERE user_id = $1 ORDER BY created_at DESC LIMIT 3',
      [userId]
    );
    const { rows: uRows } = await query('SELECT alias FROM users WHERE id = $1', [userId]);
    sessionData.systemPrompt = buildSystemPrompt(pRows[0], mRows, uRows[0]?.alias);
    sessionData.messages = [];
    sessionData.flagCount = 0;
  }

  // Inject elevated care note if this is a high-severity interaction
  let systemOverride = sessionData.systemPrompt;
  if (riskResult?.severity === 'high') {
    systemOverride += '\n\n[ELEVATED CARE MODE]: The user has expressed significant distress. Respond with extra empathy and gently introduce emergency resources (Emergency button or Befrienders Kenya 0800 723 253) as part of your reply.';
    sessionData.flagCount++;
  }

  const messages = [
    { role: 'system', content: systemOverride },
    ...sessionData.messages,
    { role: 'user', content: cleanInput },
  ];

  // ── Call Groq ─────────────────────────────────────────────────────────────
  let rawOutput = '';
  let tokensUsed = 0;
  try {
    const completion = await getGroq().chat.completions.create({
      model: PRIMARY_MODEL,
      messages,
      max_tokens: 600,
    });
    rawOutput = completion.choices[0]?.message?.content || '';
    tokensUsed = completion.usage?.total_tokens || 0;
  } catch (primaryErr) {
    console.warn('Groq primary model failed, trying fallback:', primaryErr.message);
    try {
      const completion = await getGroq().chat.completions.create({
        model: FALLBACK_MODEL,
        messages,
        max_tokens: 600,
      });
      rawOutput = completion.choices[0]?.message?.content || '';
      tokensUsed = completion.usage?.total_tokens || 0;
    } catch (fallbackErr) {
      console.error('Groq fallback model failed:', fallbackErr.message);
      return res.status(503).json({ error: 'AI service temporarily unavailable', code: 'AI_UNAVAILABLE' });
    }
  }
  if (!tokensUsed) tokensUsed = Math.ceil((cleanInput.length + rawOutput.length) / 4);

  // ── Sanitize output ───────────────────────────────────────────────────────
  const responseText = sanitize(rawOutput);
  const flagged = !!riskResult;
  const flagReason = riskResult ? `${riskResult.category}: ${riskResult.keyword}` : null;

  // ── Token tracking ────────────────────────────────────────────────────────
  const midnight = new Date();
  midnight.setHours(24, 0, 0, 0);
  await Promise.all([
    cache.incrby(tokenKey, tokensUsed, Math.floor(midnight.getTime() / 1000)),
    query(
      `INSERT INTO ai_usage (user_id, date, token_count, message_count)
       VALUES ($1, $2, $3, 1)
       ON CONFLICT (user_id, date) DO UPDATE
         SET token_count = ai_usage.token_count + EXCLUDED.token_count,
             message_count = ai_usage.message_count + 1,
             updated_at = NOW()`,
      [userId, todayISO, tokensUsed]
    ),
  ]);

  // Update session cache
  sessionData.messages.push({ role: 'user', content: cleanInput });
  sessionData.messages.push({ role: 'assistant', content: responseText });
  sessionCache.set(req.params.id, sessionData);

  // Persist interaction
  const contextSnapshot = {
    persona_tone: sessionData.systemPrompt?.match(/tone is (\w+)/)?.[1],
    flag_count: sessionData.flagCount,
  };
  await query(
    `INSERT INTO ai_interactions (user_id, session_id, input_text, output_text, context_snapshot, flagged, flag_reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [userId, req.params.id, cleanInput, responseText, JSON.stringify(contextSnapshot), flagged, flagReason]
  );

  // Second high-severity flag in session → bump risk level + admin alert
  if (riskResult?.severity === 'high' && sessionData.flagCount >= 2) {
    await query(
      `UPDATE users SET risk_level = CASE
         WHEN risk_level = 'low' THEN 'medium'
         WHEN risk_level = 'medium' THEN 'high'
         ELSE risk_level END
       WHERE id = $1`,
      [userId]
    );
    await query(
      `INSERT INTO escalation_logs (user_id, session_id, trigger_type, trigger_detail, escalated_to)
       VALUES ($1, $2, 'repeated_flag', $3, 'admin')`,
      [userId, req.params.id, `2nd high flag in session: ${riskResult.category}`]
    );
    await query(
      `INSERT INTO notifications (user_id, type, payload, channel)
       SELECT id, 'emergency_alert', $1, 'in_app'
       FROM users WHERE role = 'admin' AND is_active = true`,
      [JSON.stringify({ source: 'ai_repeated_flag', session_id: req.params.id, user_alias: req.user.alias })]
    );
  }

  return res.status(200).json({
    response_text: responseText,
    flagged,
    session_flag_count: sessionData.flagCount,
    action: null,
  });
});

// ─── GET /ai/sessions ─────────────────────────────────────────────────────────
router.get('/sessions', auth, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(20, Math.max(1, parseInt(req.query.limit) || 10));
  const offset = (page - 1) * limit;

  const { rows } = await query(
    `SELECT s.id, s.channel, s.status, s.created_at, s.ended_at,
            (SELECT output_text FROM ai_interactions
             WHERE session_id = s.id AND output_text IS NOT NULL
             ORDER BY created_at ASC LIMIT 1) AS preview
     FROM sessions s
     WHERE s.user_id = $1 AND s.type = 'ai'
     ORDER BY s.created_at DESC
     LIMIT $2 OFFSET $3`,
    [req.user.id, limit, offset]
  );
  const { rows: countRows } = await query(
    `SELECT COUNT(*) FROM sessions WHERE user_id = $1 AND type = 'ai'`,
    [req.user.id]
  );
  const total = parseInt(countRows[0].count);

  return res.status(200).json({ sessions: rows, total, page, pages: Math.ceil(total / limit) });
});

// ─── POST /ai/session/:id/end ─────────────────────────────────────────────────
router.post('/session/:id/end', auth, async (req, res) => {
  const { rows } = await query(
    `UPDATE sessions SET status = 'completed', ended_at = NOW()
     WHERE id = $1 AND user_id = $2 AND type = 'ai' RETURNING ended_at`,
    [req.params.id, req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Session not found', code: 'NOT_FOUND' });

  const sessionData = sessionCache.get(req.params.id);
  sessionCache.delete(req.params.id);

  // Async summarisation — fire and forget, does not block response
  if (sessionData?.messages?.length >= 4) {
    const sessionId = req.params.id;
    const userId = req.user.id;
    const messages = sessionData.messages;
    (async () => {
      try {
        const transcript = messages
          .map((m) => `${m.role === 'user' ? 'User' : 'Companion'}: ${m.content}`)
          .join('\n');
        const result = await getGroq().chat.completions.create({
          model: FALLBACK_MODEL,
          messages: [
            {
              role: 'system',
              content: 'You summarise mental health support conversations for a companion AI to use in future sessions. Write 2–4 sentences in third person. Focus on: emotional themes, what the user shared about their life, what seemed to help, anything important to remember for next time. Omit crisis content and specific advice given. Be factual and concise.',
            },
            { role: 'user', content: transcript },
          ],
          max_tokens: 200,
        });
        const summaryText = result.choices[0]?.message?.content?.trim();
        if (summaryText) {
          await query(
            'INSERT INTO ai_memories (user_id, session_id, summary) VALUES ($1, $2, $3)',
            [userId, sessionId, summaryText]
          );
        }
      } catch (err) {
        console.error('Session summarisation failed:', err.message);
      }
    })();
  }

  return res.status(200).json({ ended_at: rows[0].ended_at });
});

// ─── DELETE /ai/memories ──────────────────────────────────────────────────────
router.delete('/memories', auth, async (req, res) => {
  await query('DELETE FROM ai_memories WHERE user_id = $1', [req.user.id]);
  return res.status(200).json({ cleared: true });
});

// ─── PATCH /ai/persona ───────────────────────────────────────────────────────
// Updates mutable persona fields (tone, response_style, formality, uses_alias, language).
// persona_name is permanent and is silently ignored if sent.
const VALID_TONES      = ['warm', 'motivational', 'clinical', 'casual'];
const VALID_STYLES     = ['brief', 'elaborate'];
const VALID_FORMALITY  = ['formal', 'neutral', 'informal'];
const VALID_LANGUAGES  = ['english', 'swahili', 'sheng'];

router.patch('/persona', auth, async (req, res) => {
  const { tone, response_style, formality, uses_alias, language } = req.body;

  const allowed = { tone, response_style, formality, uses_alias, language };
  const updates = [];
  const values  = [];

  if (tone !== undefined) {
    if (!VALID_TONES.includes(tone)) return res.status(400).json({ error: `tone must be one of: ${VALID_TONES.join(', ')}` });
    updates.push(`tone = $${values.length + 1}`);
    values.push(tone);
  }
  if (response_style !== undefined) {
    if (!VALID_STYLES.includes(response_style)) return res.status(400).json({ error: `response_style must be one of: ${VALID_STYLES.join(', ')}` });
    updates.push(`response_style = $${values.length + 1}`);
    values.push(response_style);
  }
  if (formality !== undefined) {
    if (!VALID_FORMALITY.includes(formality)) return res.status(400).json({ error: `formality must be one of: ${VALID_FORMALITY.join(', ')}` });
    updates.push(`formality = $${values.length + 1}`);
    values.push(formality);
  }
  if (uses_alias !== undefined) {
    updates.push(`uses_alias = $${values.length + 1}`);
    values.push(Boolean(uses_alias));
  }
  if (language !== undefined) {
    if (!VALID_LANGUAGES.includes(language)) return res.status(400).json({ error: `language must be one of: ${VALID_LANGUAGES.join(', ')}` });
    updates.push(`language = $${values.length + 1}`);
    values.push(language);
  }

  if (updates.length === 0) return res.status(400).json({ error: 'No valid fields to update' });

  updates.push(`updated_at = NOW()`);
  values.push(req.user.id);

  const { rows } = await query(
    `UPDATE ai_personas SET ${updates.join(', ')} WHERE user_id = $${values.length} RETURNING *`,
    values
  );
  if (!rows.length) return res.status(404).json({ error: 'Persona not found' });

  // Bust the persona cache so the next session picks up changes immediately
  await cache.del(`persona:${req.user.id}`);

  return res.status(200).json({ persona: rows[0] });
});

module.exports = router;
