# Scenario: The Untold Story
**Skill:** Trauma-Informed Communication (`trauma_informed_communication`)  
**Version:** 1 | **Status:** DRAFT — pending clinical review  
**Estimated time:** 10–12 minutes

---

## Setup

Someone begins to disclose an experience of abuse but stops themselves — seems scared, ashamed, or uncertain whether it's safe to continue. This scenario tests whether you can create safety without pressing for details, follow their pace rather than yours, avoid probing questions, and stay regulated when they share something distressing.

The cardinal rule of trauma-informed communication: **the person controls the pace and the level of detail. Your job is to make it safe to share — not to extract the story.**

Prerequisite: All 5 baseline skills

---

## Scoring Rubric

| Tag | Points | Behaviour |
|---|---|---|
| `safety_created` | +15 | Creating conditions where the person feels safe to continue at their own pace |
| `pace_followed` | +15 | Matching their rhythm rather than pushing forward |
| `no_probing` | +10 | Avoiding questions that press for details they haven't offered |
| `validation` | +10 | Acknowledging the difficulty of sharing |
| `warm_escalation` | +10 | Introducing professional support without alarm |
| `probing_for_detail` | −20 | Asking what happened, who did it, specifics they haven't offered |
| `shock_response` | −15 | Expressing horror or distress in a way that centres your reaction |
| `rushing` | −10 | Moving the story forward faster than they're going |
| `minimising` | −15 | Reducing the significance of what they're building up to share |

**Pass threshold:** 70 points out of 100

---

## Node 1 — Opening

**They say:**  
*"Something happened to me a while ago. I've never really talked about it. I don't know if I can."*

**Choose your response:**

**A)** "You don't have to tell me anything you don't want to. I'm just here."  
→ `safety_created` +15 → **Node 2A**

**B)** "What happened?"  
→ `probing_for_detail` −20 → **Node 2B**

**C)** "Take your time. Whatever you want to share, I'll listen."  
→ `safety_created` +15, `pace_followed` +15 → **Node 2A**

**D)** "It's okay — you can tell me. Getting it out will help."  
→ `rushing` −10 → **Node 2C**

---

## Node 2A — Safe space established

**They say:**  
*"Someone hurt me. Someone I trusted. I haven't told anyone because I thought they wouldn't believe me."*

**Choose your response:**

**A)** "I believe you."  
→ `validation` +10 → **Node 3A**

**B)** "Who was it?"  
→ `probing_for_detail` −20 → **Node 3B**

**C)** "I believe you. And thank you for trusting me with even this much."  
→ `validation` +10, `safety_created` +15 → **Node 3A**

**D)** "Oh god, that's awful. What did they do?"  
→ `shock_response` −15, `probing_for_detail` −20 → **Node 3B**

---

## Node 2B — After probing (recovery)

**They say:**  
*"I… I'm not sure I want to say."*

**Recovery:**

**A)** "That's completely okay. You don't have to tell me anything specific. I'm just here."  
→ `safety_created` +15 (recovery), `no_probing` +10 → **Node 3A**

**B)** "Just a little bit — it'll help me understand."  
→ `probing_for_detail` −20 → **Node 3C (fail)**

---

## Node 2C — After rushing (recovery)

**They say:**  
*"I don't think it will help. It still feels really raw."*

**Recovery:**

**A)** "You're right — I shouldn't have said that. There's no pressure. I'm here however you want to use this time."  
→ `safety_created` +15 (recovery) → **Node 3A**

**B)** "Raw is good though — it means you're ready to process it."  
→ `rushing` −10 → **Node 3C (fail)**

---

## Node 3A — Strong path

**They say:**  
*"I've been carrying this for two years. Some days it's okay and some days it just… comes back."*

**Choose your response:**

**A)** "Two years. That's a long time to carry something alone."  
→ `validation` +10 → **Node 4A**

**B)** "Have you thought about speaking to a counsellor about it?"  
→ `warm_escalation` +10 (appropriate here) → **Node 4A**

**C)** "What usually makes it come back?"  
→ `probing_for_detail` −10 (gentle but still probing without invitation) → **Node 4B**

---

## Node 3B — Probing path continues

**They say:**  
*"I really don't want to go into detail."*

**Recovery:**

**A)** "Of course. I'm sorry — I asked too much. You've already shared something really significant. I'm with you."  
→ `safety_created` +15, `pace_followed` +15 (recovery) → **Node 4A**

**B)** "I just want to understand."  
→ `probing_for_detail` −20 → **Node 4C (fail)**

---

## Node 4A — End (pass path)

**They say:**  
*"Thank you. I've never said any of this out loud before."*

**Choose your response:**

**A)** "That took real courage. If you ever want support from someone trained to help with experiences like this, there are professionals who specialise in exactly this — and I can point you toward them when you're ready."  
→ `warm_escalation` +10 → **Node 5 (end)**

**B)** "Of course. See you around."  
→ neutral → **Node 5 (end)**

---

## Node 4B — Minor probing path

**Continues to Node 5 with reduced score.**

---

## Node 4C — Fail path

→ **Node 5 (end, fail)**

---

## Node 5 — End

**Pass (≥70):** *"You followed their pace, didn't press, and made it safe. With trauma, the most powerful thing is creating conditions where someone can share as much or as little as they choose — and feel respected either way."*

**Near pass (55–69):** *"You were mostly there. [Lowest tag] — with trauma-informed support, the instinct to understand the full story is understandable but it works against you. The story belongs to them."*

**Fail (<55):** *"This scenario tests one of the most important principles in trauma-informed communication: the person controls the pace and the detail. Pressing for more — even with caring intent — can cause harm. The right posture is patient, present, and unhurried."*
