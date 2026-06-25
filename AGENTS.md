# Agent Guide

## Project Goal

Overrun Lite is a local-first AI-assisted daily planner. It helps users dump raw thoughts into an inbox, review AI-proposed tasks, maintain a backlog, and plan work on a day calendar.

User control is central: AI output is draft-only until the user reviews and applies it.

## Repository Map

- `index.html`, `styles.css`, and `app.js` contain the vanilla frontend.
- `aiContract.js` owns shared AI prompt, schema, parsing, and normalization behavior.
- `api/plan.js` is the Vercel Chat Completions-compatible endpoint.
- `tests/e2e/` contains Playwright regression coverage using the custom `{ ui }` fixture.
- `README.md` documents running the app, AI modes, Google Calendar import, and test commands.
- `CHANGELOG.md` records recent user-visible changes.

## Working Rules

- Preserve the vanilla HTML/CSS/JS architecture and localStorage persistence unless explicitly asked otherwise.
- Prefer small, behavior-focused changes over broad rewrites.
- Do not rewrite unrelated UI, state, docs, or tests while solving a narrow task.
- Treat existing worktree changes as intentional user work. Do not revert them unless explicitly requested.
- Keep GitHub Pages static-hosting compatibility unless a change explicitly targets Vercel-only behavior.
- Keep user-visible AI behavior review-before-apply.

## Testing Rules

- Use `node --check app.js` for frontend JavaScript syntax checks.
- Run `npm run test:e2e` before committing meaningful UI or behavior changes.
- New E2E tests must start from the `{ ui }` fixture in `tests/e2e/fixtures/ui.fixture.ts`.
- Do not instantiate sub page objects directly in specs; access them lazily from `ui`.
- Add regression tests for fixes involving calendar layout, drag/resize behavior, AI parsing, import/deduplication, or localStorage persistence.

## UI Rules

- Calendar blocks must stay compact, readable, and free from incoherent overlap.
- Secondary task controls belong in drawers, not inside cramped calendar blocks.
- Preserve mobile and narrow viewport usability when changing layout.

## AI Rules

- Keep provider requests Chat Completions-compatible.
- Local provider mode may receive weak, wrapped, or malformed JSON; normalization should be defensive.
- Never let malformed AI output corrupt localStorage.
- Never apply AI changes without user review.
