'use strict';

/**
 * Renders blob-neutral.png (192×192) and badge.png (72×72) for push notifications.
 * SVG geometry mirrors MoodBlob.jsx exactly. Run once; outputs to src/frontend/public/.
 *
 * Usage: node src/backend/scripts/render-blob-icons.js
 */

const path = require('path');
const sharp = require('sharp');

const OUT_DIR = path.resolve(__dirname, '../../frontend/public');

// Neutral state from MoodBlob.jsx: rx=96, ry=94, fill=#9BB5A0, mouthKey=neutral
const BLOB_NEUTRAL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 200 200">
  <ellipse cx="100" cy="100" rx="96" ry="94" fill="#9BB5A0"/>
  <ellipse cx="78" cy="76" rx="28" ry="16" fill="rgba(255,255,255,0.18)"/>
  <!-- Left eye -->
  <ellipse cx="76" cy="92" rx="8" ry="7" fill="#2A2020"/>
  <circle cx="79" cy="89" r="2.5" fill="rgba(255,255,255,0.55)"/>
  <!-- Right eye -->
  <ellipse cx="124" cy="92" rx="8" ry="7" fill="#2A2020"/>
  <circle cx="127" cy="89" r="2.5" fill="rgba(255,255,255,0.55)"/>
  <!-- Neutral mouth -->
  <path d="M 80,118 Q 100,118 120,118" stroke="#2A2020" stroke-width="2.5" fill="none" stroke-linecap="round"/>
</svg>`;

// Badge: 72×72 white heartbeat line on transparent background
const BADGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72">
  <path d="M 4,36 L 16,36 L 22,20 L 28,52 L 34,30 L 40,42 L 46,36 L 68,36"
        stroke="white" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

async function render() {
  await sharp(Buffer.from(BLOB_NEUTRAL_SVG))
    .resize(192, 192)
    .png()
    .toFile(path.join(OUT_DIR, 'blob-neutral.png'));
  console.log('Wrote blob-neutral.png (192×192)');

  await sharp(Buffer.from(BADGE_SVG))
    .resize(72, 72)
    .png()
    .toFile(path.join(OUT_DIR, 'badge.png'));
  console.log('Wrote badge.png (72×72)');
}

render().catch((err) => {
  console.error('render-blob-icons failed:', err.message);
  process.exit(1);
});
