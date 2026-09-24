CREATE TABLE therapist_categories (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name           VARCHAR(100) NOT NULL UNIQUE,
  description    TEXT         NULL,
  icon_name      VARCHAR(50)  NULL,
  condition_tags TEXT[]       NOT NULL DEFAULT '{}',
  is_active      BOOLEAN      NOT NULL DEFAULT true,
  sort_order     INTEGER      NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Seed the 8 Phase 37 categories. Youth & Adolescent is excluded (deferred).
INSERT INTO therapist_categories (name, description, icon_name, condition_tags, sort_order) VALUES
  ('Anxiety & Stress',            'Support for anxiety disorders, panic, worry, and stress management',              'Brain',         ARRAY['anxiety','panic','stress','worry'],                  1),
  ('Depression & Mood',           'Help with depression, low mood, bipolar, and emotional regulation',               'CloudRain',     ARRAY['depression','mood','bipolar','low_energy'],          2),
  ('Grief & Loss',                'Grief counselling for bereavement, loss, and major life changes',                  'Heart',         ARRAY['grief','bereavement','loss'],                       3),
  ('Addiction & Recovery',        'Counselling for substance use, behavioural addiction, and recovery',              'ArrowsClockwise', ARRAY['addiction','substance_use','recovery'],            4),
  ('Trauma & PTSD',               'Trauma-informed therapy for PTSD, abuse survivors, and acute trauma',             'ShieldSlash',   ARRAY['trauma','ptsd','abuse','acute_stress'],              5),
  ('Relationships & Family',      'Couples, family, parenting, and interpersonal conflict support',                  'UsersThree',    ARRAY['relationships','family','couples','parenting'],      6),
  ('Career & Life Transitions',   'Support through job loss, career change, burnout, and major transitions',         'Briefcase',     ARRAY['career','burnout','life_change','purpose'],          7),
  ('General Counselling',         'Broad support for wellbeing, personal growth, and everyday mental health',        'Sparkle',       ARRAY['general','wellbeing','self_esteem','growth'],        8);

-- Deny anonymous access
ALTER TABLE therapist_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY deny_anon ON therapist_categories FOR ALL TO anon USING (false);
