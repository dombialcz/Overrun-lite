const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildPayload,
  loadFixtures,
  parseArgs,
  scoreBreakdown,
  summarizeResults,
} = require("../../scripts/eval-local-llm");

test("parseArgs applies defaults and overrides", () => {
  assert.deepEqual(parseArgs([]), {
    baseUrl: "http://127.0.0.1:8080/v1",
    model: "mlx-community/Qwen2.5-Coder-7B-Instruct-4bit",
    fixtures: "tests/evals/task-breakdown.jsonl",
    strict: false,
  });

  assert.deepEqual(
    parseArgs(["--base-url", "http://localhost:9999/v1", "--model", "local-model", "--fixtures", "custom.jsonl", "--strict"]),
    {
      baseUrl: "http://localhost:9999/v1",
      model: "local-model",
      fixtures: "custom.jsonl",
      strict: true,
    }
  );
});

test("loadFixtures reads jsonl and ignores comments", () => {
  const filePath = path.join(os.tmpdir(), `overrun-fixtures-${Date.now()}.jsonl`);
  fs.writeFileSync(filePath, '# comment\n{"id":"one"}\n\n{"id":"two"}\n');

  const fixtures = loadFixtures(filePath);

  assert.deepEqual(fixtures.map((item) => item.id), ["one", "two"]);
  fs.unlinkSync(filePath);
});

test("buildPayload normalizes breakdown defaults", () => {
  const payload = buildPayload({
    task: { title: "Break down me" },
    instructions: "Use short actions.",
    granularity: "large",
    applyMode: "replace",
  });

  assert.equal(payload.mode, "task_breakdown");
  assert.equal(payload.granularity, "large");
  assert.equal(payload.applyMode, "replace");
});

test("scoreBreakdown checks count and required terms", () => {
  const score = scoreBreakdown(
    {
      subtasks: [
        { title: "Write implementation tests", minutes: 20 },
        { title: "Review UI flow", minutes: 15 },
      ],
    },
    {
      minSubtasks: 2,
      maxSubtasks: 3,
      requiredTerms: ["test"],
      forbiddenTerms: ["mark complete"],
    }
  );

  assert.equal(score.pass, true);
  assert.equal(score.countOk, true);
  assert.deepEqual(score.missingRequiredTerms, []);
});

test("scoreBreakdown reports missing and forbidden terms", () => {
  const score = scoreBreakdown(
    {
      subtasks: [{ title: "Mark complete now", minutes: 10 }],
    },
    {
      minSubtasks: 2,
      maxSubtasks: 3,
      requiredTerms: ["review"],
      forbiddenTerms: ["mark complete"],
    }
  );

  assert.equal(score.pass, false);
  assert.equal(score.countOk, false);
  assert.deepEqual(score.missingRequiredTerms, ["review"]);
  assert.deepEqual(score.presentForbiddenTerms, ["mark complete"]);
});

test("summarizeResults calculates advisory metrics", () => {
  const summary = summarizeResults([
    { latencyMs: 100, extracted: true, normalized: true, quality: { pass: true } },
    { latencyMs: 300, extracted: true, normalized: false, quality: { pass: false } },
  ]);

  assert.equal(summary.total, 2);
  assert.equal(summary.parseCount, 2);
  assert.equal(summary.normalizedCount, 1);
  assert.equal(summary.qualityCount, 1);
  assert.equal(summary.averageLatencyMs, 200);
});
