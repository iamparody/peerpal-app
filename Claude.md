# CLAUDE.md — Agent Instructions

You are building a mobile-first mental health support platform.

## Read These First — In Order
0. `graphify-out/GRAPH_REPORT.md` — full project knowledge graph: all files, routes, schema, endpoints, queues, cache keys, and phase status. Read this before any other file for fast context recovery.
1. `blueprint/blueprint_v1.0.md` — full specification, all modules, all schema, all APIs
2. `CHECKLIST.md` — ordered build tasks, mark items as you complete them
3. `PROGRESS.md` — current status, what is done, what is active, blockers

## Handoff Protocol (read this if context was compacted or this is a new session)
After reading GRAPH_REPORT.md, go directly to PROGRESS.md. The top of PROGRESS.md always contains:
- The active phase and its current status
- A **NEXT ACTION** line — the exact checklist item to resume from
- Infrastructure state (what exists, what is pending, what must not be touched)

Do not ask the user what to work on. Do not re-plan. Read PROGRESS.md, find the NEXT ACTION, and resume from there. Update PROGRESS.md's NEXT ACTION at the end of every work session so the next agent has a precise handoff.

## Workflow (Phase 37 onwards)
- All three dev servers must be running before writing any code:
  - `cd src/backend && npm run dev` (port 3001)
  - `cd src/frontend && npm run dev` (port 5173)
  - `cd src/admin && npm run dev` (port 5175)
  - `cd src/therapist && npm run dev` (port 5176) — once scaffolded
- Build locally, verify in browser, commit only when satisfied
- Never commit to see how something looks — only commit when it works correctly in the browser
- After every UI or route change, verify at localhost:5173 / 5175 / 5176 before moving to the next checklist item
- Run `npm run migrate` only when a migration is finalised and intentional — it applies to the live Supabase DB immediately
- Every migration file must have a corresponding `_rollback.sql` file alongside it

## Rules
- Follow the blueprint exactly. Do not invent, assume, or stub anything.
- Complete one checklist item fully before moving to the next.
- After completing any item: update CHECKLIST.md and PROGRESS.md immediately.
- If you encounter a conflict or ambiguity in the blueprint, stop and flag it — do not guess.
- Never skip the safety-related items in any module.
- Build order is defined in blueprint Section 16 — do not deviate from it.