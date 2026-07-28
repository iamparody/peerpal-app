/**
 * Seed script — Peer Competency Taxonomy (Phase 31.1)
 * Inserts skills, permissions, and topics from taxonomy-v1.md.
 * Safe to re-run: all inserts use ON CONFLICT DO NOTHING.
 *
 * Usage: node seeds/01_screening_taxonomy.js
 */

require('dotenv').config();
const { query, pool } = require('../db');

// ─── Skills ───────────────────────────────────────────────────────────────────

const BASELINE_SKILLS = [
  { slug: 'active_listening',          name: 'Active Listening',          icon_name: 'ear',       description: 'Staying fully present and hearing what is said and unsaid.' },
  { slug: 'empathy_and_validation',    name: 'Empathy & Validation',      icon_name: 'heart',     description: 'Naming and honouring the other person\'s experience without judgement.' },
  { slug: 'confidentiality_and_privacy', name: 'Confidentiality',         icon_name: 'lock',      description: 'Holding what is shared in trust and knowing the limits of that trust.' },
  { slug: 'boundary_setting',          name: 'Boundary Setting',          icon_name: 'shield',    description: 'Knowing and communicating your own limits to protect both parties.', prereqs: ['active_listening'] },
  { slug: 'escalation_and_referral',   name: 'Escalation & Referral',     icon_name: 'lifebuoy',  description: 'Recognising when to bring in professional help and how to do it safely.', prereqs: ['active_listening', 'boundary_setting'] },
];

const SPECIALTY_SKILLS = [
  { slug: 'trauma_informed_communication', name: 'Trauma-Informed Communication', icon_name: 'four_leaf_clover' },
  { slug: 'grief_and_loss_support',        name: 'Grief & Loss Support',          icon_name: 'candle'          },
  { slug: 'identity_sensitive_communication', name: 'Identity-Sensitive Communication', icon_name: 'prism'     },
  { slug: 'sexual_harassment_awareness',   name: 'Sexual Harassment Awareness',   icon_name: 'lantern'         },
  { slug: 'relationship_support',          name: 'Relationship Support',          icon_name: 'bridge'          },
  { slug: 'bullying_support',              name: 'Bullying Support',              icon_name: 'umbrella'        },
  { slug: 'stress_and_burnout',            name: 'Stress & Burnout',              icon_name: 'mountain'        },
  { slug: 'financial_stress_support',      name: 'Financial Stress Support',      icon_name: 'compass'         },
  { slug: 'parenting_support',             name: 'Parenting Support',             icon_name: 'sapling'         },
  { slug: 'addiction_awareness',           name: 'Addiction Awareness',           icon_name: 'anchor'          },
  { slug: 'domestic_violence_awareness',   name: 'Domestic Violence Awareness',   icon_name: 'lighthouse'      },
  { slug: 'disability_awareness',          name: 'Disability Awareness',          icon_name: 'open_door'       },
  { slug: 'cultural_sensitivity',          name: 'Cultural Sensitivity',          icon_name: 'globe'           },
];

// ─── Permissions ──────────────────────────────────────────────────────────────

const DISCLAIMER_SUFFIX = 'Peer supporters provide listening and support, not therapy or professional counselling.';

