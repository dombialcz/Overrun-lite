const {
  breakdownResponseSchema,
  buildPlannerMessages,
  contextOrganizeResponseSchema,
  extractJson,
  normalizeBreakdownResponse,
  normalizeClarifications,
  normalizeContextOrganizeResponse,
  normalizePlannerResponse,
  plannerResponseSchema,
} = require("../aiContract");
const {
  apiError,
  handleOptions,
  requireUser,
  sendError,
  setApiHeaders,
} = require("./_supabase");
const { normalizeUsage } = require("./ai-usage");

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEEPSEEK_V4_FLASH_MODEL = "deepseek/deepseek-v4-flash";
const MAX_HOSTED_COMPLETION_TOKENS = 1800;
const OPENROUTER_MAX_PRICE = {
  prompt: 0.4,
  completion: 1.0,
};

module.exports = async function handler(req, res) {
  if (handleOptions(req, res, ["POST", "OPTIONS"])) return;
  setApiHeaders(req, res, ["POST", "OPTIONS"]);

  if (req.method !== "POST") {
    res.status(405).json({ error: "Only POST is supported.", code: "method_not_allowed" });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(503).json({
      error: "Hosted AI is not configured.",
      code: "ai_unavailable",
    });
    return;
  }

  let reservation = null;
  let admin = null;
  let user = null;
  try {
    ({ admin, user } = await requireUser(req));
    const payload = normalizeRequestBody(req.body);
    reservation = await reserveAction(admin, user.id);
    if (!reservation.allowed) {
      res.status(429).json({
        error: "Your daily hosted AI allowance has been used.",
        code: "daily_limit_reached",
        usage: normalizeUsage(reservation),
      });
      return;
    }
    const result = await requestPlanner(payload, {
      apiKey,
      model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
      baseUrl: process.env.OPENAI_BASE_URL || DEFAULT_BASE_URL,
    });
    const usage = normalizeUsage(reservation);
    res.setHeader("X-Overrun-AI-Used", String(usage.used));
    res.setHeader("X-Overrun-AI-Limit", String(usage.limit));
    res.setHeader("X-Overrun-AI-Reset", usage.resetAt || "");
    res.status(200).json(result);
  } catch (err) {
    if (reservation && reservation.allowed && !err.providerCompleted && admin && user) {
      await releaseAction(admin, user.id, reservation.usage_day).catch(() => {});
    }
    if (err.statusCode === 400) err.expose = true;
    if (!err.code && err.statusCode >= 500) err.code = "provider_error";
    sendError(res, err);
  }
};

