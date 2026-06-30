# Local LLM Evals

Overrun Lite includes a manual advisory eval for local OpenAI-compatible models. It checks whether task-breakdown output can be extracted as JSON, normalized into subtasks, and pass a few lightweight shape checks.

This command is not part of `npm test` or CI. Local model output is nondeterministic, hardware-dependent, and useful mainly for comparing model/server behavior during development.

## Run

Start a local OpenAI-compatible server, for example:

```sh
mlx_lm.server \
  --model mlx-community/Qwen2.5-Coder-7B-Instruct-4bit \
  --host 127.0.0.1 \
  --port 8080
```

Then run:

```sh
npm run eval:local
```

Defaults:

- Base URL: `http://127.0.0.1:8080/v1`
- Model: `mlx-community/Qwen2.5-Coder-7B-Instruct-4bit`
- Fixtures: `tests/evals/task-breakdown.jsonl`

Overrides:

```sh
npm run eval:local -- \
  --base-url http://127.0.0.1:8080/v1 \
  --model mlx-community/Qwen2.5-Coder-7B-Instruct-4bit \
  --fixtures tests/evals/task-breakdown.jsonl
```

Inspection options:

```sh
npm run eval:local -- --json
npm run eval:local -- --save-failures
npm run eval:local -- --save-failures --failure-dir tmp/evals
```

## Output

Each fixture reports:

- request latency
- whether `json_schema` or `json_object` fallback was used
- whether JSON extraction passed
- normalized subtask count
- advisory quality result
- warning/question counts
- the first few normalized subtasks
- a short raw response excerpt when extraction, normalization, or quality checks fail

The summary reports parse success rate, normalization success rate, advisory quality pass count, and average latency.

Advisory quality warnings do not make the command fail. The command exits nonzero only for harness/config errors such as an unreadable fixture file or unreachable endpoint.

`--json` prints one machine-readable report with config, summary, and sanitized per-fixture results. Full raw model responses are not included in JSON reports.

`--save-failures` writes failed fixture artifacts to `tmp/evals` by default. These artifacts include the full raw response for local debugging and are ignored by git.

## Strict Mode

`--strict` is available for experiments:

```sh
npm run eval:local -- --strict
```

Strict mode exits nonzero if any fixture fails the lightweight shape checks. Do not use strict mode in default CI until the model, server, fixtures, and pass thresholds are stable.

## Open Questions Before CI Gating

- Which local models should be compared regularly?
- What latency budget should be considered acceptable for the target hardware?
- Which rubric dimensions matter most beyond parseability?
- How many samples per fixture are needed before judging a nondeterministic model?
- How should failed live outputs be promoted into deterministic contract fixtures?
- What privacy rules apply if real user tasks are ever used as eval examples?
