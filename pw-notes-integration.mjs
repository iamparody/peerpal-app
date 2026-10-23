/**
 * Integration test: SessionsTab notes panel
 * Requires: backend on :3001, therapist dev server on :5176
 * Run: node pw-notes-integration.mjs
 */
import { chromium } from 'playwright';

const BASE   = 'http://localhost:5176';
const EMAIL  = 'dr.test.wanjiku@peerpal.test';
const PASS   = 'Test1234!';

let passed = 0;
let failed = 0;

function ok(label) { console.log(`  ✔ ${label}`); passed++; }
function fail(label, detail) { console.error(`  ✗ ${label}: ${detail}`); failed++; }

const browser = await chromium.launch();
const page    = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 800 });

// ── Login ────────────────────────────────────────────────────────────────────
await page.goto(BASE);
await page.fill('input[type="email"]',    EMAIL);
await page.fill('input[type="password"]', PASS);
await page.click('button[type="submit"]');
await page.waitForSelector('.sidebar', { timeout: 8000 }).catch(() => {});
await page.waitForTimeout(800);

const hasSidebar = await page.$('.sidebar') !== null;
if (hasSidebar) ok('login succeeds and portal shell renders');
else { fail('login', 'sidebar not found after login'); await browser.close(); process.exit(1); }

// ── Navigate to Sessions tab ──────────────────────────────────────────────────
await page.click('text=Sessions');
await page.waitForTimeout(800);

const hasSessionsTitle = await page.$('text=Sessions') !== null;
if (hasSessionsTitle) ok('Sessions tab renders');
else fail('Sessions tab', 'title not found');

// ── Filter tabs present ───────────────────────────────────────────────────────
for (const label of ['Upcoming', 'Pending', 'Completed', 'Cancelled']) {
  const el = await page.$(`text=${label}`);
  if (el) ok(`filter tab "${label}" present`);
  else fail(`filter tab "${label}"`, 'not found');
}

// ── Completed tab: try to find a session with Notes button ────────────────────
await page.click('text=Completed');
await page.waitForTimeout(1000);

const notesBtn = await page.$('button:has-text("Notes")');

if (!notesBtn) {
  console.log('\n  ℹ No completed sessions for test therapist — skipping notes panel tests.');
  console.log('  (Create a booking in completed state to test the panel end-to-end.)\n');
} else {
  ok('Notes button visible on completed session');

  // Open notes panel
  await notesBtn.click();
  await page.waitForSelector('.slide-panel', { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(400);

  const panelVisible = await page.$('.slide-panel') !== null;
  if (panelVisible) ok('notes panel opens (slide-panel present)');
  else fail('notes panel', 'slide-panel not found after clicking Notes');

  // Panel should show "Private — not visible to client"
  const privateNotice = await page.$('text=Private');
  if (privateNotice) ok('private notice displayed in panel');
  else fail('private notice', 'not found');

  // Note type buttons
  for (const label of ['Pre-session', 'Session', 'Follow-up']) {
    const btn = await page.$(`button:has-text("${label}")`);
    if (btn) ok(`note type button "${label}" present`);
    else fail(`note type button "${label}"`, 'not found');
  }

  // Write a note and save
  const noteText = `Integration test note ${Date.now()}`;
  await page.fill('textarea', noteText);
  await page.click('button:has-text("Save Note")');
  await page.waitForTimeout(1200);

  // Note should appear in the panel
  const noteAppeared = await page.$(`text=${noteText.slice(0, 20)}`);
  if (noteAppeared) ok('saved note appears in panel');
  else fail('saved note', 'note text not found in panel after save');

  // "Session" group heading should appear
  const sessionGroup = await page.$('text=Session');
  if (sessionGroup) ok('Session group header rendered');
  else fail('Session group header', 'not found');

  // Close the panel
  await page.click('button:has-text("Close")');
  await page.waitForTimeout(400);
  const panelGone = await page.$('.slide-panel') === null;
  if (panelGone) ok('notes panel closes on Close button');
  else fail('notes panel close', 'panel still visible');
}

await browser.close();

console.log(`\n${'─'.repeat(48)}`);
console.log(`  ${passed} passed  ${failed} failed`);
console.log(`${'─'.repeat(48)}\n`);
if (failed > 0) process.exit(1);