const PERMISSIONS = [
  {
    slug: 'general_support',
    name: 'General Support Ready',
    description: 'Cleared to receive general peer support requests.',
    disclaimer: `Completed PeerPal\'s General Peer Support awareness training. ${DISCLAIMER_SUFFIX}`,
    required_skill_slugs: ['active_listening', 'empathy_and_validation', 'boundary_setting', 'escalation_and_referral'],
  },
  {
    slug: 'trauma_support',
    name: 'Trauma Awareness Complete',
    disclaimer: `Completed PeerPal\'s Trauma-Informed Communication awareness training. ${DISCLAIMER_SUFFIX}`,
    required_skill_slugs: ['active_listening', 'empathy_and_validation', 'boundary_setting', 'escalation_and_referral', 'trauma_informed_communication'],
  },
  {
    slug: 'grief_support',
    name: 'Grief Support Ready',
    disclaimer: `Completed PeerPal\'s Grief & Loss Support awareness training. ${DISCLAIMER_SUFFIX}`,
    required_skill_slugs: ['active_listening', 'empathy_and_validation', 'boundary_setting', 'escalation_and_referral', 'grief_and_loss_support'],
  },
  {
    slug: 'identity_support',
    name: 'Identity Support Ready',
    disclaimer: `Completed PeerPal\'s Identity-Sensitive Communication awareness training. ${DISCLAIMER_SUFFIX}`,
    required_skill_slugs: ['active_listening', 'empathy_and_validation', 'boundary_setting', 'escalation_and_referral', 'identity_sensitive_communication'],
  },
  {
    slug: 'sexual_harassment_support',
    name: 'Sexual Harassment Awareness Complete',
    disclaimer: `Completed PeerPal\'s Sexual Harassment Awareness training. ${DISCLAIMER_SUFFIX}`,
    required_skill_slugs: ['active_listening', 'empathy_and_validation', 'boundary_setting', 'escalation_and_referral', 'sexual_harassment_awareness'],
  },
  {
    slug: 'relationship_support',
    name: 'Relationship Support Ready',
    disclaimer: `Completed PeerPal\'s Relationship Support awareness training. ${DISCLAIMER_SUFFIX}`,
    required_skill_slugs: ['active_listening', 'empathy_and_validation', 'boundary_setting', 'escalation_and_referral', 'relationship_support'],
  },
  {
    slug: 'bullying_support',
    name: 'Bullying Support Ready',
    disclaimer: `Completed PeerPal\'s Bullying Support awareness training. ${DISCLAIMER_SUFFIX}`,
    required_skill_slugs: ['active_listening', 'empathy_and_validation', 'boundary_setting', 'escalation_and_referral', 'bullying_support'],
  },
  {
    slug: 'stress_burnout_support',
    name: 'Stress & Burnout Support Ready',
    disclaimer: `Completed PeerPal\'s Stress & Burnout Support awareness training. ${DISCLAIMER_SUFFIX}`,
    required_skill_slugs: ['active_listening', 'empathy_and_validation', 'boundary_setting', 'escalation_and_referral', 'stress_and_burnout'],
  },
  {
    slug: 'financial_support',
    name: 'Financial Stress Support Ready',
    disclaimer: `Completed PeerPal\'s Financial Stress Support awareness training. ${DISCLAIMER_SUFFIX}`,
    required_skill_slugs: ['active_listening', 'empathy_and_validation', 'boundary_setting', 'escalation_and_referral', 'financial_stress_support'],
  },
  {
    slug: 'parenting_support',
    name: 'Parenting Support Ready',
    disclaimer: `Completed PeerPal\'s Parenting Support awareness training. ${DISCLAIMER_SUFFIX}`,
    required_skill_slugs: ['active_listening', 'empathy_and_validation', 'boundary_setting', 'escalation_and_referral', 'parenting_support'],
  },
  {
    slug: 'addiction_support',
    name: 'Addiction Awareness Complete',
    disclaimer: `Completed PeerPal\'s Addiction Awareness training. ${DISCLAIMER_SUFFIX}`,
    required_skill_slugs: ['active_listening', 'empathy_and_validation', 'boundary_setting', 'escalation_and_referral', 'addiction_awareness'],
  },
  {
    slug: 'domestic_violence_support',
    name: 'Domestic Violence Awareness Complete',
    disclaimer: `Completed PeerPal\'s Domestic Violence Awareness training. ${DISCLAIMER_SUFFIX}`,
    required_skill_slugs: ['active_listening', 'empathy_and_validation', 'boundary_setting', 'escalation_and_referral', 'domestic_violence_awareness'],
  },
];

// ─── Topics ───────────────────────────────────────────────────────────────────

const TOPICS = [
  { slug: 'abuse_or_assault',      label: 'Someone experienced abuse or assault',       primary: 'trauma_support',            secondary: 'general_support',      keywords: ['abuse', 'assault', 'attacked', 'violated', 'hurt', 'trauma'] },
  { slug: 'bereavement',           label: 'Someone lost a loved one',                    primary: 'grief_support',             secondary: 'general_support',      keywords: ['death', 'died', 'grief', 'loss', 'passed away', 'bereaved', 'funeral'] },
  { slug: 'identity',              label: 'Someone is questioning their identity',       primary: 'identity_support',          secondary: 'general_support',      keywords: ['identity', 'coming out', 'sexuality', 'gender', 'who I am', 'belonging'] },
  { slug: 'relationship',          label: 'Someone is struggling in a relationship',     primary: 'relationship_support',      secondary: 'general_support',      keywords: ['relationship', 'partner', 'boyfriend', 'girlfriend', 'marriage', 'breakup', 'divorce', 'conflict'] },
  { slug: 'overwhelmed_school_work', label: 'Someone is overwhelmed by school or work', primary: 'stress_burnout_support',    secondary: 'general_support',      keywords: ['burnout', 'overwhelmed', 'exam', 'deadline', 'work stress', 'school pressure', 'exhausted'] },
  { slug: 'sexual_harassment',     label: 'Someone experienced sexual harassment',       primary: 'sexual_harassment_support', secondary: 'trauma_support',       keywords: ['harassment', 'harassed', 'inappropriate', 'unwanted', 'touched', 'workplace harassment'] },
  { slug: 'addiction',             label: 'Someone is dealing with addiction',           primary: 'addiction_support',         secondary: 'general_support',      keywords: ['addiction', 'substance', 'alcohol', 'drugs', 'sober', 'recovery', 'relapse'] },
  { slug: 'domestic_violence',     label: 'Someone experiencing domestic violence',      primary: 'domestic_violence_support', secondary: 'trauma_support',       keywords: ['domestic violence', 'abuse at home', 'partner violence', 'unsafe at home'] },
  { slug: 'bullying',              label: 'Someone is being bullied',                    primary: 'bullying_support',          secondary: 'general_support',      keywords: ['bullied', 'bullying', 'harassment', 'picked on', 'cyberbullying', 'school bullying'] },
  { slug: 'financial_stress',      label: 'Someone is dealing with financial pressure',  primary: 'financial_support',         secondary: 'general_support',      keywords: ['money', 'debt', 'financial', 'broke', 'bills', 'rent', 'unemployed', 'poverty'] },
  { slug: 'parenting',             label: 'Someone needs parenting support',             primary: 'parenting_support',         secondary: 'general_support',      keywords: ['parenting', 'child', 'kids', 'baby', 'toddler', 'teenager', 'parent stress'] },
  { slug: 'general',               label: 'I just need someone to listen',               primary: 'general_support',           secondary: null,                   keywords: [] },
];

