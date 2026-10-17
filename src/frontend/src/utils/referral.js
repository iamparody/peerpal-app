// Phase 46 referral link handling.
// A shared link looks like [APP_URL]/?ref=KE7MX2. "/" redirects to /welcome and drops the
// query string, so the code is captured once at boot (main.jsx) and held until signup.

const STORAGE_KEY = 'pp_referral_code';
const CODE_RE = /^[0-9A-Z]{6}$/;

// Mirrors src/backend/utils/referralCode.js normalizeReferralCode.
export function normalizeReferralCode(input) {
  if (typeof input !== 'string') return null;
  const code = input.replace(/[\s-]/g, '').toUpperCase();
  return CODE_RE.test(code) ? code : null;
}

export function buildReferralLink(code, origin) {
  return `${String(origin).replace(/\/+$/, '')}/?ref=${encodeURIComponent(code)}`;
}

// search: location.search. Stores a valid ?ref= code; returns it (or null).
export function captureReferralFromUrl(search, storage) {
  const code = normalizeReferralCode(new URLSearchParams(search || '').get('ref') || '');
  if (!code) return null;
  try { storage?.setItem(STORAGE_KEY, code); } catch { /* private mode / blocked storage */ }
  return code;
}

export function getPendingReferral(storage) {
  try { return normalizeReferralCode(storage?.getItem(STORAGE_KEY) || ''); } catch { return null; }
}

export function clearPendingReferral(storage) {
  try { storage?.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}
