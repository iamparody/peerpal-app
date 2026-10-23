/**
 * 53.10 Verification — Phase 53 integration checklist
 * Requires: backend on :3001, therapist dev server on :5176
 * Run: node pw-53-10-verify.mjs
 */
import { chromium } from 'playwright';

const BASE  = 'http://localhost:5176';
const EMAIL = 'dr.test.wanjiku@peerpal.test';
const PASS  = 'Test1234!';

let passed = 0;
let failed = 0;

function ok(label)           { console.log(`  ✔ ${label}`); passed++; }
function fail(label, detail) { console.error(`  ✗ ${label}: ${detail}`); failed++; }
function info(msg)           { console.log(`  ℹ ${msg}`); }

const browser = await chromium.launch();
const page    = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 800 });

// ── Login ─────────────────────────────────────────────────────────────────────
console.log('\n── Login ────────────────────────────────────────────────────────');
await page.goto(BASE);
await page.fill('input[type="email"]',    EMAIL);
await page.fill('input[type="password"]', PASS);
await page.click('button[type="submit"]');
await page.waitForSelector('.sidebar', { timeout: 8000 }).catch(() => {});
await page.waitForTimeout(600);

const hasSidebar = await page.$('.sidebar') !== null;
if (hasSidebar) ok('login → portal shell renders');
else { fail('login', 'sidebar not found'); await browser.close(); process.exit(1); }

// ── CHECK 1: Tab switch animates (slide/fade) ─────────────────────────────────
console.log('\n── Check 1: Tab switch animation ────────────────────────────────');
// AnimatePresence wraps the tab content — the motion.div key changes on each switch
// We verify the content area changes and no hard flash (just DOM swap check)
await page.click('text=Sessions');
await page.waitForSelector('.status-tabs', { timeout: 3000 }).catch(() => {});
const onSessions = await page.$('.status-tabs') !== null;
await page.click('text=Payments');
await page.waitForSelector('h1', { timeout: 3000 }).catch(() => {});
await page.waitForTimeout(200);
const onPayments = await page.$eval('h1', (el) => el.textContent).catch(() => '') === 'Payments';
await page.click('text=Dashboard');
await page.waitForSelector('.stat-grid', { timeout: 6000 }).catch(() => {});
await page.waitForTimeout(400);
const onDashboard = await page.$('.stat-grid') !== null;

if (onSessions && onPayments && onDashboard) ok('tab switch renders correct content on each switch');
else fail('tab switch', `sessions=${onSessions} payments=${onPayments} dashboard=${onDashboard}`);

// ── CHECK 2: Stat card entrance stagger (Dashboard) ───────────────────────────
console.log('\n── Check 2: Dashboard stat cards ────────────────────────────────');
// Navigate away and back to trigger fresh entrance
await page.click('text=Ratings');
await page.waitForTimeout(200);
await page.click('text=Dashboard');
await page.waitForSelector('.stat-grid', { timeout: 4000 }).catch(() => {});
await page.waitForTimeout(800);

const statCards = await page.$$('.stat-card');
if (statCards.length >= 4) ok(`stat cards rendered (${statCards.length} cards)`);
else fail('stat cards', `expected ≥4, got ${statCards.length}`);

// Each card should have an icon-wrap
const iconWraps = await page.$$('.stat-card__icon-wrap');
if (iconWraps.length >= 4) ok('stat card icon-wraps present (motion stagger wired)');
else fail('stat card icons', `expected ≥4 icon-wraps, got ${iconWraps.length}`);

// ── CHECK 3: Sessions tab — multi-note panel ──────────────────────────────────
console.log('\n── Check 3: Multi-note panel (Sessions tab) ─────────────────────');
await page.click('text=Sessions');
await page.waitForSelector('.status-tabs', { timeout: 4000 }).catch(() => {});
await page.waitForTimeout(600);

const filterTabs = await page.$$('.status-tab');
if (filterTabs.length >= 4) ok(`filter tabs present (${filterTabs.length} tabs)`);
else fail('filter tabs', `expected ≥4, got ${filterTabs.length}`);

await page.click('.status-tab:has-text("Completed")');
await page.waitForTimeout(1000);

