# Local LLM Eval Questions

Overrun Lite can use local OpenAI-compatible models, but live model evaluation is intentionally deferred. Static contract tests and mocked browser tests should remain the default regression suite.

## Questions to Answer Before Building a Harness

- Which local models should be supported and compared first?
- What hardware profile should the latency budget assume?
- What is the acceptable p50 and p95 latency for one task breakdown?
- What fixture format should represent real planning tasks without leaking private user data?
- Which rubric dimensions matter most: valid JSON, useful granularity, concrete action wording, time realism, instruction following, or safety?
- What score should count as pass, warning, or fail?
- Should live evals be manual, advisory in CI, or a hard CI gate?
- How should nondeterminism be handled across repeated runs?
- How many samples per fixture are needed before judging a model?
- Which model/server metadata must be recorded: model name, quantization, server, version, temperature, max tokens, and hardware?
- How should failures be stored so they can become future static regression fixtures?
- What privacy rules apply if real user tasks are used to create eval examples?

## Future Command Shape

An eventual manual command could look like this:

```sh
npm run eval:local -- \
  --base-url http://127.0.0.1:8080/v1 \
  --model mlx-community/Qwen2.5-Coder-7B-Instruct-4bit \
  --fixtures tests/evals/task-breakdown.jsonl
```

The command should print parse rate, normalization rate, latency, rubric scores, and example failures. It should not mutate localStorage, require browser state, or run as part of the default test suite.
