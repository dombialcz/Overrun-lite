# Overrun Lite

Work in progress demo: https://dombialcz.github.io/Overrun-lite/

Local-first AI-assisted daily planner.

## Run locally

The frontend is build-free. Serve the repository root with any static server:

```sh
python3 -m http.server 4173
```

Then open `http://127.0.0.1:4173/index.html`.

This static mode is intentionally guest/local-only. It does not request cloud
configuration and it keeps working when Supabase and OpenAI keys are absent.
Use `vercel dev` (normally on port 3000) when testing accounts and Vercel
functions locally.

## Theme preference

Overrun Lite follows the operating-system light or dark theme on a first visit.
The always-visible theme button switches explicitly between the two and stores
the choice in the browser-wide `overrun_lite_theme` localStorage value. Theme
preference is not included in planner exports, cloud sync, or AI settings.
The palette uses amethyst for primary actions and light-theme active timers,
grape for selection and structure, orange for light-theme tasks and attention,
and pale green for completion. Brown red remains the danger/conflict family and
also gives ordinary dark-theme tasks their controlled maroon emphasis. Light
mode uses flat white and floral-white surfaces without decorative gradients;
dark mode keeps its quieter panel treatment.

## Invite-only accounts and sync

The canonical Vercel deployment uses Supabase Auth and Postgres. Signed-in users
receive a separate local cache and one revision-checked cloud planner document.
Guest data is never silently merged into an account: first login asks which
complete version to keep. Concurrent device writes pause with an explicit
reload-or-overwrite choice.

### Supabase setup

1. Create a Supabase project.
2. Run the SQL files in `supabase/migrations/` in filename order through the
   Supabase SQL editor, or link the Supabase CLI and run `supabase db push`.
3. In Authentication settings:
   - Disable public user sign-ups. Admin invite generation still works.
   - Set the Site URL to the production `APP_ORIGIN`.
   - Add `${APP_ORIGIN}/?activation=1` to the allowed redirect URLs.
   - Add `${APP_ORIGIN}/?recovery=1` to the allowed redirect URLs.
   - Set email/OTP link expiry to 86,400 seconds (24 hours).
   - Require at least 12 password characters, with lower and uppercase letters
     plus a number. The client mirrors these checks for immediate feedback.
4. Add the environment variables from `.env.example` to Vercel Production and
   Preview as appropriate, then redeploy.

`SUPABASE_PUBLISHABLE_KEY` is intentionally returned to the browser by
`/api/config`; Row Level Security restricts it to the signed-in user's rows.
`SUPABASE_SECRET_KEY` and `OPENAI_API_KEY` must remain server-only. Never prefix
them as public variables or commit a populated `.env` file.

The migration creates:

- `profiles`, including the administrator-controlled `ai_daily_limit`;
- `planner_states`, containing each user's tasks/backlog and sync revision;
- `ai_daily_usage`, containing server-managed Warsaw-day action counts;
- atomic database functions for planner saves and AI action reservations.

### Create an activation link

Supply the admin values to your local shell through your password manager or
another ephemeral environment mechanism, then run:

```sh
npm run user:invite -- person@example.com
```

The command prints one activation URL and does not send email. Send that URL to
the intended tester yourself. The user follows it, creates a password, and then
stays signed in through Supabase's refreshable browser session.

The sign-in drawer includes a self-service password recovery flow. Supabase
sends the reset email and returns the user to `?recovery=1`, where Overrun
requires a new password before loading account data. Resetting preserves the
existing user UUID and planner ownership.

### AI allowance administration

New accounts receive 10 hosted AI actions per `Europe/Warsaw` calendar day.
Analyze dump, Organize with current plan, Refine with answers, and Help me get
started each cost one action.
Edit `profiles.ai_daily_limit` in the Supabase dashboard to change a tester's
allowance; setting it to `0` disables hosted AI for that user.

