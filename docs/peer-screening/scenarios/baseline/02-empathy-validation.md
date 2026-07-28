# Scenario: The Weight of Small Things
**Skill:** Empathy & Validation (`empathy_and_validation`)  
**Version:** 1 | **Status:** DRAFT — pending clinical review  
**Estimated time:** 8–10 minutes

---

## Setup

Someone reaches out feeling guilty for being upset about something they think "shouldn't" be a big deal. This scenario tests whether you can validate feelings without judgment, avoid comparisons, and resist the urge to reassure prematurely. The person needs to feel understood — not fixed, not corrected, not told they shouldn't feel what they feel.

---

## Scoring Rubric

| Tag | Points | Behaviour |
|---|---|---|
| `validation` | +10 | Affirming that their feeling is understandable |
| `open_question` | +10 | Inviting them to say more |
| `empathy` | +10 | Naming the emotion without projecting |
| `premature_reassurance` | −10 | Telling them it'll be fine before they've felt heard |
| `comparison` | −15 | Comparing their situation to someone else's ("at least…") |
| `minimising` | −15 | Implying their problem isn't worth this much feeling |

**Pass threshold:** 65 points out of 100

---

## Node 1 — Opening

**They say:**  
*"I know this sounds stupid but I didn't get a job I really wanted and I've been crying for two days. I feel so pathetic — it's just a job."*

**Choose your response:**

**A)** "It doesn't sound stupid at all. Rejection hurts, especially when you really wanted something."  
→ `validation` +10 → **Node 2A**

**B)** "At least you have your current job. Some people have nothing."  
→ `comparison` −15 → **Node 2B**

**C)** "Two days is a long time to cry over a rejection. You'll bounce back."  
→ `minimising` −15, `premature_reassurance` −10 → **Node 2C**

**D)** "What made this job matter so much to you?"  
→ `open_question` +10 → **Node 2D**

---

## Node 2A — After validation

**They say:**  
*"I just feel like I should be stronger than this. My friend got rejected from 10 places and she was fine."*

**Choose your response:**

**A)** "Different things hit different people differently. Your feelings aren't wrong."  
→ `validation` +10 → **Node 3A**

**B)** "Maybe your friend is just better at hiding it."  
→ `empathy` +5 (partial) → **Node 3A**

**C)** "If she can handle it, I'm sure you can too."  
→ `comparison` −15 → **Node 3B**

**D)** "What does 'stronger' mean to you — what would that look like?"  
→ `open_question` +10 → **Node 3A**

---

## Node 2B — After comparison (recovery)

**They say:**  
*"…I knew you'd say something like that."*

**Choose your response:**

**A)** "You're right — that wasn't helpful. What you're feeling makes sense. Tell me more about what this job meant to you."  
→ `validation` +10 → **Node 3A**

**B)** "I'm just trying to give you perspective."  
→ no score → **Node 3C (fail path)**

---

## Node 2C — After minimising/reassurance (recovery)

**They say:**  
*"I don't feel like I can bounce back right now. I feel really low."*

**Choose your response:**

**A)** "I hear you. What does 'really low' feel like for you right now?"  
→ `open_question` +10, partial recovery → **Node 3A**

**B)** "Well you need to stay positive."  
→ `premature_reassurance` −10 → **Node 3C (fail path)**

---

## Node 2D — After open question

**They say:**  
*"I'd been working toward it for two years. I changed careers for it. And they said I wasn't the right fit after a 30-second decision in the final interview."*

**Choose your response:**

**A)** "Two years of work, a whole career shift — and then 30 seconds. That's a lot to absorb."  
→ `empathy` +10 → **Node 3A**

**B)** "Maybe they made a mistake. Another opportunity will come."  
→ `premature_reassurance` −10 → **Node 3B**

**C)** "That sounds genuinely painful. It makes complete sense that you're grieving it."  
→ `validation` +10 → **Node 3A**

---

## Node 3A — Strong path

**They say:**  
*"I keep thinking about what I did wrong. Going over every answer I gave."*

**Choose your response:**

**A)** "That loop sounds exhausting. What would it feel like to step away from it, even for a moment?"  
→ `open_question` +10 → **Node 4 (end)**

**B)** "Stop replaying it — it won't change anything."  
→ `minimising` −10 → **Node 4 (end, partial)**

**C)** "That kind of replay is really common after rejection. It doesn't mean you did anything wrong."  
→ `validation` +10 → **Node 4 (end)**

---

## Node 3B — Partial path

**They say:**  
*"I just feel a bit unheard right now, to be honest."*

**Recovery:**

**A)** "That's fair. I want to hear you. What would feel most useful right now?"  
→ `open_question` +10 → **Node 4 (end, partial)**

**B)** "I'm trying my best."  
→ no score → **Node 4 (end, fail)**

---

## Node 3C — Fail path

**They say:**  
*"Never mind. Forget I said anything."*

**Recovery:**

**A)** "Please don't. I'm sorry — I got that wrong. You reached out and that took something. I'd like to try again if you'll let me."  
→ `empathy` +10 → **Node 4 (end, partial)**

**B)** "Okay."  
→ no score → **Node 4 (end, fail)**

---

## Node 4 — End

**Pass (≥65):** *"You let them feel what they were feeling without rushing to fix it. That's the whole skill."*

**Near pass (45–64):** *"You were mostly there. The scenario highlighted [lowest tag]. Validation doesn't require agreement — just acknowledgment."*

**Fail (<45):** *"This scenario tests whether you can hold space without redirecting. Comparing pain or reassuring too soon can make someone feel more alone, not less. Try again."*
