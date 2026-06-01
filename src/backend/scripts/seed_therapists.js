// Usage: node src/backend/scripts/seed_therapists.js
// Creates two smoke-test therapist profiles. Safe to re-run — skips existing emails.
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const bcrypt = require('bcrypt');
const { query } = require('../db');
const { generateAlias } = require('../utils/aliasGenerator');

const THERAPISTS = [
  {
    email:        'amara.odhiambo@melah.test',
    password:     'Therapist@123',
    display_name: 'Amara',
    full_name:    'Amara Odhiambo',
    credentials:  'MSc Clinical Psychology, University of Nairobi',
    years_experience: 7,
    specializations:  ['anxiety', 'depression', 'stress'],
    languages:        ['English', 'Swahili'],
    session_formats:  ['in_app_chat', 'voice_call'],
    location:         null,
    availability_status: 'available',
    statement: 'I believe healing happens when you feel truly heard. My work centres on creating a space that is warm, non-judgmental, and grounded in your own experience.',
    plain_language_intro: 'I am a counselling psychologist based in Nairobi with seven years working with young adults navigating anxiety, low mood, and the pressure of modern life. I use a mix of talking therapy and practical tools — whatever feels most natural for you.',
    cultural_competencies: ['Kenyan family dynamics', 'workplace stress', 'urban youth mental health'],
    approach_plain: 'I mostly use a person-centred approach — which means we go at your pace, and I follow your lead. I also draw on CBT tools when they are helpful, like spotting patterns in thinking that keep us stuck.',
    photo_url: null,
  },
  {
    email:        'david.mwangi@melah.test',
    password:     'Therapist@123',
    display_name: 'David',
    full_name:    'David Mwangi',
    credentials:  'MA Counselling Psychology, Daystar University; Certified Trauma Specialist',
    years_experience: 11,
    specializations:  ['trauma', 'grief', 'relationships'],
    languages:        ['English', 'Swahili', 'Kikuyu'],
    session_formats:  ['in_app_chat', 'in_person'],
    location:         'Westlands, Nairobi',
    availability_status: 'limited',
    statement: 'Difficult experiences do not define you — but they do shape you. I help people make sense of what happened, and find a path forward that feels like theirs.',
    plain_language_intro: 'I have spent eleven years working with people who have been through hard things — loss, trauma, relationship breakdowns. I work in English, Swahili, and Kikuyu, and I am comfortable talking about things that feel difficult to say out loud.',
    cultural_competencies: ['intergenerational trauma', 'grief and loss in East African context', 'relationship conflict', 'faith and mental health'],
    approach_plain: 'I use trauma-informed care as a foundation — meaning I never push you faster than you are ready to go. For relationship work I draw on the Gottman approach. Everything I do is adapted to your specific background and values.',
    photo_url: null,
  },
];

async function main() {
  let created = 0;
  let skipped = 0;

  for (const t of THERAPISTS) {
    const { rows: existing } = await query(
      'SELECT 1 FROM users WHERE email = $1',
      [t.email.toLowerCase()]
    );
    if (existing.length) {
      console.log(`  SKIP  ${t.full_name} (${t.email}) — already exists`);
      skipped++;
      continue;
    }

    const passwordHash = await bcrypt.hash(t.password, 12);
    const alias = await generateAlias();

    const { rows: userRows } = await query(
      `INSERT INTO users (email, password_hash, alias, role, consent_version, email_verified, is_active)
       VALUES ($1, $2, $3, 'therapist', '1.0', true, true)
       RETURNING id`,
      [t.email.toLowerCase(), passwordHash, alias]
    );
    const userId = userRows[0].id;

    await query('INSERT INTO credits (user_id, balance) VALUES ($1, 0)', [userId]);

    const { rows: profileRows } = await query(
      `INSERT INTO therapist_profiles
         (user_id, display_name, full_name, credentials, years_experience,
          specializations, languages, session_formats, location, statement,
          plain_language_intro, cultural_competencies, approach_plain,
          photo_url, availability_status, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,true)
       RETURNING id`,
      [
        userId,
        t.display_name,
        t.full_name,
        t.credentials,
        t.years_experience,
        t.specializations,
        t.languages,
        t.session_formats,
        t.location,
        t.statement,
        t.plain_language_intro,
        t.cultural_competencies,
        t.approach_plain,
        t.photo_url,
        t.availability_status,
      ]
    );

    console.log(`  OK    ${t.full_name} — profile_id: ${profileRows[0].id}, alias: ${alias}`);
    created++;
  }

  console.log(`\nDone: ${created} created, ${skipped} skipped.`);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
