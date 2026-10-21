export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isValidEmail = (v) => typeof v === 'string' && EMAIL_RE.test(v.trim());
