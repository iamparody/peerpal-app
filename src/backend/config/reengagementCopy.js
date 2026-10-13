// Rotating copy for re-engagement push notifications.
// Privacy rules (spec Section: Privacy rules):
//   - Never reference mood level, emotional state, session content, or clinical language
//   - Lock-screen text must be safe to read in any context
// Each key maps to an array of { title, body }. pick() selects one at random.

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

const COPY = {
  streak_reminder: [
    { title: "Keep your streak alive",          body: "Your {n}-day streak ends today if you miss a check-in." },
    { title: "One minute is all it takes",      body: "Check in now. Your past self worked hard for that streak." },
    { title: "You showed up {n} days straight", body: "Keep going. Check in and hold your momentum." },
    { title: "Momentum matters",                body: "A quick check-in keeps your streak alive." },
    { title: "A quick check-in counts",         body: "You've been consistent. Stay with it today." },
  ],

  streak_broken: [
    { title: "Your streak reset",       body: "That's okay. Starting again is what counts. Check in today." },
    { title: "Every streak restarts",   body: "You came back before. You can start again right now." },
    { title: "No streak lasts forever", body: "The important thing is you're here. Log how you're feeling." },
  ],

  dormant_nudge: [
    { title: "We noticed you've been away",     body: "No pressure. We're here when you're ready." },
    { title: "Your wellbeing space is waiting", body: "Small check-ins add up to big insights over time." },
    { title: "How have you been?",              body: "Your journal and streak are ready whenever you are." },
  ],

  bad_mood_followup: [
    { title: "Checking in on you",              body: "How are you feeling compared to this morning?" },
    { title: "A lot can change in a few hours", body: "Take a moment to check in with yourself." },
    { title: "Still thinking of you",           body: "Check in and see where you are right now." },
    { title: "You're not alone in this",        body: "You came back. That already means something. Check in." },
  ],

  session_followup_peer: [
    { title: "How are you feeling today?",     body: "You connected with a peer recently. Take a moment to check in." },
    { title: "Reflection helps",               body: "How are you feeling compared to before your session?" },
    { title: "You reached out. That matters.", body: "Log how you're feeling today and see what's shifted." },
  ],

  session_followup_therapy: [
    { title: "Reflection after your session", body: "Writing about your session can help it land more deeply." },
    { title: "Your journal is a good place",  body: "A few lines in your journal can help things settle." },
    { title: "Processing takes time",         body: "Take a moment to write down what came up for you." },
  ],

  unmatched_request: [
    { title: "No peer was available",     body: "You can try again, or talk to your AI companion now." },
    { title: "Peers aren't always free",  body: "Your AI companion is available any time. Come talk." },
    { title: "You still deserve support", body: "Try connecting with a peer again, or open the AI chat." },
  ],

  ai_dormant: [
    { title: "Your companion is ready", body: "Start a conversation whenever you're ready." },
    { title: "Check in with yourself",  body: "Your AI companion is available any time, day or night." },
    { title: "It's been a while",       body: "Your companion is here. Come back when you're ready." },
  ],

  credit_low: [
    { title: "You have 1 credit left", body: "Top up to stay connected when you need support." },
  ],

  credit_zero: [
    { title: "Out of credits",  body: "Don't let that stop you. Top up and keep going." },
    { title: "Credits ran out", body: "You can still access the AI chat. Top up for peer sessions." },
  ],

  no_safety_plan: [
    { title: "A small step worth taking", body: "A safety plan takes 5 minutes and is there when you need it." },
    { title: "Be prepared, just in case", body: "Setting up a safety plan is one of the kindest things you can do for yourself." },
  ],

  low_mood_streak: [
    { title: "You've been checking in",  body: "Take a moment today. A peer or your companion is here." },
    { title: "You're not alone in this", body: "It's okay to ask for support. We're here." },
  ],

  first_call_nudge: [
    { title: "PeerPal", body: "Someone is ready to listen when you are." },
  ],

  therapist_upsell: [
    { title: "You've been showing up",   body: "Peer support is powerful. A therapist can go even deeper." },
    { title: "Ready for the next step?", body: "You've used peer support. A therapist can help you go further." },
  ],
};

function getReengagementCopy(type, vars = {}) {
  const templates = COPY[type];
  if (!templates) return null;
  let { title, body } = pick(templates);
  for (const [key, val] of Object.entries(vars)) {
    title = title.replace(`{${key}}`, val);
    body  = body.replace(`{${key}}`, val);
  }
  return { title, body };
}

module.exports = { getReengagementCopy };
