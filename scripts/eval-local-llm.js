#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");

const ai = require("../aiContract");

const DEFAULT_BASE_URL = "http://127.0.0.1:8080/v1";
const DEFAULT_MODEL = "mlx-community/Qwen2.5-Coder-7B-Instruct-4bit";
const DEFAULT_FIXTURES = "tests/evals/task-breakdown.jsonl";
const DEFAULT_FAILURE_DIR = "tmp/evals";
const RAW_EXCERPT_CHARS = 700;

function parseArgs(argv) {
  const options = {
    baseUrl: DEFAULT_BASE_URL,
    model: DEFAULT_MODEL,
    fixtures: DEFAULT_FIXTURES,
    failureDir: DEFAULT_FAILURE_DIR,
    json: false,
    saveFailures: false,
    strict: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--save-failures") {
      options.saveFailures = true;
      continue;
    }
    if (arg === "--strict") {
      options.strict = true;
      continue;
    }
    if (arg === "--base-url" || arg === "--model" || arg === "--fixtures" || arg === "--failure-dir") {
      const value = argv[index + 1];
      if (!value) throw new Error(`${arg} requires a value.`);
      if (arg === "--base-url") options.baseUrl = value;
      if (arg === "--model") options.model = value;
      if (arg === "--fixtures") options.fixtures = value;
      if (arg === "--failure-dir") options.failureDir = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function loadFixtures(filePath) {
  const absolutePath = path.resolve(process.cwd(), filePath);
  const raw = fs.readFileSync(absolutePath, "utf8");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (err) {
        throw new Error(`Invalid JSONL at ${filePath}:${index + 1}: ${err.message}`);
      }
    });
}

function buildPayload(fixture) {
  return {
    mode: "task_breakdown",
    task: fixture.task || {},
    instructions: fixture.instructions || "",
    granularity: fixture.granularity || "medium",
    applyMode: fixture.applyMode === "replace" ? "replace" : "append",
  };
}

function scoreBreakdown(normalized, criteria = {}) {
  const subtasks = Array.isArray(normalized.subtasks) ? normalized.subtasks : [];
  const text = subtasks.map((item) => `${item.title} ${item.minutes}`).join(" ").toLowerCase();
  const requiredTerms = Array.isArray(criteria.requiredTerms) ? criteria.requiredTerms : [];
  const forbiddenTerms = Array.isArray(criteria.forbiddenTerms) ? criteria.forbiddenTerms : [];
  const minSubtasks = Number.isFinite(Number(criteria.minSubtasks)) ? Number(criteria.minSubtasks) : 1;
  const maxSubtasks = Number.isFinite(Number(criteria.maxSubtasks)) ? Number(criteria.maxSubtasks) : Infinity;

  const missingRequiredTerms = requiredTerms.filter((term) =>
    !text.includes(String(term).toLowerCase())
  );
  const presentForbiddenTerms = forbiddenTerms.filter((term) =>
    text.includes(String(term).toLowerCase())
  );
  const countOk = subtasks.length >= minSubtasks && subtasks.length <= maxSubtasks;
  const actionableTitles = subtasks.every((item) => /\S+\s+\S+/.test(item.title));

  return {
    pass: countOk && actionableTitles && missingRequiredTerms.length === 0 && presentForbiddenTerms.length === 0,
    countOk,
    actionableTitles,
    missingRequiredTerms,
    presentForbiddenTerms,
  };
}

function createRawExcerpt(text, maxChars = RAW_EXCERPT_CHARS) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars - 1)}…`;
}

async function postChatCompletion({ baseUrl, model, messages, useSchema }) {
  const body = {
    model,
    messages,
    temperature: 0.2,
    max_tokens: 1800,
    response_format: useSchema
      ? {
          type: "json_schema",
          json_schema: {
            name: "overrun_breakdown_response",
            strict: true,
            schema: ai.breakdownResponseSchema,
          },
        }
      : { type: "json_object" },
  };

  const response = await fetch(`${trimSlash(baseUrl)}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = json.error && json.error.message ? json.error.message : "Local AI request failed.";
    const err = new Error(message);
    err.status = response.status;
    err.canRetryWithoutSchema = useSchema && /response_format|json_schema|schema/i.test(message);
    throw err;
  }

  return json.choices && json.choices[0] && json.choices[0].message
    ? json.choices[0].message.content || ""
    : "";
}

