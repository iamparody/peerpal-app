import posthog from 'posthog-js';

const KEY  = import.meta.env.VITE_POSTHOG_KEY;
const HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://eu.i.posthog.com';
const DEV  = import.meta.env.DEV;

export function initAnalytics() {
  if (!KEY) return;
  posthog.init(KEY, {
    api_host: HOST,
    autocapture: false,
    capture_pageview: false,
    disable_session_recording: false,
    loaded: (ph) => {
      // Start opted out — only activate after confirmed consent
      if (!hasConsented()) ph.opt_out_capturing();
      if (DEV) ph.opt_out_capturing(); // never capture in dev
    },
  });
}

// ── Consent gate ──────────────────────────────────────────────────────────────

function hasConsented() {
  return localStorage.getItem('analytics_consent') === 'true';
}

export function optInAnalytics(userId, alias) {
  if (!KEY || DEV) return;
  localStorage.setItem('analytics_consent', 'true');
  posthog.opt_in_capturing();
  posthog.identify(userId, { alias });
}

export function optOutAnalytics() {
  localStorage.removeItem('analytics_consent');
  posthog.opt_out_capturing();
  posthog.reset();
}

// ── Core tracking ─────────────────────────────────────────────────────────────

export function track(event, props = {}) {
  if (!KEY || DEV) return;
  posthog.capture(event, props);
}

export function trackPageview(path) {
  if (!KEY || DEV) return;
  posthog.capture('$pageview', { $current_url: path });
}
