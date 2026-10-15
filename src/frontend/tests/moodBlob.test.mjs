// MoodBlob must never crash on an unknown mood (blank screen for every new sign-up via
// TrialWelcomeScreen mood="happy"). Run: npm test   (from src/frontend)
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MOOD_STATES, resolveMoodKey } from '../src/components/moodBlobStates.js';

describe('resolveMoodKey', () => {
  test('known moods map to themselves', () => {
    for (const k of Object.keys(MOOD_STATES)) assert.equal(resolveMoodKey(k), k);
  });
  test('unknown, empty or prototype keys fall back to idle', () => {
    for (const bad of ['happy', '', null, undefined, 3, 'toString', '__proto__']) {
      assert.equal(resolveMoodKey(bad), 'idle', `for ${String(bad)}`);
    }
  });
});

describe('MoodBlob call sites', () => {
  const srcDir = fileURLToPath(new URL('../src', import.meta.url));
  const files = [];
  (function walk(d) {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.jsx?$/.test(name)) files.push(p);
    }
  })(srcDir);

  test('every literal mood="..." is a known mood', () => {
    const bad = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/<MoodBlob[^>]*\bmood=["']([^"']+)["']/g)) {
        if (!(m[1] in MOOD_STATES)) bad.push(`${relative(srcDir, f)}: mood="${m[1]}"`);
      }
    }
    assert.deepEqual(bad, []);
  });
});
