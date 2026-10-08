# PeerPal — Landing Site

Marketing / waitlist landing page for **PeerPal**, an anonymous mental-health
peer-support and digital-wellness platform built for Kenya and designed to
scale across Africa.

PeerPal combines anonymous peer support, a bounded AI companion, self-help
tools, a bridge to independent professional therapists, and clear emergency
pathways. It is **not a medical service** — peer supporters and the AI
companion are not therapists.

## Stack

Vite + React (single page). Deploys to Vercel (`dist/` static output).

## Commands

```bash
npm install
npm run dev       # local dev server
npm run build     # production build -> dist/
npm run preview   # serve the production build
```

## Configuration

Copy `.env.example` to `.env` (or set these in Vercel → Project → Settings →
Environment Variables). All `VITE_*` values are embedded at build time.

| Variable                 | Purpose |
| ------------------------ | ------- |
| `VITE_WAITLIST_ENDPOINT` | Form endpoint that accepts a JSON `POST` of `{ email, source }` (Formspree, a Vercel function, or any webhook). **Without it the form stays honest — it does not fake a successful sign-up.** |
| `VITE_LINKEDIN_URL`      | Official PeerPal LinkedIn URL. Blank → footer shows a marked placeholder. |
| `VITE_INSTAGRAM_URL`     | Official PeerPal Instagram URL. Blank → footer shows a marked placeholder. |

## Notes

- Content avoids medical-service claims and keeps the five support types
  (peer, AI, self-help, professional, emergency) clearly distinct.
- Icons/favicons live in `public/` (`favicon.svg` + PNG fallbacks + manifest);
  a loading spinner shows in the tab while the page loads, then swaps to the
  static mark. Regenerate the PNGs with the icon script if the mark changes.
- `public/404.html` is served by Vercel for unknown routes.