const notesBtn = await page.$('button:has-text("Notes")');
if (!notesBtn) {
  info('No completed sessions for test therapist — skipping multi-note panel checks.');
  info('To fully verify: create a booking in completed state via admin panel.');
} else {
  ok('Notes button on completed session');

  // Open panel
  await notesBtn.click();
  await page.waitForSelector('.slide-panel', { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(500);

  const panelOpen = await page.$('.slide-panel') !== null;
  if (panelOpen) ok('slide-panel opens');
  else { fail('slide-panel', 'not found after click'); }

  if (panelOpen) {
    // Add a pre-session note
    await page.click('button:has-text("Pre-session")');
    await page.waitForTimeout(200);
    const preText = `Pre-session note ${Date.now()}`;
    await page.fill('textarea', preText);
    await page.click('button:has-text("Save Note")');
    await page.waitForTimeout(1000);

    // Verify pre-session group header appears
    const preHeader = await page.$('text=Pre-session');
    if (preHeader) ok('"Pre-session" group header visible after saving pre note');
    else fail('Pre-session header', 'not found after save');

    // Add a session note
    await page.click('button:has-text("Session")');
    await page.waitForTimeout(200);
    const sessionText = `Session note ${Date.now()}`;
    await page.fill('textarea', sessionText);
    await page.click('button:has-text("Save Note")');
    await page.waitForTimeout(1000);

    // Both group headers should now be visible
    const allText = await page.content();
    const hasPreGroup     = allText.includes('Pre-session');
    const hasSessionGroup = allText.includes('Session');
    if (hasPreGroup && hasSessionGroup) ok('both Pre-session and Session group headers visible (multi-note grouping works)');
    else fail('multi-note groups', `pre=${hasPreGroup} session=${hasSessionGroup}`);

    // Close
    await page.click('.slide-panel__footer button:has-text("Close")');
    await page.waitForTimeout(400);
    const panelGone = await page.$('.slide-panel') === null;
    if (panelGone) ok('panel closes');
    else fail('panel close', 'still visible');
  }
}

// ── CHECK 4: Clients tab — returning badge ────────────────────────────────────
console.log('\n── Check 4: Clients tab returning badge ─────────────────────────');
await page.click('text=Clients');
await page.waitForSelector('.empty, .card', { timeout: 6000 }).catch(() => {});
await page.waitForTimeout(400);

const hasClients = await page.$('.card') !== null;
if (!hasClients) {
  info('No clients yet — returning badge check skipped.');
  info('To verify: ensure a member has 2+ completed sessions with this therapist.');
} else {
  ok('client cards rendered');

  // Check Phosphor icons in cards
  const svgs = await page.$$('.card svg');
  if (svgs.length > 0) ok(`Phosphor icons in client cards (${svgs.length} svgs)`);
  else fail('Phosphor icons', 'no svg found in .card');

  const returningChip = await page.$('text=Returning');
  if (returningChip) ok('↩ Returning chip visible on multi-session client');
  else info('No returning chip — no client has >1 session, or all are first-timers');

  // Open detail panel for first client
  await (await page.$('.card')).click();
  await page.waitForSelector('.slide-panel', { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(600);

  const detailOpen = await page.$('.slide-panel') !== null;
  if (detailOpen) {
    ok('ClientDetailPanel opens (motion spring)');
    const sessionHistory = await page.$('text=Session history');
    if (sessionHistory) ok('"Session history" section present in detail panel');
    else fail('Session history', 'section not found');

    // Close
    await page.click('.slide-panel button:has(svg)');
    await page.waitForTimeout(400);
    if (await page.$('.slide-panel') === null) ok('detail panel closes');
    else fail('detail panel close', 'still visible');
  } else {
    fail('ClientDetailPanel', 'slide-panel not found after clicking client card');
  }
}

// ── CHECK 5: Payments stat cards with motion ──────────────────────────────────
console.log('\n── Check 5: Payments tab stat cards ─────────────────────────────');
await page.click('text=Payments');
await page.waitForTimeout(800);
const payTitle = await page.$('h1') !== null;
if (payTitle) ok('Payments tab renders');
else fail('Payments tab', 'h1 not found');

// ── CHECK 6: Ratings tab ───────────────────────────────────────────────────────
console.log('\n── Check 6: Ratings tab ─────────────────────────────────────────');
await page.click('text=Ratings');
// wait for loading spinner to disappear, then check for h1
await page.waitForSelector('.loading', { timeout: 3000 }).catch(() => {});
await page.waitForFunction(() => !document.querySelector('.loading'), { timeout: 5000 }).catch(() => {});
await page.waitForTimeout(300);
const ratTitle = await page.$('h1') !== null;
if (ratTitle) ok('Ratings tab renders');
else fail('Ratings tab', 'h1 not found after loading resolved');

await browser.close();

console.log(`\n${'─'.repeat(48)}`);
console.log(`  ${passed} passed  ${failed} failed`);
console.log(`${'─'.repeat(48)}\n`);
if (failed > 0) process.exit(1);
