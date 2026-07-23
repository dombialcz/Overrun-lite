const assert = require("node:assert/strict");
const test = require("node:test");

const configHandler = require("../../api/config");
const planHandler = require("../../api/plan");
const { normalizeUsage } = require("../../api/ai-usage");

test("public config stays guest-only when server secrets are absent", async () => {
  await withEnv({
    SUPABASE_URL: "",
    SUPABASE_PUBLISHABLE_KEY: "",
    SUPABASE_SECRET_KEY: "",
    OPENAI_API_KEY: "",
  }, async () => {
    const res = createResponse();
    await configHandler(createRequest("GET"), res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
      auth: { enabled: false },
      ai: { hostedAvailable: false },
    });
    assert.equal(res.headers["access-control-allow-origin"], undefined);
  });
});

test("public config exposes only publishable Supabase settings", async () => {
  await withEnv({
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_public",
    SUPABASE_SECRET_KEY: "sb_secret_private",
    OPENAI_API_KEY: "openai-private",
  }, async () => {
    const res = createResponse();
    await configHandler(createRequest("GET"), res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
      auth: {
        enabled: true,
        url: "https://project.supabase.co",
        publishableKey: "sb_publishable_public",
      },
      ai: { hostedAvailable: true },
    });
    assert.doesNotMatch(JSON.stringify(res.body), /sb_secret|openai-private/);
  });
});

test("hosted planner returns stable unavailable and authentication errors", async () => {
  await withEnv({ OPENAI_API_KEY: "" }, async () => {
    const res = createResponse();
    await planHandler(createRequest("POST", {}), res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.code, "ai_unavailable");
  });

  await withEnv({ OPENAI_API_KEY: "configured" }, async () => {
    const res = createResponse();
    await planHandler(createRequest("POST", {}), res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.code, "auth_required");
  });
});

test("AI usage response clamps counters and exposes Warsaw reset data", () => {
  assert.deepEqual(normalizeUsage({
    usage_day: "2026-07-23",
    daily_limit: 10,
    used_actions: 12,
    reset_at: "2026-07-23T22:00:00.000Z",
  }), {
    day: "2026-07-23",
    timezone: "Europe/Warsaw",
    used: 12,
    limit: 10,
    remaining: 0,
    resetAt: "2026-07-23T22:00:00.000Z",
  });
});

function createRequest(method, body = null) {
  return {
    method,
    body,
    headers: {},
  };
}

function createResponse() {
  return {
    body: null,
    headers: {},
    statusCode: 200,
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
    end() {
      return this;
    },
  };
}

async function withEnv(values, callback) {
  const previous = {};
  Object.entries(values).forEach(([key, value]) => {
    previous[key] = process.env[key];
    if (value === "") delete process.env[key];
    else process.env[key] = value;
  });
  try {
    await callback();
  } finally {
    Object.entries(previous).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
}