Local OpenAI-compatible mode never consumes this allowance. The hosted counter
remains visible but muted as `Using custom settings`.

Supabase free projects may pause after a week without activity and do not
include automated backups. Exports remain the beta backup path until the project
moves to a paid plan or gains a separate backup process.

## AI modes

The planner supports two AI targets:

- `Vercel API`: the browser calls authenticated `/api/plan`. It is available
  only to signed-in users with remaining daily actions. Configure
  `OPENAI_API_KEY`, optional `OPENAI_MODEL`, and optional `OPENAI_BASE_URL` in
  the Vercel environment.
- `Local OpenAI-compatible`: the browser calls `{baseUrl}/chat/completions` directly. The local server must allow browser CORS. This mode is intended for local demos with servers such as LM Studio, Ollama-compatible OpenAI endpoints, or other OpenAI-compatible local gateways.

AI output is always reviewed before it is applied. Brain dumps create immediately
usable draft backlog tasks and may show up to two optional clarifications when an
answer would materially improve the proposal. Answering one enables a separate
refinement action; it never blocks applying the initial draft. Detailed task steps
remain an explicit “Help me get started” action for the selected task.
If hosted AI is not configured, the account and sync features continue working;
hosted AI controls are disabled instead of producing missing-key errors.

## Local LLM with MLX

Start an OpenAI-compatible MLX server from the environment where `mlx-lm` is installed:

```sh
mlx_lm.server \
  --model mlx-community/Qwen2.5-Coder-7B-Instruct-4bit \
  --host 127.0.0.1 \
  --port 8080
```

Then open `Settings` in the app and use:

- Mode: `Local OpenAI-compatible`
- Local base URL: `http://127.0.0.1:8080/v1`
- Model: `mlx-community/Qwen2.5-Coder-7B-Instruct-4bit`
- Local API key: leave blank

The app sends Chat Completions-compatible requests to `/chat/completions`.
Small local models may return non-standard task JSON, so the client accepts common
aliases such as `task`, `priority`, `timeEstimate`, `steps`, `items`, and
`currentTasks`.

## Import and export

The `Data & exports` section in Settings supports local file workflows:

- `Export day snapshot` downloads versioned JSON with day tasks, backlog,
  progress, subtasks, and summary totals.
- `Export day report` downloads a plain text hour-by-hour report for timesheets and
  daily standup notes.
- `Export backlog` exports a versioned backlog JSON.
- `Import backlog` accepts versioned backlog exports, day snapshots, and legacy
  raw task arrays. Imports are incremental and skip duplicates.
- Completed day tasks move immediately into the collapsed `Done` section below
  the open backlog. Done items are newest-first and can be restored to the open
  backlog with their progress reset.
- `Export backlog` includes open and Done items. `Clear backlog` removes open
  backlog items only after explicit confirmation and preserves Done history.

## Tests

Fast syntax and AI contract checks:

```sh
npm test
```

End-to-end tests use Playwright Test with a custom `{ ui }` fixture:

```sh
npm install
npm run test:e2e
```

The default suite does not contact live Supabase or AI services. Contract tests
cover public configuration and stable API error shapes, while Playwright mocks
the Supabase/Auth and OpenAI-compatible network boundaries to exercise login,
activation, first sync, conflict handling, quota exhaustion, and local-provider
fallback deterministically.

All page interaction should start from `ui` in `tests/e2e/fixtures/ui.fixture.ts`.
Sub page objects are loaded lazily through `ui.calendar`, `ui.taskDetails`,
`ui.inbox`, `ui.backlog`, `ui.settings`, `ui.aiReview`, `ui.dataActions`, and
`ui.theme`.

Manual local LLM evals require a running OpenAI-compatible local server and are
advisory, not deterministic:

```sh
npm run eval:local
```

Use `npm run eval:local -- --json` for a machine-readable report, or
`npm run eval:local -- --save-failures` to save failed raw model responses under
`tmp/evals/` for local inspection.
