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

AI output is always reviewed before it is applied to the backlog.

## Tests

End-to-end tests use Playwright Test with a custom `{ ui }` fixture:

```sh
npm install
npm run test:e2e
```

All page interaction should start from `ui` in `tests/e2e/fixtures/ui.fixture.ts`.
Sub page objects are loaded lazily through `ui.calendar`, `ui.taskDetails`,
`ui.inbox`, `ui.backlog`, `ui.settings`, and `ui.aiReview`.
