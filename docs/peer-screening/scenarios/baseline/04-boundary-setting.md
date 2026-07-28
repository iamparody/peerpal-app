# Scenario: The Long Night
**Skill:** Boundary Setting (`boundary_setting`)  
**Version:** 1 | **Status:** DRAFT — pending clinical review  
**Estimated time:** 8–10 minutes

---

## Setup

A session is approaching its 30-minute limit and the person is not ready to stop. This scenario tests whether you can set a time limit kindly and firmly, acknowledge their need without abandoning them, and direct them toward what's available after the session ends — without making them feel rejected or cut off mid-crisis.

Prerequisite: `active_listening`

---

## Scoring Rubric

| Tag | Points | Behaviour |
|---|---|---|
| `boundary_stated_clearly` | +15 | Stating the limit directly without hedging |
| `warm_boundary` | +10 | Delivering the limit with care, not as a rule recital |
| `resource_offered` | +10 | Naming what's available after the session (emergency, new session, resources) |
| `acknowledgment_before_limit` | +10 | Acknowledging what they shared before stating the limit |
| `abandonment` | −20 | Ending abruptly without any transition or acknowledgment |
| `boundary_avoided` | −15 | Continuing past the limit without naming it |
| `cold_ending` | −10 | Stating the limit without warmth or a next step |

**Pass threshold:** 65 points out of 100

---

## Node 1 — Opening context

*(The session has been going for 25 minutes. The person has been sharing about a difficult family situation. The extension prompt has appeared.)*

**They say:**  
*"...and that's when my mum said she was done with me. I've never heard her say that before. I don't know what to do with that."*

**You have 5 minutes left. Choose your response:**

**A)** "That sounds like it landed really hard. I want you to know I'm here with you in this. I do need to let you know our session is coming to an end in about 5 minutes — but I don't want to just disappear on you. Can we think about what would help you feel okay when we close?"  
→ `acknowledgment_before_limit` +10, `boundary_stated_clearly` +15, `warm_boundary` +10 → **Node 2A**

**B)** "We're nearly at time, just so you know."  
→ `boundary_stated_clearly` +15, `cold_ending` −10 → **Node 2B**

**C)** "That sounds awful. Tell me more."  
→ `boundary_avoided` −15 → **Node 2C**

**D)** *(Say nothing — let them keep talking until time runs out)*  
→ `boundary_avoided` −15, `abandonment` −20 → **Node 2D**

---

## Node 2A — Strong path

**They say:**  
*"I just don't want to be alone with this tonight."*

**Choose your response:**

**A)** "That makes complete sense. If things feel really heavy tonight, you can reach out to Befrienders Kenya — they're free, 24/7, and they'll listen. You can also start a new session tomorrow. You're not going to be alone with this long-term."  
→ `resource_offered` +10 → **Node 3A**

**B)** "I'll stay a bit longer if you need me to."  
→ `boundary_avoided` −15 → **Node 3B**

**C)** "I hear that. Is there anyone in your life who could be with you tonight?"  
→ `open_question` +5, `resource_offered` partial → **Node 3A**

---

## Node 2B — Cold boundary path

**They say:**  
*"Wait — we're ending? But I'm right in the middle of something."*

**Recovery:**

**A)** "I know — and I'm sorry the timing isn't better. What you just shared about your mum matters. We have a few minutes left — what would feel most important to say before we close?"  
→ `warm_boundary` +10, `acknowledgment_before_limit` +10 → **Node 3A**

**B)** "Sessions are 30 minutes. That's just how it works."  
→ `cold_ending` −10 → **Node 3C (fail)**

---

## Node 2C — Avoided boundary (continued)

*(8 minutes later, session has overrun. The system automatically closes it.)*

**They say:**  
*"Hello? Are you still there?"*

→ `boundary_avoided` −15 trigger, session ended abruptly  
→ **Node 3C (fail path)**

---

## Node 2D — Abandonment path

*(Session ends automatically. No transition given.)*

→ `abandonment` −20  
→ **Node 4 (end, fail)**

---

## Node 3A — Strong path continues

**They say:**  
*"Okay. Thank you for being here."*

**Choose your response:**

**A)** "Thank you for trusting me with this. Take care of yourself tonight."  
→ `warm_boundary` +10 → **Node 4 (end)**

**B)** "Of course. Good luck."  
→ neutral → **Node 4 (end)**

---

## Node 3B — Boundary avoided again

**They say:**  
*"Really? Okay, well in that case..."*  
*(They continue for another 20 minutes)*

→ `boundary_avoided` −15 second instance  
→ **Node 4 (end, fail)**

---

## Node 3C — Fail path

*(Session ends without a proper transition)*

→ **Node 4 (end, fail)**

---

## Node 4 — End

**Pass (≥65):** *"You named the limit and held it — and the person still felt cared for when the session ended. That's the whole skill: a boundary can be firm and warm at the same time."*

**Near pass (45–64):** *"You understood the need for a limit. The gap was in [lowest tag]. The goal is for the person to feel that the session ended, not that they were abandoned."*

**Fail (<45):** *"This scenario tests one of the hardest parts of peer support: ending. Avoiding the limit might feel kinder in the moment but leaves the person with no transition and no next step. Clear endings with resources are an act of care."*
