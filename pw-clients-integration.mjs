/**
 * Integration test: ClientsTab + ClientDetailPanel
 * Requires: backend on :3001, therapist dev server on :5176
 * Run: node pw-clients-integration.mjs
 */
import { chromium } from 'playwright';

const BASE  = 'http://localhost:5176';
const EMAIL = 'dr.test.wanjiku@peerpal.test';
const PASS  = 'Test1234!';

let passed = 0;
let failed = 0;

function ok(label)         { console.log(`  ✔ ${label}`); passed++; }
function fail(label, detail) { console.error(`  ✗ ${label}: ${detail}`); failed++; }

const browser = await chromium.launch();
const page    = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 800 });

// ── Login ─────────────────────────────────────────────────────────────────────
await page.goto(BASE);
await page.fill('input[type="email"]',    EMAIL);
await page.fill('input[type="password"]', PASS);
await page.click('button[type="submit"]');
await page.waitForSelector('.sidebar', { timeout: 8000 }).catch(() => {});
await page.waitForTimeout(600);

const hasSidebar = await page.$('.sidebar') !== null;
if (hasSidebar) ok('login succeeds');
else { fail('login', 'sidebar not found'); await browser.close(); process.exit(1); }

// ── Navigate to Clients tab ───────────────────────────────────────────────────
await page.click('text=Clients');
// wait for loading to finish (either empty state or first card)
await page.waitForSelector('.empty, .card', { timeout: 6000 }).catch(() => {});
await page.waitForTimeout(300);

const hasTitle = await page.$('h1') !== null;
if (hasTitle) ok('Clients tab renders');
else fail('Clients tab', 'h1 not found');

// ── Check empty or list state ─────────────────────────────────────────────────
const hasEmpty   = await page.$('.empty') !== null;
const hasCards   = await page.$('.card')  !== null;

if (hasEmpty) {
  console.log('\n  ℹ No clients yet — skipping card and panel tests.');
  console.log('  (Complete a booking to test the full flow.)\n');
} else if (hasCards) {
  ok('client cards rendered');

  // ── Returning chip (conditional) ───────────────────────────────────────────
  const returningChip = await page.$('text=Returning');
  if (returningChip) ok('returning chip visible on multi-session client');
  else console.log('  ℹ No returning chip (no client with >1 session, or all are first-timers)');

  // ── Phosphor icons rendered in cards ──────────────────────────────────────
  // CalendarBlank, Clock, NotePencil render as <svg> — check at least one svg per card
  const svgInCard = await page.$('.card svg');
  if (svgInCard) ok('Phosphor icons rendered in client cards');
  else fail('Phosphor icons', 'no svg found inside .card');

  // ── Open detail panel ─────────────────────────────────────────────────────
  const firstCard = await page.$('.card');
  await firstCard.click();
  await page.waitForSelector('.slide-panel', { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(500);

  const panelVisible = await page.$('.slide-panel') !== null;
  if (panelVisible) ok('detail panel opens on card click');
  else { fail('detail panel', 'slide-panel not found after click'); }

  if (panelVisible) {
    // Panel title should be an alias (not "Loading…")
    await page.waitForTimeout(800); // wait for data load
    const panelTitle = await page.$eval('.slide-panel__title', (el) => el.textContent).catch(() => '');
    if (panelTitle && panelTitle !== 'Loading…') ok(`panel title shows alias: "${panelTitle}"`);
    else fail('panel title', `got "${panelTitle}"`);

    // Session history section
    const sessionHistory = await page.$('text=Session history');
    if (sessionHistory) ok('Session history section present');
    else fail('Session history', 'not found');

    // Close panel
    await page.click('.slide-panel button:has(svg)');
    await page.waitForTimeout(500);
    const panelGone = await page.$('.slide-panel') === null;
    if (panelGone) ok('panel closes on X button');
    else fail('panel close', 'panel still visible');
  }
} else {
  fail('clients list', 'neither .empty nor .card found');
}

await browser.close();

console.log(`\n${'─'.repeat(48)}`);
console.log(`  ${passed} passed  ${failed} failed`);
console.log(`${'─'.repeat(48)}\n`);
if (failed > 0) process.exit(1);
