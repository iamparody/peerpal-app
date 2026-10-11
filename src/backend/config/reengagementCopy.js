// Rotating copy for re-engagement push notifications.
// Each key maps to an array of message objects: { title, body }.
// pick() selects one at random.

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

const COPY = {
  streak_reminder: [
    { title: 'Keep your streak alive',         body: "Your {n}-day streak ends today if you miss a check-in." },
    { title: 'One minute is all it takes',     body: "Check in now — your past self worked hard for that streak." },
    { title: 'You showed up {n} days straight', body: "Don't let today be the break. Check in and keep going." },
    { title: 'Momentum matters',               body: "A quick check-in keeps your streak alive." },
    { title: 'Your streak is at risk',         body: "You've been consistent. Stay with it — check in today." },
  ],

  streak_broken: [
    { title: 'Your streak reset',       body: "That's okay. Starting again is what counts — check in today." },
    { title: 'Every streak restarts',   body: "You came back before. You can start again right now." },
    { title: 'No streak lasts forever', body: "The important thing is you're here. Log how you're feeling." },
  ],

  dormant_nudge: [
    { title: 'Even a good day is worth noting', body: "A quick mood log takes 20 seconds. How are you today?" },
    { title: 'You don\'t have to be struggling', body: "Good days count too. Check in and see where you are." },
    { title: 'Your wellbeing space is waiting', body: "Small check-ins add up to big insights over time." },
    { title: 'It\'s been a few days',            body: "No pressure — just a moment to check in with yourself." },
    { title: 'How have you been?',               body: "Your journal and streak are ready whenever you are." },
  ],

  bad_mood_followup: [
    { title: 'How are you feeling now?',         body: "You checked in feeling low earlier. Has anything shifted?" },
    { title: 'A lot can change in a few hours',  body: "How are you feeling compared to earlier today?" },
    { title: 'You don\'t have to stay there',    body: "Check in and see where you are right now." },
    { title: 'Earlier was hard',                 body: "You came back — that already means something. Check in." },
  ],

  session_followup_peer: [
    { title: 'How are you feeling today?',       body: "You talked to a peer yesterday. Take a moment to check in." },
    { title: 'Reflection helps',                 body: "How are you feeling compared to before your session?" },
    { title: 'You reached out — that matters',   body: "Log how you're feeling today and see what's shifted." },
  ],

  session_followup_therapy: [
    { title: 'Reflection after your session',    body: "Writing about your session can help it land more deeply." },
    { title: 'Your journal is a good place',     body: "What came up in your session yesterday? Write it out." },
    { title: 'Processing takes time',            body: "A few lines in your journal can help things settle." },
  ],

  unmatched_request: [
    { title: 'No one was available yesterday',   body: "You can try again, or talk to your AI companion now." },
    { title: 'Your request went unmatched',      body: "Peers aren't always available. Your AI companion is." },
    { title: 'You still deserve support',        body: "Try connecting with a peer again, or open the AI chat." },
  ],

  ai_dormant: [
    { title: 'Your companion misses you',        body: "It's been a while. Your AI companion is ready to listen." },
    { title: 'Check in with your companion',     body: "You haven't opened the AI chat in a while. How are you?" },
    { title: 'A conversation might help',        body: "Your AI companion is available any time, day or night." },
  ],

  credit_low: [
    { title: 'You have 1 credit left',           body: "Top up to stay connected when you need support." },
  ],

  credit_zero: [
    { title: 'You\'re out of credits',           body: "Don't let that stop you. Top up and keep going." },
    { title: 'Credits ran out',                  body: "You can still access the AI chat. Top up for peer sessions." },
  ],

  no_safety_plan: [
    { title: 'A small step worth taking',        body: "A safety plan takes 5 minutes and is there when you need it." },
    { title: 'Be prepared, just in case',        body: "Setting up a safety plan is one of the kindest things you can do for yourself." },
  ],

  low_mood_streak: [
    { title: 'You\'ve been having a hard few days', body: "You don't have to carry this alone. Reach out." },
    { title: 'Three hard days',                     body: "It's okay to ask for support. A peer or your companion is here." },
  ],

  therapist_upsell: [
    { title: 'You\'ve been showing up',          body: "Peer support is powerful. A therapist can go even deeper." },
    { title: 'Ready for the next step?',         body: "You've used peer support. A therapist can help you go further." },
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
