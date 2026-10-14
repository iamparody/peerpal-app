import posthog from 'posthog-js';

const KEY  = import.meta.env.VITE_POSTHOG_KEY;
const HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://eu.i.posthog.com';
const DEV  = import.meta.env.DEV;

export function initAnalytics() {
  if (!KEY || DEV) return;
  posthog.init(KEY, {
    api_host: HOST,
    autocapture: false,
    capture_pageview: false,
    disable_session_recording: false,
  });
}

// ── Identity ──────────────────────────────────────────────────────────────────

export function optInAnalytics(userId, alias) {
  if (!KEY || DEV) return;
  posthog.identify(userId, { alias });
}

export function optOutAnalytics() {
  if (!KEY || DEV) return;
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
