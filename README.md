# Overrun Lite

Work in progress demo: https://dombialcz.github.io/Overrun-lite/

Local-first AI-assisted daily planner.

## Run locally

This app is dependency-free. Serve the repository root with any static server:

```sh
python3 -m http.server 4173
```

Then open `http://127.0.0.1:4173/index.html`.

## AI modes

The planner supports two AI targets:

- `Vercel API`: the browser calls `/api/plan`. Configure `OPENAI_API_KEY`, optional `OPENAI_MODEL`, and optional `OPENAI_BASE_URL` in the Vercel environment.
- `Local OpenAI-compatible`: the browser calls `{baseUrl}/chat/completions` directly. The local server must allow browser CORS. This mode is intended for local demos with servers such as LM Studio, Ollama-compatible OpenAI endpoints, or other OpenAI-compatible local gateways.

AI output is always reviewed before it is applied. Brain dumps create draft
backlog tasks, and task breakdown creates draft subtasks for the selected task.

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

## Google Calendar import

The Google Calendar import is browser-only and works on static hosting. It uses Google Identity Services with the readonly Calendar scope, then calls the Calendar Events API directly from the browser.

To use it:

1. Create an OAuth web client in Google Cloud.
2. Add the app origin, for example `http://127.0.0.1:4173` or `https://dombialcz.github.io`, to the authorized JavaScript origins.
3. Paste the OAuth client ID into `Settings`.
4. Click `Import from Google Calendar`, review the proposed events, then apply them.

Imported events keep Google source IDs in localStorage so repeated imports skip duplicates.

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

All page interaction should start from `ui` in `tests/e2e/fixtures/ui.fixture.ts`.
Sub page objects are loaded lazily through `ui.calendar`, `ui.taskDetails`,
`ui.inbox`, `ui.backlog`, `ui.settings`, `ui.aiReview`, and `ui.googleImport`.

Manual local LLM evals require a running OpenAI-compatible local server and are
advisory, not deterministic:

```sh
npm run eval:local
```