// ─── Seeder ───────────────────────────────────────────────────────────────────

async function seed() {
  console.log('Phase 31.1 taxonomy seed starting…');

  // 1. Insert all skills without prerequisites first
  console.log('  → Inserting skills…');
  const allSkills = [
    ...BASELINE_SKILLS.map(s => ({ ...s, skill_group: 'baseline' })),
    ...SPECIALTY_SKILLS.map(s => ({ ...s, skill_group: 'specialty' })),
  ];

  for (const skill of allSkills) {
    await query(`
      INSERT INTO skills (slug, name, description, icon_name, skill_group)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (slug) DO NOTHING
    `, [skill.slug, skill.name, skill.description || null, skill.icon_name, skill.skill_group]);
  }

  // 2. Resolve skill UUIDs for prerequisites
  const { rows: skillRows } = await query('SELECT id, slug FROM skills');
  const skillIdBySlug = Object.fromEntries(skillRows.map(r => [r.slug, r.id]));

  // 3. Update baseline skill prerequisites
  console.log('  → Setting skill prerequisites…');
  const allBaselineSlugs = BASELINE_SKILLS.map(s => s.slug);
  for (const skill of BASELINE_SKILLS) {
    const prereqIds = (skill.prereqs || []).map(slug => skillIdBySlug[slug]);
    await query(`
      UPDATE skills SET prerequisite_skill_ids = $1 WHERE slug = $2
    `, [prereqIds, skill.slug]);
  }

  // All specialty skills require all 5 baseline
  const allBaselineIds = allBaselineSlugs.map(slug => skillIdBySlug[slug]);
  for (const skill of SPECIALTY_SKILLS) {
    await query(`
      UPDATE skills SET prerequisite_skill_ids = $1 WHERE slug = $2
    `, [allBaselineIds, skill.slug]);
  }

  // 4. Insert permissions — resolve required_skills UUIDs
  console.log('  → Inserting permissions…');
  for (const perm of PERMISSIONS) {
    const requiredSkills = perm.required_skill_slugs.map(slug => ({
      skill_id: skillIdBySlug[slug],
      min_version: 1,
    }));
    await query(`
      INSERT INTO permissions (slug, name, description, disclaimer, required_skills)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (slug) DO NOTHING
    `, [perm.slug, perm.name, perm.description || null, perm.disclaimer, JSON.stringify(requiredSkills)]);
  }

  // 5. Resolve permission UUIDs for topics
  const { rows: permRows } = await query('SELECT id, slug FROM permissions');
  const permIdBySlug = Object.fromEntries(permRows.map(r => [r.slug, r.id]));

  // 6. Insert topics
  console.log('  → Inserting topics…');
  for (const topic of TOPICS) {
    await query(`
      INSERT INTO topics (slug, label, required_permission_id, secondary_permission_id, confidence_keywords)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (slug) DO NOTHING
    `, [
      topic.slug,
      topic.label,
      permIdBySlug[topic.primary] || null,
      topic.secondary ? (permIdBySlug[topic.secondary] || null) : null,
      topic.keywords,
    ]);
  }

  console.log('  ✓ Taxonomy seed complete.');

  // Summary
  const counts = await Promise.all([
    query('SELECT COUNT(*) FROM skills'),
    query('SELECT COUNT(*) FROM permissions'),
    query('SELECT COUNT(*) FROM topics'),
  ]);
  console.log(`    Skills: ${counts[0].rows[0].count}  Permissions: ${counts[1].rows[0].count}  Topics: ${counts[2].rows[0].count}`);
}

seed()
  .then(() => pool.end())
  .catch(err => { console.error('Seed failed:', err); pool.end(); process.exit(1); });
