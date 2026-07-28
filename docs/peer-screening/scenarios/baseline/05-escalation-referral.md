# Scenario: The Red Flag
**Skill:** Escalation & Referral (`escalation_and_referral`)  
**Version:** 1 | **Status:** DRAFT — pending clinical review  
**Estimated time:** 9–11 minutes

---

## Setup

Someone starts a session casually but gradually reveals something that needs more than peer support. This scenario tests whether you can recognise the signal, introduce the idea of professional help without alarming the person, and not abandon them in the process. The goal is a warm handoff, not a sudden exit.

Prerequisite: `active_listening`, `boundary_setting`

---

## Scoring Rubric

| Tag | Points | Behaviour |
|---|---|---|
| `signal_recognised` | +15 | Identifying that escalation is needed without panicking |
| `warm_handoff` | +15 | Introducing professional resources with care, not as a dismissal |
| `stays_present` | +10 | Continuing to be present after suggesting a referral (not ending the session immediately) |
| `open_question` | +10 | Asking a clarifying question to understand the situation better |
| `panic_response` | −15 | Reacting with alarm that may frighten the person |
| `abandonment` | −20 | Ending the session abruptly after recognising the signal |
| `ignoring_signal` | −20 | Continuing the conversation as if the signal wasn't there |
| `clinical_claim` | −15 | Diagnosing the person or using clinical language |

**Pass threshold:** 70 points out of 100

---

## Node 1 — Opening

**They say:**  
*"Hey. I've just been feeling really off lately. Not sleeping well, low energy. Nothing major."*

**Choose your response:**

**A)** "I'm glad you reached out. When you say 'off' — has it been building up gradually or did something shift recently?"  
→ `open_question` +10 → **Node 2A**

**B)** "That sounds like it could be depression."  
→ `clinical_claim` −15 → **Node 2B**

**C)** "I hear you. Low energy and no sleep is draining. How long has it been like this?"  
→ `open_question` +10 → **Node 2A**

---

## Node 2A — Conversation deepens

**They say:**  
*"A few months maybe. It's got worse lately. Honestly I've been having some thoughts I'd rather not have. I don't know if I should say this but… sometimes I think everyone would be better off without me."*

**This is the signal. Choose your response:**

**A)** "Thank you for telling me that — it takes courage. Can I ask — when you have those thoughts, do you find yourself thinking about acting on them?"  
→ `signal_recognised` +15, `open_question` +10 → **Node 3A**

**B)** "Oh no — you need to call a crisis line right now."  
→ `signal_recognised` +15, `panic_response` −15 → **Node 3B**

**C)** "That's really serious. You sound depressed."  
→ `signal_recognised` +15, `clinical_claim` −15 → **Node 3B**

**D)** "I'm sure you don't really mean that. Tell me more about your sleep."  
→ `ignoring_signal` −20 → **Node 3C**

---

## Node 2B — After clinical claim (recovery)

**They say:**  
*"I don't know if I'm depressed. I just feel bad."*

**Recovery:**

**A)** "You're right — I shouldn't have labelled it. What matters is that you feel bad and that's real. How long has it been like this?"  
→ partial recovery, `open_question` +10 → **Node 2A**

**B)** "Well the symptoms sound like depression."  
→ `clinical_claim` −15 → **Node 3C**

---

## Node 3A — Strong escalation path

**They say:**  
*"Not really acting on them. It's more like… a background thought. Like I could disappear and it would be a relief."*

**Choose your response:**

**A)** "I hear you — it sounds exhausting to be carrying that. I'm really glad you said it out loud. What you're describing is beyond what I can fully support as a peer, and I want to make sure you get the right kind of help. There's a service called Befrienders Kenya — they're free, confidential, and available 24/7. Would you be open to reaching out to them? I'm not going anywhere in the meantime."  
→ `warm_handoff` +15, `stays_present` +10 → **Node 4 (end)**

**B)** "Okay, well I've told you what I know. Good luck."  
→ `abandonment` −20 → **Node 4 (end, fail)**

**C)** "That kind of thought is a sign of serious mental illness."  
→ `clinical_claim` −15 → **Node 4 (end, partial)**

---

## Node 3B — Panic path

**They say:**  
*"I didn't mean to worry you. It's not that serious. Forget I said it."*

**Recovery:**

**A)** "Please don't take it back — you said it because it's real and it matters. I'm not panicking, I just care. Can we talk about it a bit more?"  
→ `stays_present` +10, `warm_handoff` partial → **Node 4 (end, partial)**

**B)** "You need professional help immediately."  
→ `panic_response` −15 → **Node 4 (end, fail)**

---

## Node 3C — Signal ignored path

**They say:**  
*"…You're not going to say anything about what I said?"*

**Recovery:**

**A)** "You're right — I should have. What you said — about everyone being better off without you — I heard it and it matters. Can we go back to that?"  
→ `signal_recognised` +15 (partial), `stays_present` +10 → **Node 4 (end, partial)**

**B)** "Sorry, what did you say?"  
→ `ignoring_signal` −20 → **Node 4 (end, fail)**

---

## Node 4 — End

**Pass (≥70):** *"You caught the signal, stayed calm, and introduced support without making them feel like a problem to be handed off. That's the whole skill: a warm handoff is still an act of care."*

**Near pass (50–69):** *"You recognised what mattered. The gap was in [lowest tag]. When someone discloses something heavy, staying present after you suggest professional help is what stops it feeling like a rejection."*

**Fail (<50):** *"This scenario tests one of the most important moments in peer support: what you do when someone shares something that needs more than you can give. The answer is: acknowledge it, stay calm, name a resource, and don't leave. Missing any of those steps can make someone feel more alone at exactly the wrong moment."*
