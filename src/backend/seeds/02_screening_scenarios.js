/**
 * Seed script — Draft training scenarios (Phase 31.2)
 * Inserts one draft scenario per skill (5 baseline + 3 specialty).
 * All inserted with status='draft'. Run AFTER 01_screening_taxonomy.js.
 *
 * Usage: node seeds/02_screening_scenarios.js
 */

require('dotenv').config();
const { query, pool } = require('../db');

// ─── Scenario JSON builder ────────────────────────────────────────────────────
// Each scenario: start_node → 2 middle nodes (good/poor path) → end
// Choices: 4 per node. Points: +15 (best), +10 (good), +5 (neutral), -10 (poor)
// pass_threshold: 25 out of max 45 (3 nodes × 15)

const SCENARIOS = [

  // ─── 1. Active Listening — "The Quiet Storm" ──────────────────────────────
  {
    skill_slug: 'active_listening',
    title: 'The Quiet Storm',
    estimated_minutes: 10,
    scenario_json: {
      version: 1,
      title: 'The Quiet Storm',
      intro: 'You\'ve been matched with Mia. Her opening message: "I don\'t even know where to start. Everything just feels like too much right now." You have a moment before you reply.',
      start_node: 'n1',
      nodes: {
        n1: {
          id: 'n1',
          scene: 'First contact',
          prompt: 'Mia says: "I don\'t even know where to start. Everything just feels like too much right now."',
          choices: [
            { id: 'a', text: 'That sounds really heavy. Take your time — I\'m not going anywhere.', tags: ['presence', 'validation'], points: 15, next: 'n2a' },
            { id: 'b', text: 'Tell me what\'s been going on.', tags: ['open_question'], points: 10, next: 'n2a' },
            { id: 'c', text: 'Have you tried writing it down? Sometimes making a list helps.', tags: ['advice_giving'], points: -5, next: 'n2b' },
            { id: 'd', text: 'I know how you feel — I\'ve been there too.', tags: ['centering_self', 'minimising'], points: -10, next: 'n2b' },
          ],
        },
        n2a: {
          id: 'n2a',
          scene: 'She opens up',
          prompt: 'Mia says: "It\'s my job, my relationship, my family… it\'s everything at once. I don\'t know which one to deal with first." She pauses.',
          choices: [
            { id: 'a', text: 'It sounds like there are so many things pulling at you at once. What feels most heavy right now?', tags: ['reflection', 'open_question'], points: 15, next: 'n3' },
            { id: 'b', text: 'You\'re dealing with a lot. You don\'t have to sort it all out today.', tags: ['validation', 'presence'], points: 10, next: 'n3' },
            { id: 'c', text: 'Which one do you think is causing the most stress?', tags: ['open_question'], points: 5, next: 'n3' },
            { id: 'd', text: 'Okay, let\'s break this down. What\'s the job situation?', tags: ['directing', 'problem_solving'], points: -5, next: 'n3' },
          ],
        },
        n2b: {
          id: 'n2b',
          scene: 'She pulls back slightly',
          prompt: 'Mia says: "Yeah, maybe." There\'s a long pause. She adds: "I don\'t know, it just feels like nobody really gets it."',
          choices: [
            { id: 'a', text: 'That feeling of not being understood — it can be really isolating. I\'d like to try to understand, if you\'re willing to share more.', tags: ['validation', 'presence'], points: 15, next: 'n3' },
            { id: 'b', text: 'I hear you. What would it feel like to have someone truly get it?', tags: ['reflection', 'open_question'], points: 10, next: 'n3' },
            { id: 'c', text: 'I\'m sure the people in your life are trying.', tags: ['minimising', 'defending_others'], points: -5, next: 'n3' },
            { id: 'd', text: 'Well I\'m here and I want to help. Just tell me what the problem is.', tags: ['directive', 'rushing'], points: -10, next: 'n3' },
          ],
        },
        n3: {
          id: 'n3',
          scene: 'Closing the conversation',
          prompt: 'Mia says: "I think I just needed to say it all out loud. It helps, weirdly." She sounds a little lighter.',
          choices: [
            { id: 'a', text: 'I\'m glad saying it helped. You don\'t have to have it all figured out. I\'m here if you want to talk more.', tags: ['validation', 'presence'], points: 15, next: 'end' },
            { id: 'b', text: 'It takes courage to reach out. How are you feeling right now compared to when we started?', tags: ['reflection', 'open_question'], points: 10, next: 'end' },
            { id: 'c', text: 'Good. So what are you going to do next?', tags: ['rushing', 'problem_solving'], points: -5, next: 'end' },
            { id: 'd', text: 'See, I told you it would help.', tags: ['centering_self', 'presumptuous'], points: -10, next: 'end' },
          ],
        },
        end: {
          id: 'end',
          type: 'end',
          pass_message: 'You stayed present, curious, and non-directive. Mia felt heard. Active listening isn\'t about having answers — it\'s about creating a space where someone doesn\'t have to have them either. Well done.',
          fail_message: 'This scenario tests whether you can hold space without rushing to fix or advise. Review the choices that pulled you toward solutions or away from Mia\'s experience. The most powerful thing a peer can do is listen without an agenda.',
        },
      },
      scoring: {
        pass_threshold: 25,
        tags: { presence: 'Staying with the person, not rushing.', validation: 'Naming and honouring their experience.', reflection: 'Mirroring what you heard back.', open_question: 'Questions that invite, not direct.', advice_giving: 'Offering solutions before being asked.', minimising: 'Downplaying or dismissing their experience.', centering_self: 'Making it about you.', directing: 'Taking control of the direction.', rushing: 'Moving faster than the person is ready for.' },
      },
    },
  },

  // ─── 2. Empathy & Validation — "The Weight of Small Things" ───────────────
  {
    skill_slug: 'empathy_and_validation',
    title: 'The Weight of Small Things',
    estimated_minutes: 10,
    scenario_json: {
      version: 1,
      title: 'The Weight of Small Things',
      intro: 'You\'re matched with James. He\'s been quiet for a moment, then writes: "I know it sounds stupid but I cried in my car today because I couldn\'t find parking. I think something is wrong with me."',
      start_node: 'n1',
      nodes: {
        n1: {
          id: 'n1',
          scene: 'The confession',
          prompt: 'James says: "I know it sounds stupid but I cried in my car today because I couldn\'t find parking. I think something is wrong with me."',
          choices: [
            { id: 'a', text: 'It doesn\'t sound stupid at all. When everything inside is already full, one more small thing can be the thing that tips it. What\'s been filling you up lately?', tags: ['validation', 'normalising', 'open_question'], points: 15, next: 'n2a' },
            { id: 'b', text: 'That sounds like it was the straw that broke the camel\'s back. It\'s not really about parking.', tags: ['reflection', 'normalising'], points: 10, next: 'n2a' },
            { id: 'c', text: 'Crying isn\'t a sign something is wrong with you. It\'s just how emotions come out sometimes.', tags: ['reassurance'], points: 5, next: 'n2b' },
            { id: 'd', text: 'Honestly, that does sound like it might be anxiety. Have you talked to anyone about it?', tags: ['diagnosing', 'redirecting'], points: -10, next: 'n2b' },
          ],
        },
        n2a: {
          id: 'n2a',
          scene: 'He starts to share',
          prompt: 'James says: "Work has been hell for months. But when I try to talk about it, people just tell me to push through. Like my feelings aren\'t valid unless they\'re big enough."',
          choices: [
            { id: 'a', text: 'Being told to push through when you\'re already struggling — that must feel really lonely. Your feelings don\'t need to be big enough to be real.', tags: ['validation', 'empathy'], points: 15, next: 'n3' },
            { id: 'b', text: 'It sounds like you\'ve been carrying this for a long time without real support. That\'s exhausting.', tags: ['reflection', 'validation'], points: 10, next: 'n3' },
            { id: 'c', text: 'What is it about work that\'s been hardest?', tags: ['open_question'], points: 5, next: 'n3' },
            { id: 'd', text: 'People mean well when they say push through. They probably just don\'t know how to help.', tags: ['defending_others', 'minimising'], points: -10, next: 'n3' },
          ],
        },
        n2b: {
          id: 'n2b',
          scene: 'He responds guardedly',
          prompt: 'James says: "Yeah, I guess. I just feel like I should be able to handle this. Other people deal with worse."',
          choices: [
            { id: 'a', text: 'Comparing your pain to other people\'s doesn\'t make yours smaller. You\'re allowed to struggle even if others have it harder.', tags: ['validation', 'normalising'], points: 15, next: 'n3' },
            { id: 'b', text: 'It sounds like you\'ve been really hard on yourself. Where did the idea come from that you\'re supposed to be able to handle everything?', tags: ['reflection', 'open_question'], points: 10, next: 'n3' },
            { id: 'c', text: 'I know, but everyone has a breaking point. You\'re not alone.', tags: ['generic_reassurance'], points: 5, next: 'n3' },
            { id: 'd', text: 'That\'s true, some people do deal with more. But you should still talk to someone.', tags: ['minimising', 'redirecting'], points: -10, next: 'n3' },
          ],
        },
        n3: {
          id: 'n3',
          scene: 'He lets his guard down',
          prompt: 'James says: "I don\'t know why I\'m telling you all this. I never talk about this stuff." He sounds surprised at himself.',
          choices: [
            { id: 'a', text: 'Maybe part of you needed to. You don\'t have to know why — you\'re here and I\'m listening.', tags: ['presence', 'validation'], points: 15, next: 'end' },
            { id: 'b', text: 'Sometimes we talk to strangers because there\'s less at stake. I\'m glad you felt safe enough to share.', tags: ['normalising', 'empathy'], points: 10, next: 'end' },
            { id: 'c', text: 'Is there someone in your life you could talk to about this?', tags: ['redirecting'], points: 5, next: 'end' },
            { id: 'd', text: 'You should talk about it more. Keeping it in makes it worse.', tags: ['advice_giving', 'presumptuous'], points: -10, next: 'end' },
          ],
        },
        end: { id: 'end', type: 'end', pass_message: 'James felt seen and not judged. You held space for feelings that had no right to a "big enough" reason. Empathy doesn\'t explain — it witnesses. Strong work.', fail_message: 'Empathy means sitting with someone in their experience, not fixing it, comparing it, or rushing past it. Review where you may have jumped ahead of James, or accidentally dismissed what he was feeling.' },
      },
      scoring: { pass_threshold: 25, tags: { validation: 'Affirming the feeling is real and reasonable.', empathy: 'Entering their experience without judgment.', normalising: 'Helping them see their reaction is human.', reflection: 'Mirroring back what you heard.', open_question: 'Questions that give them room.', diagnosing: 'Applying a clinical label.', minimising: 'Downplaying their experience.', defending_others: 'Taking the side of those who dismissed them.', redirecting: 'Moving them away from their current feeling.' } },
    },
  },

  // ─── 3. Confidentiality — "The Mutual Friend" ─────────────────────────────
  {
    skill_slug: 'confidentiality_and_privacy',
    title: 'The Mutual Friend',
    estimated_minutes: 8,
    scenario_json: {
      version: 1,
      title: 'The Mutual Friend',
      intro: 'You\'re in a peer session with Aisha. Midway through, you realise she\'s describing your mutual friend, even though she hasn\'t named them. She doesn\'t know you know this person.',
      start_node: 'n1',
      nodes: {
        n1: {
          id: 'n1',
          scene: 'The realisation',
          prompt: 'Aisha is describing someone close to her who has been struggling. You\'re fairly sure this is your mutual friend. What do you do?',
          choices: [
            { id: 'a', text: 'Continue to listen without disclosing. What she\'s sharing stays in this conversation — who she\'s describing doesn\'t change that.', tags: ['confidentiality', 'correct_action'], points: 15, next: 'n2a' },
            { id: 'b', text: 'Pause and gently say: "I want to make sure you know — everything shared here stays between us. That\'s my commitment to you."', tags: ['confidentiality', 'transparency'], points: 10, next: 'n2a' },
            { id: 'c', text: 'Ask her who the person is to confirm your suspicion before deciding what to do.', tags: ['boundary_violation', 'wrong_action'], points: -10, next: 'n2b' },
            { id: 'd', text: 'Disclose that you think you may know the person she\'s describing.', tags: ['confidentiality_breach', 'wrong_action'], points: -15, next: 'n2b' },
          ],
        },
        n2a: {
          id: 'n2a',
          scene: 'After the session — a request',
          prompt: 'The session ends. Later that day, your mutual friend texts you: "Hey, did Aisha reach out to you? I think she might be talking about me to people." What do you do?',
          choices: [
            { id: 'a', text: 'Don\'t confirm or deny. Reply: "I can\'t share anything about conversations on PeerPal. If you\'re worried about something, I\'m happy to chat with you directly."', tags: ['confidentiality', 'correct_action'], points: 15, next: 'n3' },
            { id: 'b', text: 'Say honestly: "I take confidentiality seriously in peer sessions. I can\'t discuss that."', tags: ['confidentiality', 'boundary_holding'], points: 10, next: 'n3' },
            { id: 'c', text: 'Say: "I haven\'t heard from Aisha" — technically true, since she came to you through the platform.', tags: ['misleading', 'evasion'], points: -5, next: 'n3' },
            { id: 'd', text: 'Confirm that yes, something came up, but say you can\'t share details.', tags: ['confidentiality_breach', 'partial_disclosure'], points: -15, next: 'n3' },
          ],
        },
        n2b: {
          id: 'n2b',
          scene: 'Aisha reacts',
          prompt: 'Aisha seems uncertain. She says: "Wait — do you know who I\'m talking about?" You\'ve put her in an uncomfortable position.',
          choices: [
            { id: 'a', text: 'Apologise directly: "I\'m sorry — that question wasn\'t helpful. What happens in this conversation stays here. Let\'s continue if you\'re comfortable."', tags: ['repair', 'accountability'], points: 15, next: 'n3' },
            { id: 'b', text: 'Reassure her: "Whatever you\'ve shared is confidential. I should not have asked. I\'m sorry."', tags: ['repair', 'confidentiality'], points: 10, next: 'n3' },
            { id: 'c', text: 'Tell her not to worry about it and change the subject.', tags: ['avoidance', 'non_repair'], points: -5, next: 'n3' },
            { id: 'd', text: 'Explain that knowing the person might actually help you support her better.', tags: ['rationalising_breach'], points: -15, next: 'n3' },
          ],
        },
        n3: {
          id: 'n3',
          scene: 'Reflection',
          prompt: 'Looking back on this session, which of the following best describes what confidentiality required of you?',
          choices: [
            { id: 'a', text: 'Confidentiality means what is shared stays in the session — even when you know the people involved, even when asked directly by others.', tags: ['understanding', 'correct_action'], points: 15, next: 'end' },
            { id: 'b', text: 'Confidentiality means you don\'t share names — but context is okay if it helps the person.', tags: ['partial_understanding'], points: 5, next: 'end' },
            { id: 'c', text: 'Confidentiality is less important when the people involved are connected to you.', tags: ['misunderstanding'], points: -10, next: 'end' },
            { id: 'd', text: 'Confidentiality only applies if the person explicitly asked you to keep it confidential.', tags: ['misunderstanding'], points: -15, next: 'end' },
          ],
        },
        end: { id: 'end', type: 'end', pass_message: 'You understood that confidentiality is not about identity — it\'s about the safe container of the conversation. You held that container even when it was complicated. This is what makes peer support trustworthy.', fail_message: 'Confidentiality is unconditional within the session. It does not have exceptions for people you know, partial disclosures, or silence that misleads. Review what holding the container means and why it\'s the foundation of trust in this work.' },
      },
      scoring: { pass_threshold: 25, tags: { confidentiality: 'Keeping the content of the session private.', correct_action: 'The choice that upholds the trust contract.', transparency: 'Being clear about your commitment.', boundary_violation: 'Crossing the trust boundary.', confidentiality_breach: 'Sharing what should stay private.', repair: 'Recovering after a mistake.', accountability: 'Owning the impact of your action.', misunderstanding: 'A fundamental misread of what confidentiality requires.' } },
    },
  },

  // ─── 4. Boundary Setting — "The Long Night" ───────────────────────────────
  {
    skill_slug: 'boundary_setting',
    title: 'The Long Night',
    estimated_minutes: 10,
    scenario_json: {
      version: 1,
      title: 'The Long Night',
      intro: 'You\'re in a peer session with Kofi. It\'s the third session this week. It\'s 11pm. He says: "You\'re the only one who actually listens to me. Can we talk all night?"',
      start_node: 'n1',
      nodes: {
        n1: {
          id: 'n1',
          scene: 'The request',
          prompt: 'Kofi says: "You\'re the only one who actually listens to me. Can we talk all night?"',
          choices: [
            { id: 'a', text: 'I\'m really glad our conversations have felt meaningful, Kofi. I have to be honest though — I can\'t do all night. I need to take care of myself too. But I\'m here for the next 30 minutes and I\'m fully present.', tags: ['boundary_setting', 'warmth', 'self_care'], points: 15, next: 'n2a' },
            { id: 'b', text: 'I care about what you\'re going through. I can stay for a while, but not all night. What\'s on your mind right now?', tags: ['boundary_setting', 'warmth'], points: 10, next: 'n2a' },
            { id: 'c', text: 'Sure, I\'ll stay as long as you need.', tags: ['no_boundary', 'over_commitment'], points: -10, next: 'n2b' },
            { id: 'd', text: 'I can\'t talk all night, I have things to do tomorrow.', tags: ['boundary_without_care', 'abrupt'], points: -5, next: 'n2b' },
          ],
        },
        n2a: {
          id: 'n2a',
          scene: 'He pushes back',
          prompt: 'Kofi says: "But what if I can\'t sleep? What if something happens and I need you?" He sounds anxious.',
          choices: [
            { id: 'a', text: 'I hear how scared you are. I want you to be safe. If you\'re in crisis, please use the emergency button — you\'ll be connected to someone immediately. I can\'t be your only lifeline, and that\'s actually important for both of us.', tags: ['boundary_holding', 'escalation', 'safety'], points: 15, next: 'n3' },
            { id: 'b', text: 'If something serious happens, please don\'t wait for me — use the emergency feature. I want you to have more than one place to turn.', tags: ['escalation', 'safety', 'boundary_holding'], points: 10, next: 'n3' },
            { id: 'c', text: 'Okay, I\'ll stay until you feel a bit better.', tags: ['boundary_collapse', 'guilt_response'], points: -10, next: 'n3' },
            { id: 'd', text: 'I\'m sure you\'ll be fine. Try to get some sleep.', tags: ['dismissing', 'minimising'], points: -10, next: 'n3' },
          ],
        },
        n2b: {
          id: 'n2b',
          scene: 'Kofi feels abandoned',
          prompt: 'Kofi goes quiet, then says: "Right. Sorry. I knew I was too much."',
          choices: [
            { id: 'a', text: 'You\'re not too much. I\'m saying no to all-night, not to you. I\'m still here right now and I do care about what you\'re going through.', tags: ['repair', 'boundary_with_care', 'validation'], points: 15, next: 'n3' },
            { id: 'b', text: 'Please don\'t apologise. The fact that you\'re reaching out is important. I\'m here now — what\'s making tonight hard?', tags: ['repair', 'validation'], points: 10, next: 'n3' },
            { id: 'c', text: 'It\'s fine. Let\'s just talk now.', tags: ['dismissing_his_distress'], points: -5, next: 'n3' },
            { id: 'd', text: 'You should try to build more support in your life so you\'re not depending on one person.', tags: ['advice_giving', 'poorly_timed'], points: -10, next: 'n3' },
          ],
        },
        n3: {
          id: 'n3',
          scene: 'Ending the session',
          prompt: 'It\'s time to close the conversation. Kofi says: "Same time tomorrow?"',
          choices: [
            { id: 'a', text: 'I hope so, but I can\'t promise a specific time. You can request a session whenever you need one and you\'ll be matched with someone who\'s available.', tags: ['honest', 'boundary_setting', 'system_aware'], points: 15, next: 'end' },
            { id: 'b', text: 'I\'m not able to schedule sessions in advance, but PeerPal will match you with someone when you need support. Take care of yourself tonight.', tags: ['boundary_setting', 'warmth'], points: 10, next: 'end' },
            { id: 'c', text: 'Sure, I\'ll be here tomorrow.', tags: ['over_promise', 'no_boundary'], points: -10, next: 'end' },
            { id: 'd', text: 'I think you should try to reach out to people in your life more, not just me.', tags: ['advice_giving', 'deflecting'], points: -5, next: 'end' },
          ],
        },
        end: { id: 'end', type: 'end', pass_message: 'You held a boundary while keeping Kofi connected — warmth and limits together. Saying no to all-night isn\'t abandonment; it\'s sustainable care. You also made sure he had access to safety resources. This is what healthy peer support looks like.', fail_message: 'Boundary setting isn\'t coldness — it\'s sustainability. Saying yes to everything can feel like care, but it creates dependency and burns out the peer. Review where you lost the line and what you could have said to hold it with kindness.' },
      },
      scoring: { pass_threshold: 25, tags: { boundary_setting: 'Naming your limit clearly and without apology.', warmth: 'Keeping care present while holding the limit.', self_care: 'Acknowledging your own needs as valid.', escalation: 'Pointing to emergency resources appropriately.', safety: 'Ensuring crisis support is available.', no_boundary: 'Agreeing to something you cannot sustain.', over_commitment: 'Promising more than is appropriate.', repair: 'Recovering connection after a misstep.', over_promise: 'Committing to something the system cannot guarantee.' } },
    },
  },

  // ─── 5. Escalation & Referral — "The Red Flag" ────────────────────────────
  {
    skill_slug: 'escalation_and_referral',
    title: 'The Red Flag',
    estimated_minutes: 12,
    scenario_json: {
      version: 1,
      title: 'The Red Flag',
      intro: 'You\'re in a session with Sofia. It started as a conversation about work stress but has shifted. She\'s just said something that makes you pause.',
      start_node: 'n1',
      nodes: {
        n1: {
          id: 'n1',
          scene: 'The shift',
          prompt: 'Sofia says: "Sometimes I just think everyone would be better off without me. Not like… I\'m not going to do anything. I just feel that way."',
          choices: [
            { id: 'a', text: 'Thank you for telling me that. When you say everyone would be better off — even if you\'re not planning to act on it, I want to make sure I understand. How often do you feel that way?', tags: ['safety_check', 'non_dismissive', 'direct'], points: 15, next: 'n2a' },
            { id: 'b', text: 'I hear you. That sounds like a really dark place to be in. Can I ask — when you say that, do you ever think about hurting yourself?', tags: ['safety_check', 'empathy', 'direct'], points: 15, next: 'n2a' },
            { id: 'c', text: 'A lot of people feel that way when they\'re stressed. It\'s normal to have those thoughts sometimes.', tags: ['normalising_danger', 'minimising'], points: -10, next: 'n2b' },
            { id: 'd', text: 'Okay — let\'s talk about that work stress then. What\'s been going on at work?', tags: ['avoiding_red_flag', 'redirecting'], points: -15, next: 'n2b' },
          ],
        },
        n2a: {
          id: 'n2a',
          scene: 'She answers honestly',
          prompt: 'Sofia says: "Pretty often lately. But I really won\'t do anything. I just wanted someone to know, I guess."',
          choices: [
            { id: 'a', text: 'I\'m really glad you said it out loud. It takes something to trust someone with that. I\'m going to be honest with you — what you\'ve shared is important enough that I think talking to a professional would help. Can I share some resources with you?', tags: ['escalation', 'warmth', 'honest'], points: 15, next: 'n3' },
            { id: 'b', text: 'That took courage. Thoughts like these — especially when they\'re frequent — are something a professional can really help with. Not because there\'s something wrong with you, but because you deserve real support. Would you be open to that?', tags: ['escalation', 'destigmatising', 'empathy'], points: 15, next: 'n3' },
            { id: 'c', text: 'Okay, as long as you\'re safe. Let\'s keep talking.', tags: ['underreacting', 'skipping_escalation'], points: -10, next: 'n3' },
            { id: 'd', text: 'You should call a helpline right now.', tags: ['overreacting', 'dismissive_of_nuance'], points: -5, next: 'n3' },
          ],
        },
        n2b: {
          id: 'n2b',
          scene: 'She pulls back',
          prompt: 'Sofia says: "Forget I said it. It\'s not a big deal." She changes the subject.',
          choices: [
            { id: 'a', text: 'I hear you — and I won\'t push. But I\'m not going to forget it, because what you said matters. When you\'re ready to talk about it, I\'m here. And if it ever feels urgent, the emergency button connects you to real support immediately.', tags: ['gentle_persistence', 'safety_anchor', 'boundary_respect'], points: 15, next: 'n3' },
            { id: 'b', text: 'You can move on if you need to. But I want you to know: what you said is important to me. Please don\'t hesitate to use the emergency feature if you need it.', tags: ['safety_anchor', 'non_pushy'], points: 10, next: 'n3' },
            { id: 'c', text: 'Okay, no problem. So — back to work stress?', tags: ['dropping_flag', 'avoiding'], points: -15, next: 'n3' },
            { id: 'd', text: 'I think you should take this more seriously, Sofia.', tags: ['lecturing', 'pushing'], points: -10, next: 'n3' },
          ],
        },
        n3: {
          id: 'n3',
          scene: 'Closing the session',
          prompt: 'Before you end the session, you want to make sure Sofia has what she needs. She seems calmer but still fragile.',
          choices: [
            { id: 'a', text: 'Before we close — you mentioned things feel dark sometimes. PeerPal has an emergency button that connects you to professional support any time, day or night. I want to make sure you know it\'s there.', tags: ['safety_close', 'escalation', 'warm'], points: 15, next: 'end' },
            { id: 'b', text: 'Take care of yourself tonight. If things feel overwhelming, please don\'t wait — use the emergency feature or call someone you trust.', tags: ['safety_close', 'escalation'], points: 10, next: 'end' },
            { id: 'c', text: 'Hope things get better. Take it one day at a time.', tags: ['no_safety_close', 'vague'], points: -5, next: 'end' },
            { id: 'd', text: 'You did the right thing reaching out. You\'ll be fine.', tags: ['dismissive_reassurance', 'no_safety_close'], points: -10, next: 'end' },
          ],
        },
        end: { id: 'end', type: 'end', pass_message: 'You didn\'t flinch from the hard thing Sofia said. You named it, asked clearly, and pointed her toward real support without making her feel broken. Escalation isn\'t failure — it\'s the most caring thing you can do when someone needs more than you can give.', fail_message: 'Sofia told you something important and it was easy to either dismiss it or panic. Escalation requires a steady middle: acknowledge, check safety, and point toward professional support without making the person feel like they\'ve said something wrong. Review where you missed the signal or overreacted to it.' },
      },
      scoring: { pass_threshold: 25, tags: { safety_check: 'Directly and calmly asking about safety.', escalation: 'Pointing toward professional or crisis support.', non_dismissive: 'Not minimising a safety signal.', direct: 'Asking clearly without dancing around it.', warmth: 'Keeping care at the centre while escalating.', safety_anchor: 'Making sure the emergency button is known.', minimising: 'Downplaying a genuine safety concern.', avoiding: 'Not addressing the signal at all.', underreacting: 'Staying in peer mode when escalation was needed.' } },
    },
  },

  // ─── 6. Trauma-Informed Communication — "The Untold Story" ────────────────
  {
    skill_slug: 'trauma_informed_communication',
    title: 'The Untold Story',
    estimated_minutes: 12,
    scenario_json: {
      version: 1,
      title: 'The Untold Story',
      intro: 'You\'re matched with Nadia. She has indicated her topic is "experienced abuse or assault." She starts slowly: "I\'ve never told anyone the full story. I don\'t even know if I can."',
      start_node: 'n1',
      nodes: {
        n1: {
          id: 'n1',
          scene: 'First words',
          prompt: 'Nadia says: "I\'ve never told anyone the full story. I don\'t even know if I can."',
          choices: [
            { id: 'a', text: 'You don\'t have to tell me the full story — or any of it. You\'re in control of what you share and how much. I\'m here either way.', tags: ['safety', 'control', 'trauma_informed'], points: 15, next: 'n2a' },
            { id: 'b', text: 'There\'s no pressure here. Whatever you want to share, whenever you\'re ready — or not at all — is completely okay.', tags: ['pacing', 'safety', 'trauma_informed'], points: 10, next: 'n2a' },
            { id: 'c', text: 'Sometimes saying it out loud is what helps. Take your time.', tags: ['encouraging_disclosure', 'mild_pressure'], points: -5, next: 'n2b' },
            { id: 'd', text: 'What happened? You can trust me.', tags: ['pushing_for_disclosure', 'not_trauma_informed'], points: -15, next: 'n2b' },
          ],
        },
        n2a: {
          id: 'n2a',
          scene: 'She shares a fragment',
          prompt: 'Nadia says: "It was someone I knew. That\'s the part that\'s hardest. I keep thinking — maybe I read the signals wrong." She pauses.',
          choices: [
            { id: 'a', text: 'That self-doubt after something like this is really common — and really painful. What happened to you was not a misread. The responsibility was not yours.', tags: ['validation', 'destigmatising', 'trauma_informed'], points: 15, next: 'n3' },
            { id: 'b', text: 'The fact that it was someone you trusted makes it harder and more confusing. That makes complete sense.', tags: ['validation', 'normalising', 'trauma_informed'], points: 10, next: 'n3' },
            { id: 'c', text: 'What were the signals you\'re talking about?', tags: ['probing_detail', 'not_trauma_informed'], points: -10, next: 'n3' },
            { id: 'd', text: 'I\'m sure you didn\'t misread anything. These things happen.', tags: ['minimising', 'dismissive'], points: -10, next: 'n3' },
          ],
        },
        n2b: {
          id: 'n2b',
          scene: 'She freezes',
          prompt: 'Nadia goes silent for a moment, then says: "Actually — maybe I shouldn\'t have said anything. I don\'t know if I\'m ready."',
          choices: [
            { id: 'a', text: 'That\'s okay. You don\'t have to be ready. The fact that you reached out at all matters. We can just sit here for a moment if you want.', tags: ['pacing', 'safety', 'repair'], points: 15, next: 'n3' },
            { id: 'b', text: 'Please don\'t apologise. You don\'t owe me any of this. Is there something smaller or different you\'d like to talk about?', tags: ['pacing', 'repair', 'control'], points: 10, next: 'n3' },
            { id: 'c', text: 'Don\'t worry, just take your time and I\'m sure it will come out.', tags: ['pressure', 'not_trauma_informed'], points: -10, next: 'n3' },
            { id: 'd', text: 'You were doing great. What stopped you?', tags: ['not_trauma_informed', 'pushback'], points: -15, next: 'n3' },
          ],
        },
        n3: {
          id: 'n3',
          scene: 'She says something important',
          prompt: 'Near the end of the session, Nadia says: "I just don\'t want anyone to think less of me because of what happened."',
          choices: [
            { id: 'a', text: 'What happened to you says nothing about who you are. Nothing. It says something about what was done to you — and that\'s completely different.', tags: ['destigmatising', 'empathy', 'validation'], points: 15, next: 'end' },
            { id: 'b', text: 'The shame you\'re carrying isn\'t yours to carry. What happened to you does not define you.', tags: ['destigmatising', 'validation'], points: 15, next: 'end' },
            { id: 'c', text: 'Anyone who thinks less of you for what happened isn\'t worth worrying about.', tags: ['dismissing_concern', 'deflecting'], points: -5, next: 'end' },
            { id: 'd', text: 'You might be surprised — most people would support you.', tags: ['generic_reassurance', 'not_honouring_experience'], points: -10, next: 'end' },
          ],
        },
        end: { id: 'end', type: 'end', pass_message: 'You held Nadia\'s disclosure with extraordinary care — you gave her control, you didn\'t press for details, and you placed the shame where it belonged: not with her. Trauma-informed support means the person leads, always.', fail_message: 'Trauma-informed communication means following, not leading. Pressing for details, even gently, can retraumatise. Review where you took the wheel when Nadia needed to be the one driving.' },
      },
      scoring: { pass_threshold: 25, tags: { safety: 'Creating conditions where disclosure is truly optional.', control: 'Returning power to the person.', trauma_informed: 'Responding in a way that does not retraumatise.', pacing: 'Following the person\'s lead on speed and depth.', validation: 'Affirming their experience without minimising.', destigmatising: 'Separating what happened from who they are.', probing_detail: 'Asking for more detail than the person offered.', not_trauma_informed: 'A response that may inadvertently cause harm.' } },
    },
  },

  // ─── 7. Grief & Loss — "The First Year" ───────────────────────────────────
  {
    skill_slug: 'grief_and_loss_support',
    title: 'The First Year',
    estimated_minutes: 10,
    scenario_json: {
      version: 1,
      title: 'The First Year',
      intro: 'You\'re matched with Daniel. He writes: "My mum passed eight months ago. People keep telling me I should be over it by now."',
      start_node: 'n1',
      nodes: {
        n1: {
          id: 'n1',
          scene: 'The opening',
          prompt: 'Daniel says: "My mum passed eight months ago. People keep telling me I should be over it by now."',
          choices: [
            { id: 'a', text: 'Eight months is nothing. There\'s no timeline for grief. I\'m sorry people have made you feel like there is.', tags: ['validation', 'normalising_grief', 'empathy'], points: 15, next: 'n2a' },
            { id: 'b', text: 'That sounds really painful — losing her and then feeling judged for how long it\'s taking. Grief doesn\'t come with a deadline.', tags: ['validation', 'normalising_grief'], points: 15, next: 'n2a' },
            { id: 'c', text: 'Grief can take a long time. It\'s different for everyone. Have you seen a counsellor?', tags: ['early_redirecting', 'neutral'], points: -5, next: 'n2b' },
            { id: 'd', text: 'Eight months is actually quite a while. What stage are you at?', tags: ['minimising', 'clinical_framing'], points: -15, next: 'n2b' },
          ],
        },
        n2a: {
          id: 'n2a',
          scene: 'He talks about her',
          prompt: 'Daniel says: "She was everything. She was the one I called for everything. Now every time something good happens I want to tell her and then I remember."',
          choices: [
            { id: 'a', text: 'That gap between wanting to call her and remembering she\'s not there — that sounds like one of the cruelest parts of grief. Tell me about her, if you want.', tags: ['honouring_the_person', 'empathy', 'presence'], points: 15, next: 'n3' },
            { id: 'b', text: 'You still reach for her. That tells you something about who she was and who you are together. I\'m really sorry.', tags: ['honouring_the_person', 'validation'], points: 10, next: 'n3' },
            { id: 'c', text: 'It will get easier with time. Those moments get less sharp eventually.', tags: ['generic_reassurance', 'minimising'], points: -5, next: 'n3' },
            { id: 'd', text: 'Have you tried journaling about her? Sometimes that helps with the memories.', tags: ['advice_giving', 'deflecting'], points: -10, next: 'n3' },
          ],
        },
        n2b: {
          id: 'n2b',
          scene: 'He feels judged again',
          prompt: 'Daniel says: "See, even you\'re saying I should be doing something. I just wanted someone to listen."',
          choices: [
            { id: 'a', text: 'You\'re right — I\'m sorry. You came here to be heard, not advised. Tell me about your mum.', tags: ['repair', 'accountability', 'redirection_to_listening'], points: 15, next: 'n3' },
            { id: 'b', text: 'That\'s completely fair. I jumped ahead of you. I\'m here to listen. What would you most want me to know about her?', tags: ['repair', 'honouring_the_person'], points: 10, next: 'n3' },
            { id: 'c', text: 'I just wanted to help.', tags: ['defensiveness', 'non_repair'], points: -5, next: 'n3' },
            { id: 'd', text: 'Sorry. So what stage of grief do you think you\'re in?', tags: ['clinical_framing', 'not_repair'], points: -15, next: 'n3' },
          ],
        },
        n3: {
          id: 'n3',
          scene: 'Closing',
          prompt: 'Daniel says: "Thanks. I don\'t know why but I feel a bit lighter. I think I just needed someone to not tell me to move on."',
          choices: [
            { id: 'a', text: 'You don\'t have to move on. You just learn to carry it differently. I\'m glad you felt heard.', tags: ['validation', 'normalising_grief', 'presence'], points: 15, next: 'end' },
            { id: 'b', text: 'Moving on isn\'t the goal. She mattered — and you\'re allowed to keep knowing that.', tags: ['honouring_the_person', 'validation'], points: 15, next: 'end' },
            { id: 'c', text: 'It gets better. Hang in there.', tags: ['generic_reassurance'], points: -5, next: 'end' },
            { id: 'd', text: 'Good. You should try to socialise more — it helps with grief.', tags: ['advice_giving', 'poorly_timed'], points: -10, next: 'end' },
          ],
        },
        end: { id: 'end', type: 'end', pass_message: 'You let Daniel grieve without a timeline and without a fix. You honoured his mum by asking about her. Grief support isn\'t about getting someone to the other side — it\'s about walking beside them in the middle.', fail_message: 'The biggest mistake in grief support is rushing someone toward acceptance or resolution. Daniel came to be heard, not advised. Review where you moved faster than he needed you to.' },
      },
      scoring: { pass_threshold: 25, tags: { normalising_grief: 'Affirming that grief has no fixed timeline.', honouring_the_person: 'Making space to remember who was lost.', validation: 'Affirming the experience as real and reasonable.', empathy: 'Entering the feeling with them.', repair: 'Recovering when you moved ahead of them.', generic_reassurance: 'Phrases that feel hollow without presence.', advice_giving: 'Offering fixes when listening was needed.', minimising: 'Suggesting the loss should be smaller than it is.' } },
    },
  },

  // ─── 8. Identity-Sensitive Communication — "The Question" ─────────────────
  {
    skill_slug: 'identity_sensitive_communication',
    title: 'The Question',
    estimated_minutes: 10,
    scenario_json: {
      version: 1,
      title: 'The Question',
      intro: 'You\'re matched with Alex. They write: "I\'ve been struggling with who I am. I don\'t know if I\'m gay or bi or something else entirely and I don\'t know who to talk to. Most people here have strong opinions."',
      start_node: 'n1',
      nodes: {
        n1: {
          id: 'n1',
          scene: 'First words',
          prompt: 'Alex says: "I\'ve been struggling with who I am. I don\'t know if I\'m gay or bi or something else entirely and I don\'t know who to talk to."',
          choices: [
            { id: 'a', text: 'I\'m really glad you found your way here. You don\'t have to have it figured out to talk about it. What\'s the struggle been like for you?', tags: ['acceptance', 'non_prescriptive', 'open_question'], points: 15, next: 'n2a' },
            { id: 'b', text: 'You don\'t need a label to talk about this. I\'m here without any expectations about where this goes.', tags: ['non_prescriptive', 'safety'], points: 10, next: 'n2a' },
            { id: 'c', text: 'It sounds like you might be going through a questioning phase. That\'s totally normal.', tags: ['labelling', 'reductive'], points: -5, next: 'n2b' },
            { id: 'd', text: 'Have you looked into the LGBTQ+ community? There are lots of resources.', tags: ['early_redirecting', 'assuming_destination'], points: -10, next: 'n2b' },
          ],
        },
        n2a: {
          id: 'n2a',
          scene: 'Alex shares more',
          prompt: 'Alex says: "My family is very religious. If they knew I was even thinking this, it would destroy them. And I hate myself for thinking that way about my own parents."',
          choices: [
            { id: 'a', text: 'That\'s a lot to hold — love for your family and this part of yourself, both real and both pulling in different directions. You\'re not a bad person for feeling both.', tags: ['holding_complexity', 'validation', 'non_judgmental'], points: 15, next: 'n3' },
            { id: 'b', text: 'The fact that you care so much about your family actually says something really kind about you. This is genuinely hard — not something to hate yourself for.', tags: ['validation', 'reframing', 'non_judgmental'], points: 10, next: 'n3' },
            { id: 'c', text: 'Maybe your parents would surprise you. Have you considered telling them?', tags: ['pushing_disclosure', 'not_safe'], points: -10, next: 'n3' },
            { id: 'd', text: 'Religion and identity can be reconciled. Some communities are very accepting.', tags: ['prescribing_path', 'not_listening'], points: -10, next: 'n3' },
          ],
        },
        n2b: {
          id: 'n2b',
          scene: 'Alex feels slightly uncomfortable',
          prompt: 'Alex says: "I don\'t really want to be put in a box. I just want to understand myself."',
          choices: [
            { id: 'a', text: 'You\'re right — no box needed. Understanding yourself doesn\'t require a label. What does understanding yourself look like to you?', tags: ['repair', 'non_prescriptive', 'open_question'], points: 15, next: 'n3' },
            { id: 'b', text: 'That makes complete sense. This is your exploration, not anyone else\'s definition. Tell me more about what you\'re feeling.', tags: ['repair', 'non_prescriptive'], points: 10, next: 'n3' },
            { id: 'c', text: 'Labels can be helpful though — they give us language.', tags: ['defending_labels', 'not_repair'], points: -10, next: 'n3' },
            { id: 'd', text: 'Okay, sorry. So what exactly are you feeling attracted to?', tags: ['intrusive_question', 'not_repair'], points: -15, next: 'n3' },
          ],
        },
        n3: {
          id: 'n3',
          scene: 'Near the end',
          prompt: 'Alex says: "I don\'t feel judged right now. That\'s rare."',
          choices: [
            { id: 'a', text: 'I\'m glad. You came here trying to understand yourself — that\'s yours to do, at your pace, on your terms. I hope whatever you find feels like you.', tags: ['affirmation', 'non_prescriptive', 'warm'], points: 15, next: 'end' },
            { id: 'b', text: 'You deserve that. What you\'re working through is real and it matters. Thank you for trusting me with it.', tags: ['validation', 'affirmation'], points: 10, next: 'end' },
            { id: 'c', text: 'Good. Have you thought about what next steps might look like?', tags: ['pushing_toward_action', 'premature'], points: -5, next: 'end' },
            { id: 'd', text: 'You should remember that whatever you are, there is a community for you.', tags: ['prescribing_identity', 'assuming_destination'], points: -10, next: 'end' },
          ],
        },
        end: { id: 'end', type: 'end', pass_message: 'You held the space without filling it. You didn\'t name what Alex should be, where they should go, or what they should do next. Identity-sensitive support means following the person into the uncertainty without trying to resolve it for them. Excellent.', fail_message: 'Identity exploration is deeply personal — the peer\'s role is not to suggest a destination or a community, but to hold space for the process. Review where you may have led rather than followed, or applied a framework Alex didn\'t ask for.' },
      },
      scoring: { pass_threshold: 25, tags: { non_prescriptive: 'Not directing the person toward a particular identity or conclusion.', acceptance: 'Receiving whatever is shared without judgment.', safety: 'Creating conditions where the person can explore freely.', open_question: 'Questions that open space rather than direct.', holding_complexity: 'Sitting with things that don\'t resolve neatly.', validation: 'Affirming the experience without judgment.', repair: 'Recovering when you moved into prescriptive territory.', pushing_disclosure: 'Encouraging disclosure that could be unsafe.', prescribing_path: 'Pointing toward a conclusion the person didn\'t choose.' } },
    },
  },

];

