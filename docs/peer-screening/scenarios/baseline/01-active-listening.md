# Scenario: The Quiet Storm
**Skill:** Active Listening (`active_listening`)  
**Version:** 1 | **Status:** DRAFT — pending clinical review  
**Estimated time:** 8–10 minutes

---

## Setup

You've been matched with someone who reached out for general support. Their opening message doesn't reveal much. Your job is to create enough safety that they feel able to keep going — without steering, solving, or filling the silence with advice.

---

## Scoring Rubric

| Tag | Points | Behaviour |
|---|---|---|
| `open_question` | +10 | Asking a question that invites them to share in their own words |
| `presence` | +10 | Acknowledging you're there without rushing them |
| `reflection` | +10 | Reflecting back what they said without adding interpretation |
| `advice_giving` | −10 | Offering a solution or suggestion they didn't ask for |
| `minimising` | −15 | Reducing the significance of what they shared |
| `redirecting` | −10 | Changing the subject or introducing a new topic |

**Pass threshold:** 65 points out of 100

---

## Node 1 — Opening

**They say:**  
*"I don't even know where to start. Everything just feels like too much right now."*

**Choose your response:**

**A)** "Tell me what's been going on — take as much time as you need."  
→ `open_question` +10 → **Node 2A**

**B)** "It sounds like a lot is weighing on you right now."  
→ `reflection` +10 → **Node 2B**

**C)** "I'm here. There's no rush."  
→ `presence` +10 → **Node 2C**

**D)** "Sometimes making a list of your problems helps. Have you tried that?"  
→ `advice_giving` −10 → **Node 2D**

---

## Node 2A — After open question

**They say:**  
*"Work has been awful. My manager keeps moving the goalposts and I feel like I can't do anything right. And then I go home and there's just… more of the same."*

**Choose your response:**

**A)** "That sounds exhausting — both at work and at home."  
→ `reflection` +10 → **Node 3A**

**B)** "Have you spoken to your manager about how you're feeling?"  
→ `advice_giving` −10 → **Node 3B**

**C)** "That's a lot to carry in two places at once."  
→ `reflection` +10 → **Node 3A**

**D)** "At least you have a job — some people would be grateful for that."  
→ `minimising` −15 → **Node 3C**

---

## Node 2B — After reflection

**They say:**  
*"Yeah. I feel like I'm just going through the motions. I wake up and I don't really feel anything anymore."*

**Choose your response:**

**A)** "That numbness sounds really draining. How long have you been feeling this way?"  
→ `open_question` +10 → **Node 3A**

**B)** "That might be depression. You should see a doctor."  
→ `advice_giving` −10, clinical claim − implied → **Node 3B**

**C)** "Going through the motions — like you're on autopilot?"  
→ `reflection` +10 → **Node 3A**

**D)** "Have you tried getting more exercise? That usually helps."  
→ `advice_giving` −10 → **Node 3B**

---

## Node 2C — After presence

**They say:**  
*"I just feel like no one actually listens. Like I talk and people nod but nothing lands."*

**Choose your response:**

**A)** "That sense of not being heard — that's really isolating."  
→ `reflection` +10 → **Node 3A**

**B)** "I'm listening. What would you want someone to actually hear right now?"  
→ `open_question` +10 → **Node 3A**

**C)** "You should tell the people in your life how you feel."  
→ `advice_giving` −10 → **Node 3B**

**D)** "Everyone feels like that sometimes."  
→ `minimising` −15 → **Node 3C**

---

## Node 2D — After advice (list)

**They say:**  
*"I've tried. The list just makes it look worse."*

**Recovery choice:**

**A)** "That makes sense — sometimes seeing it all written down makes it feel more real, not less."  
→ `reflection` +10 → **Node 3A**

**B)** "Maybe try a different method — like categorising by urgency."  
→ `advice_giving` −10 → **Node 3B**

---

## Node 3A — Strong path (continue)

**They say:**  
*"I keep thinking I should just push through. Like there's something wrong with me for struggling."*

**Choose your response:**

**A)** "There's nothing wrong with you. Struggling doesn't mean weakness."  
→ `presence` +10 → **Node 4 (end)**

**B)** "What does 'pushing through' look like for you?"  
→ `open_question` +10 → **Node 4 (end)**

**C)** "A lot of people feel that way. You're not alone in this."  
→ `presence` +10 → **Node 4 (end)**

---

## Node 3B — Recovery path

**They say:**  
*"I don't really want advice right now. I just wanted someone to hear me."*

**Choose your response:**

**A)** "You're right — I'm sorry. I'm here to listen. What would you like to share?"  
→ `presence` +10 → **Node 4 (end, partial)**

**B)** "Okay but my suggestion might actually help."  
→ `redirecting` −10 → **Node 4 (end, fail)**

---

## Node 3C — Minimising path (recovery test)

**They say:**  
*"…That's exactly what I mean. No one actually gets it."*

**Choose your response:**

**A)** "You're right. That wasn't fair of me to say. What you're going through is real."  
→ `reflection` +10 → **Node 4 (end, partial)**

**B)** "I was just trying to help."  
→ no score → **Node 4 (end, fail)**

---

## Node 4 — End

Scenario complete. Score tallied. 

**Pass (≥65):** Skill issued. Peer sees: *"You showed up with presence and curiosity — the two most important things a peer can bring."*

**Near pass (45–64):** *"Good instincts. The scenario highlighted one area to think about: [tag with lowest score]. Try again when you're ready."*

**Fail (<45):** *"This scenario tests whether you can stay curious rather than fix. When someone shares difficulty, the instinct to solve is natural — but listening first makes the biggest difference. Try again."*
