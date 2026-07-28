# PeerPal Peer Competency Taxonomy — v1

**Status:** Frozen for implementation. Changes require a version bump and entry in the change log below.  
**Frozen date:** 2026-07-28  
**Clinical review:** PENDING — system may be built and tested with draft scenarios. `PEER_SCREENING_LIVE` must remain `false` until sign-off is obtained.

---

## 1. Skills

Skills are atomic capabilities. Every skill has a slug, a version, and a prerequisite list.  
Icons represent capabilities, not conditions. Colors: Sage Green = baseline, Amber = specialty.

### 1.1 Baseline Skills
Every peer must complete all 5 baseline skills before unlocking any specialty.

| Slug | Name | Icon | Prereqs |
|---|---|---|---|
| `active_listening` | Active Listening | Ear | None |
| `empathy_and_validation` | Empathy & Validation | Heart | None |
| `confidentiality_and_privacy` | Confidentiality | Lock | None |
| `boundary_setting` | Boundary Setting | Shield | `active_listening` |
| `escalation_and_referral` | Escalation & Referral | Lifebuoy | `active_listening`, `boundary_setting` |

### 1.2 Specialty Skills
Unlock after all 5 baseline skills are complete.

| Slug | Name | Icon | Prereqs |
|---|---|---|---|
| `trauma_informed_communication` | Trauma-Informed Communication | Four-leaf clover | All baseline |
| `grief_and_loss_support` | Grief & Loss Support | Candle | All baseline |
| `identity_sensitive_communication` | Identity-Sensitive Communication | Prism | All baseline |
| `sexual_harassment_awareness` | Sexual Harassment Awareness | Lantern | All baseline |
| `relationship_support` | Relationship Support | Bridge | All baseline |
| `bullying_support` | Bullying Support | Umbrella | All baseline |
| `stress_and_burnout` | Stress & Burnout | Mountain | All baseline |
| `financial_stress_support` | Financial Stress Support | Compass | All baseline |
| `parenting_support` | Parenting Support | Sapling | All baseline |
| `addiction_awareness` | Addiction Awareness | Anchor | All baseline |
| `domestic_violence_awareness` | Domestic Violence Awareness | Lighthouse | All baseline |
| `disability_awareness` | Disability Awareness | Open door | All baseline |
| `cultural_sensitivity` | Cultural Sensitivity | Globe | All baseline |

---

## 2. Permissions

Permissions are policy decisions, not technical ones. Each permission maps a set of required skills to a routing category. Changing which skills a permission requires does not require rebuilding routing — only the permissions table entry changes.

**Display rule:** Permission names shown to peers must never use "certified", "qualified", or "trained professional". Use "Awareness Training Complete", "Ready", or "Experienced".

**Disclaimer required on all permissions:**  
> "Completed PeerPal's [X] awareness training. Peer supporters provide listening and support, not therapy or professional counselling."

| Permission Slug | Display Name | Required Skills |
|---|---|---|
| `general_support` | General Support Ready | `active_listening`, `empathy_and_validation`, `boundary_setting`, `escalation_and_referral` |
| `trauma_support` | Trauma Awareness Complete | All general_support skills + `trauma_informed_communication` |
| `grief_support` | Grief Support Ready | All general_support skills + `grief_and_loss_support` |
| `identity_support` | Identity Support Ready | All general_support skills + `identity_sensitive_communication` |
| `sexual_harassment_support` | Sexual Harassment Awareness Complete | All general_support skills + `sexual_harassment_awareness` |
| `relationship_support` | Relationship Support Ready | All general_support skills + `relationship_support` |
| `bullying_support` | Bullying Support Ready | All general_support skills + `bullying_support` |
| `stress_burnout_support` | Stress & Burnout Support Ready | All general_support skills + `stress_and_burnout` |
| `financial_support` | Financial Stress Support Ready | All general_support skills + `financial_stress_support` |
| `parenting_support` | Parenting Support Ready | All general_support skills + `parenting_support` |
| `addiction_support` | Addiction Awareness Complete | All general_support skills + `addiction_awareness` |
| `domestic_violence_support` | Domestic Violence Awareness Complete | All general_support skills + `domestic_violence_awareness` |

> Crisis requests always route to professional services — no permission unlocks them.

---

## 3. Topics (Requester-Facing)

Topics are situation-based, not diagnosis-based. Peers are not diagnosing — they are responding to situations.

| Topic Slug | User-Facing Label | Primary Permission Required | Secondary Permission (fallback) |
|---|---|---|---|
| `abuse_or_assault` | Someone experienced abuse or assault | `trauma_support` | `general_support` |
| `bereavement` | Someone lost a loved one | `grief_support` | `general_support` |
| `identity` | Someone is questioning their identity | `identity_support` | `general_support` |
| `relationship` | Someone is struggling in a relationship | `relationship_support` | `general_support` |
| `overwhelmed_school_work` | Someone is overwhelmed by school or work | `stress_burnout_support` | `general_support` |
| `sexual_harassment` | Someone experienced sexual harassment | `sexual_harassment_support` | `trauma_support` |
| `addiction` | Someone is dealing with addiction | `addiction_support` | `general_support` |
| `domestic_violence` | Someone experiencing domestic violence | `domestic_violence_support` | `trauma_support` |
| `bullying` | Someone is being bullied | `bullying_support` | `general_support` |
| `financial_stress` | Someone is dealing with financial pressure | `financial_support` | `general_support` |
| `parenting` | Someone needs parenting support | `parenting_support` | `general_support` |
| `general` | I just need someone to listen | `general_support` | — |

---

## 4. Skill Levels

| Level | Label | Meaning |
|---|---|---|
| 1 | Ready | Completed the scenario once |
| 2 | Experienced | Active in 10+ sessions in this category |
| 3 | Mentor | Active in 30+ sessions; eligible for peer reviewer role (future) |

---

## 5. Badge States

| State | Color | Visual |
|---|---|---|
| Locked | Slate gray | 40% opacity, padlock overlay |
| In progress | Blue | Partial fill animation |
| Active / earned | Sage green (baseline) or Amber (specialty) | Full color, solid |
| Inactive (lapsed) | Full color at 40% opacity | Small clock indicator |
| Suspended | Amber with pause indicator | Pause icon overlay |

---

## Change Log

| Date | Version | Change | Approved by |
|---|---|---|---|
| 2026-07-28 | v1 | Initial freeze | Antony Kiriinya |