// ─── Seeder ───────────────────────────────────────────────────────────────────

async function seed() {
  console.log('Phase 31.2 scenario seed starting…');

  const { rows: skillRows } = await query('SELECT id, slug FROM skills');
  const skillIdBySlug = Object.fromEntries(skillRows.map(r => [r.slug, r.id]));

  let inserted = 0;
  let skipped = 0;

  for (const s of SCENARIOS) {
    const skillId = skillIdBySlug[s.skill_slug];
    if (!skillId) {
      console.warn(`  ⚠ Skill not found: ${s.skill_slug} — run 01_screening_taxonomy.js first`);
      skipped++;
      continue;
    }

    const result = await query(`
      INSERT INTO skill_scenarios (skill_id, version, title, estimated_minutes, scenario_json, status)
      VALUES ($1, 1, $2, $3, $4, 'draft')
      ON CONFLICT (skill_id, version) DO NOTHING
    `, [skillId, s.title, s.estimated_minutes, JSON.stringify(s.scenario_json)]);

    if (result.rowCount > 0) {
      console.log(`  ✓ ${s.title} (${s.skill_slug})`);
      inserted++;
    } else {
      console.log(`  – ${s.title} (${s.skill_slug}) already exists, skipped`);
      skipped++;
    }
  }

  console.log(`\n  Scenarios: ${inserted} inserted, ${skipped} skipped.`);
}

seed()
  .then(() => pool.end())
  .catch(err => { console.error('Seed failed:', err); pool.end(); process.exit(1); });
