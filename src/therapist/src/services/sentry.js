import * as Sentry from '@sentry/react';

export function initSentry() {
  if (!import.meta.env.VITE_SENTRY_DSN) return;
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
    integrations: [Sentry.browserTracingIntegration()],
    // Never send PII — no email, no therapy session identifiers
    beforeSend(event) {
      if (event.user?.email) delete event.user.email;
      const SCRUB = ['booking_id', 'member_alias', 'therapist_id', 'room_token', 'mpesa_number', 'phone'];
      function scrub(obj) {
        if (!obj || typeof obj !== 'object') return;
        for (const key of Object.keys(obj)) {
          if (SCRUB.includes(key)) { obj[key] = '[Filtered]'; }
          else scrub(obj[key]);
        }
      }
      scrub(event.extra);
      scrub(event.contexts);
      if (event.request?.data) scrub(event.request.data);
      if (event.breadcrumbs?.values) event.breadcrumbs.values.forEach(b => scrub(b.data));
      return event;
    },
  });
}

export { Sentry };
