const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildPayload,
  createRawExcerpt,
  createReport,
  loadFixtures,
  parseArgs,
  resultNeedsInspection,
  sanitizeResult,
  scoreBreakdown,
  summarizeResults,
  writeFailureArtifact,
} = require("../../scripts/eval-local-llm");

test("parseArgs applies defaults and overrides", () => {
  assert.deepEqual(parseArgs([]), {
    baseUrl: "http://127.0.0.1:8080/v1",
    model: "mlx-community/Qwen2.5-Coder-7B-Instruct-4bit",
    fixtures: "tests/evals/task-breakdown.jsonl",
    failureDir: "tmp/evals",
    json: false,
    saveFailures: false,
    strict: false,
  });

  assert.deepEqual(
    parseArgs([
      "--base-url",
      "http://localhost:9999/v1",
      "--model",
      "local-model",
      "--fixtures",
      "custom.jsonl",
      "--failure-dir",
      "tmp/custom-evals",
      "--json",
      "--save-failures",
      "--strict",
    ]),
    {
      baseUrl: "http://localhost:9999/v1",
      model: "local-model",
      fixtures: "custom.jsonl",
      failureDir: "tmp/custom-evals",
      json: true,
      saveFailures: true,
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

test("createRawExcerpt compacts and truncates model text", () => {
  assert.equal(createRawExcerpt(" hello\n\nworld  "), "hello world");
  assert.equal(createRawExcerpt("abcdefghij", 6), "abcde…");
});

test("resultNeedsInspection catches parse, normalization, and quality failures", () => {
  assert.equal(
    resultNeedsInspection({ extracted: true, normalized: true, quality: { pass: true } }),
    false
  );
  assert.equal(
    resultNeedsInspection({ extracted: false, normalized: true, quality: { pass: true } }),
    true
  );
  assert.equal(
    resultNeedsInspection({ extracted: true, normalized: false, quality: { pass: true } }),
    true
  );
  assert.equal(
    resultNeedsInspection({ extracted: true, normalized: true, quality: { pass: false } }),
    true
  );
});

test("sanitizeResult omits raw response unless requested", () => {
  const result = {
    id: "fixture",
    latencyMs: 10,
    schemaUsed: true,
    extracted: true,
    normalized: false,
    quality: { pass: false },
    rawExcerpt: "short",
    rawResponse: "full raw response",
    failureArtifact: "",
    subtasks: [],
    warningsCount: 0,
    questionsCount: 0,
    error: "",
  };

  assert.equal(Object.hasOwn(sanitizeResult(result), "rawResponse"), false);
  assert.equal(sanitizeResult(result, { includeRawResponse: true }).rawResponse, "full raw response");
});

test("createReport includes config, summary, and sanitized results", () => {
  const result = {
    id: "fixture",
    latencyMs: 10,
    schemaUsed: true,
    extracted: true,
    normalized: false,
    quality: { pass: false },
    rawExcerpt: "short",
    rawResponse: "full raw response",
    failureArtifact: "",
    subtasks: [],
    warningsCount: 0,
    questionsCount: 0,
    error: "",
  };

  const report = createReport([result], summarizeResults([result]), {
    baseUrl: "http://localhost:8080/v1/",
    model: "local",
    fixtures: "fixtures.jsonl",
    failureDir: "tmp/evals",
    saveFailures: false,
    strict: false,
  });

  assert.equal(report.config.baseUrl, "http://localhost:8080/v1");
  assert.equal(report.summary.total, 1);
  assert.equal(report.results[0].id, "fixture");
  assert.equal(Object.hasOwn(report.results[0], "rawResponse"), false);
});

test("writeFailureArtifact saves raw response only for inspected failures", () => {
  const directory = path.join(os.tmpdir(), `overrun-eval-artifacts-${Date.now()}`);
  const passing = {
    id: "passing",
    extracted: true,
    normalized: true,
    quality: { pass: true },
  };
  const failing = {
    id: "bad fixture",
    latencyMs: 10,
    schemaUsed: true,
    extracted: true,
    normalized: false,
    quality: { pass: false },
    rawExcerpt: "short",
    rawResponse: "full raw response",
    failureArtifact: "",
    subtasks: [],
    warningsCount: 0,
    questionsCount: 0,
    error: "",
  };

  assert.equal(writeFailureArtifact(passing, {}, { saveFailures: true, failureDir: directory }), "");
  const artifactPath = writeFailureArtifact(failing, { id: "fixture" }, { saveFailures: true, failureDir: directory });
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  assert.equal(artifact.id, "bad fixture");
  assert.equal(artifact.result.rawResponse, "full raw response");
  fs.rmSync(directory, { recursive: true, force: true });
});