async function evaluateFixture(fixture, options) {
  const payload = buildPayload(fixture);
  const messages = ai.buildPlannerMessages(payload);
  const started = performance.now();
  let schemaUsed = true;
  let content;

  try {
    content = await postChatCompletion({ ...options, messages, useSchema: true });
  } catch (err) {
    if (!err.canRetryWithoutSchema) throw err;
    schemaUsed = false;
    content = await postChatCompletion({ ...options, messages, useSchema: false });
  }

  const latencyMs = Math.round(performance.now() - started);
  const result = {
    id: fixture.id || fixture.name || "unnamed",
    latencyMs,
    schemaUsed,
    extracted: false,
    normalized: false,
    quality: null,
    rawExcerpt: "",
    rawResponse: "",
    failureArtifact: "",
    subtasks: [],
    warningsCount: 0,
    questionsCount: 0,
    error: "",
  };
  result.rawResponse = content;
  result.rawExcerpt = createRawExcerpt(content);

  try {
    const parsed = ai.extractJson(content);
    result.extracted = true;
    const normalized = ai.normalizeBreakdownResponse(parsed);
    result.normalized = normalized.subtasks.length > 0;
    result.subtasks = normalized.subtasks;
    result.warningsCount = normalized.warnings.length;
    result.questionsCount = normalized.questions.length;
    result.quality = scoreBreakdown(normalized, fixture.expect || {});
  } catch (err) {
    result.error = err.message;
  }

  return result;
}

function resultNeedsInspection(result) {
  return !result.extracted || !result.normalized || !result.quality || !result.quality.pass;
}

function writeFailureArtifact(result, fixture, options) {
  if (!options.saveFailures || !resultNeedsInspection(result)) return "";
  const directory = path.resolve(process.cwd(), options.failureDir || DEFAULT_FAILURE_DIR);
  fs.mkdirSync(directory, { recursive: true });
  const safeId = String(result.id || "fixture").replace(/[^a-z0-9._-]+/gi, "-").replace(/^-|-$/g, "");
  const filename = `${new Date().toISOString().replace(/[:.]/g, "-")}-${safeId || "fixture"}.json`;
  const artifactPath = path.join(directory, filename);
  fs.writeFileSync(
    artifactPath,
    JSON.stringify(
      {
        id: result.id,
        fixture,
        result: sanitizeResult(result, { includeRawResponse: true }),
      },
      null,
      2
    )
  );
  return artifactPath;
}

function summarizeResults(results) {
  const total = results.length || 1;
  const parseCount = results.filter((item) => item.extracted).length;
  const normalizedCount = results.filter((item) => item.normalized).length;
  const qualityCount = results.filter((item) => item.quality && item.quality.pass).length;
  const averageLatencyMs = Math.round(
    results.reduce((sum, item) => sum + item.latencyMs, 0) / total
  );

  return {
    total: results.length,
    parseCount,
    normalizedCount,
    qualityCount,
    parseRate: parseCount / total,
    normalizedRate: normalizedCount / total,
    averageLatencyMs,
  };
}