async function reserveAction(admin, userId) {
  const { data, error } = await admin.rpc("reserve_ai_action", { p_user_id: userId });
  if (error) {
    logDatabaseError("reserve_ai_action", error);
    throw apiError(503, "usage_unavailable", "AI usage is unavailable.");
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw apiError(503, "usage_unavailable", "AI usage is unavailable.");
  return row;
}

async function releaseAction(admin, userId, usageDay) {
  const { error } = await admin.rpc("release_ai_action", {
    p_user_id: userId,
    p_usage_day: usageDay,
  });
  if (error) {
    logDatabaseError("release_ai_action", error);
    throw error;
  }
}

function logDatabaseError(operation, error) {
  console.error(`Supabase ${operation} failed`, {
    code: String((error && error.code) || ""),
    message: String((error && error.message) || ""),
    details: String((error && error.details) || ""),
    hint: String((error && error.hint) || ""),
  });
}

function normalizeRequestBody(body) {
  let payload = body || {};
  if (typeof body === "string") {
    try {
      payload = JSON.parse(body);
    } catch (err) {
      throw badRequest("Request body must be valid JSON.");
    }
  }
  if (payload.mode === "task_breakdown") {
    const task = payload.task && typeof payload.task === "object" ? payload.task : null;
    if (!task || !String(task.title || task.name || "").trim()) {
      throw badRequest("Task is required.");
    }
    return {
      mode: "task_breakdown",
      task,
      instructions: String(payload.instructions || ""),
      granularity: ["small", "medium", "large"].includes(payload.granularity)
        ? payload.granularity
        : "medium",
      applyMode: payload.applyMode === "replace" ? "replace" : "append",
    };
  }
  if (payload.mode !== "brain_dump" && payload.mode !== "context_organize") {
    throw badRequest("Unsupported planner mode.");
  }
  if (!String(payload.input || "").trim()) {
    throw badRequest("Input is required.");
  }
  return {
    mode: payload.mode,
    input: String(payload.input),
    clarifications: normalizeClarifications(payload.clarifications),
    answers: payload.answers && typeof payload.answers === "object" ? payload.answers : {},
    currentTasks: Array.isArray(payload.currentTasks) ? payload.currentTasks : [],
    currentBacklog: Array.isArray(payload.currentBacklog) ? payload.currentBacklog : [],
  };
}

async function requestPlanner(payload, config) {
  let providerCompleted = false;
  try {
    const messages = buildPlannerMessages(payload);
    const { schema, schemaName } = getResponseSchema(payload.mode);
    const response = await postChatCompletion(config, messages, true, schema, schemaName).catch(async (err) => {
      if (!err.canRetryWithoutSchema) throw err;
      return postChatCompletion(config, messages, false, schema, schemaName);
    });
    providerCompleted = true;
    const parsed = parseProviderJson(response);
    if (payload.mode === "task_breakdown") return normalizeBreakdownResponse(parsed);
    if (payload.mode === "context_organize") return normalizeContextOrganizeResponse(parsed, payload);
    return normalizePlannerResponse(parsed);
  } catch (err) {
    err.providerCompleted = providerCompleted;
    throw err;
  }
}

function getResponseSchema(mode) {
  if (mode === "task_breakdown") {
    return {
      schema: breakdownResponseSchema,
      schemaName: "overrun_breakdown_response",
    };
  }
  if (mode === "context_organize") {
    return {
      schema: contextOrganizeResponseSchema,
      schemaName: "overrun_context_organize_response",
    };
  }
  return {
    schema: plannerResponseSchema,
    schemaName: "overrun_planner_response",
  };
}

async function postChatCompletion(config, messages, useSchema, schema = plannerResponseSchema, schemaName = "overrun_planner_response") {
  const body = buildChatCompletionBody(config, messages, useSchema, schema, schemaName);

  const response = await fetch(`${trimSlash(config.baseUrl)}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const providerMessage = json.error && json.error.message ? json.error.message : "";
    const err = new Error("Hosted AI could not complete the request.");
    err.statusCode = 502;
    err.code = "provider_error";
    err.expose = true;
    err.canRetryWithoutSchema = useSchema && /response_format|json_schema|schema/i.test(providerMessage);
    throw err;
  }

  const content = json.choices && json.choices[0] && json.choices[0].message
    ? json.choices[0].message.content
    : "";
  return content;
}

function buildChatCompletionBody(config, messages, useSchema, schema = plannerResponseSchema, schemaName = "overrun_planner_response") {
  const body = {
    model: config.model,
    messages,
    temperature: 0.2,
    max_tokens: MAX_HOSTED_COMPLETION_TOKENS,
  };

  if (isOpenRouter(config.baseUrl)) {
    body.provider = {
      require_parameters: true,
      sort: "throughput",
      max_price: OPENROUTER_MAX_PRICE,
    };
    if (isDeepSeekV4Flash(config.model)) {
      body.reasoning = { effort: "none" };
    }
  }

  if (useSchema) {
    body.response_format = {
      type: "json_schema",
      json_schema: {
        name: schemaName,
        strict: true,
        schema,
      },
    };
  } else {
    body.response_format = { type: "json_object" };
  }

  return body;
}

function isOpenRouter(value) {
  try {
    return new URL(value).hostname === "openrouter.ai";
  } catch (err) {
    return false;
  }
}

function isDeepSeekV4Flash(value) {
  return String(value || "").split(":", 1)[0] === DEEPSEEK_V4_FLASH_MODEL;
}

function parseProviderJson(response) {
  try {
    return extractJson(response);
  } catch (cause) {
    const err = new Error("Hosted AI returned an invalid response. Please try again.");
    err.statusCode = 502;
    err.code = "provider_invalid_response";
    err.expose = true;
    err.cause = cause;
    throw err;
  }
}

function trimSlash(value) {
  return String(value || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  err.code = "invalid_request";
  return err;
}

module.exports.buildChatCompletionBody = buildChatCompletionBody;
module.exports.parseProviderJson = parseProviderJson;