function printResult(result) {
  console.log(`\n[${result.id}]`);
  console.log(`latency: ${result.latencyMs}ms`);
  console.log(`schema: ${result.schemaUsed ? "json_schema" : "json_object fallback"}`);
  console.log(`json extraction: ${result.extracted ? "pass" : "fail"}`);
  console.log(`normalized subtasks: ${result.subtasks.length}`);
  if (result.quality) {
    console.log(`quality: ${result.quality.pass ? "pass" : "warn"}`);
    if (!result.quality.countOk) console.log("  - subtask count outside expected range");
    if (!result.quality.actionableTitles) console.log("  - one or more subtask titles look too short");
    result.quality.missingRequiredTerms.forEach((term) => console.log(`  - missing required term: ${term}`));
    result.quality.presentForbiddenTerms.forEach((term) => console.log(`  - present forbidden term: ${term}`));
  }
  if (result.error) console.log(`error: ${result.error}`);
  console.log(`warnings/questions: ${result.warningsCount}/${result.questionsCount}`);
  result.subtasks.slice(0, 4).forEach((subtask, index) => {
    console.log(`  ${index + 1}. ${subtask.title} (${subtask.minutes}m)`);
  });
  if (resultNeedsInspection(result) && result.rawExcerpt) {
    console.log(`raw excerpt: ${result.rawExcerpt}`);
  }
  if (result.failureArtifact) {
    console.log(`saved failure: ${path.relative(process.cwd(), result.failureArtifact)}`);
  }
}

function sanitizeResult(result, options = {}) {
  const sanitized = {
    id: result.id,
    latencyMs: result.latencyMs,
    schemaUsed: result.schemaUsed,
    extracted: result.extracted,
    normalized: result.normalized,
    quality: result.quality,
    rawExcerpt: result.rawExcerpt,
    failureArtifact: result.failureArtifact,
    subtasks: result.subtasks,
    warningsCount: result.warningsCount,
    questionsCount: result.questionsCount,
    error: result.error,
  };
  if (options.includeRawResponse) {
    sanitized.rawResponse = result.rawResponse;
  }
  return sanitized;
}

function createReport(results, summary, options) {
  return {
    config: {
      baseUrl: trimSlash(options.baseUrl),
      model: options.model,
      fixtures: options.fixtures,
      mode: options.strict ? "strict" : "advisory",
      saveFailures: options.saveFailures,
      failureDir: options.failureDir,
    },
    summary,
    results: results.map((result) => sanitizeResult(result)),
  };
}

function trimSlash(value) {
  return String(value || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const fixtures = loadFixtures(options.fixtures);
  if (!fixtures.length) throw new Error(`No fixtures found in ${options.fixtures}.`);

  if (!options.json) {
    console.log(`Local LLM eval: ${options.model}`);
    console.log(`Endpoint: ${trimSlash(options.baseUrl)}`);
    console.log(`Fixtures: ${options.fixtures}`);
    console.log(`Mode: ${options.strict ? "strict" : "advisory"}`);
    if (options.saveFailures) console.log(`Failure artifacts: ${options.failureDir}`);
  }

  const results = [];
  for (const fixture of fixtures) {
    const result = await evaluateFixture(fixture, options);
    result.failureArtifact = writeFailureArtifact(result, fixture, options);
    results.push(result);
    if (!options.json) printResult(result);
  }

  const summary = summarizeResults(results);
  if (options.json) {
    console.log(JSON.stringify(createReport(results, summary, options), null, 2));
  } else {
    console.log("\nSummary");
    console.log(`fixtures: ${summary.total}`);
    console.log(`parse success: ${summary.parseCount}/${summary.total} (${Math.round(summary.parseRate * 100)}%)`);
    console.log(`normalization success: ${summary.normalizedCount}/${summary.total} (${Math.round(summary.normalizedRate * 100)}%)`);
    console.log(`advisory quality pass: ${summary.qualityCount}/${summary.total}`);
    console.log(`average latency: ${summary.averageLatencyMs}ms`);
  }

  if (options.strict && summary.qualityCount !== summary.total) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`Eval harness error: ${err.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  buildPayload,
  createRawExcerpt,
  createReport,
  loadFixtures,
  parseArgs,
  resultNeedsInspection,
  scoreBreakdown,
  summarizeResults,
  sanitizeResult,
  writeFailureArtifact,
};
