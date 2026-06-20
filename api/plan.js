const {
  buildPlannerMessages,
  extractJson,
  normalizePlannerResponse,
  plannerResponseSchema,
} = require("../aiContract");

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_BASE_URL = "https://api.openai.com/v1";

module.exports = async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Only POST is supported." });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "OPENAI_API_KEY is not configured." });
    return;
  }

  try {
    const payload = normalizeRequestBody(req.body);
    const result = await requestPlanner(payload, {
      apiKey,
      model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
      baseUrl: process.env.OPENAI_BASE_URL || DEFAULT_BASE_URL,
    });
    res.status(200).json(result);
  } catch (err) {
    res.status(err.statusCode || 500).json({
      error: err.message || "Planner request failed.",
    });
  }
};

function normalizeRequestBody(body) {
  const payload = typeof body === "string" ? JSON.parse(body) : body || {};
  if (payload.mode !== "brain_dump") {
    throw badRequest("Unsupported planner mode.");
  }
  if (!String(payload.input || "").trim()) {
    throw badRequest("Input is required.");
  }
  return {
    mode: "brain_dump",
    input: String(payload.input),
    answers: payload.answers && typeof payload.answers === "object" ? payload.answers : {},
    currentTasks: Array.isArray(payload.currentTasks) ? payload.currentTasks : [],
    currentBacklog: Array.isArray(payload.currentBacklog) ? payload.currentBacklog : [],
  };
}

async function requestPlanner(payload, config) {
  const messages = buildPlannerMessages(payload);
  const response = await postChatCompletion(config, messages, true).catch(async (err) => {
    if (!err.canRetryWithoutSchema) throw err;
    return postChatCompletion(config, messages, false);
  });
  return normalizePlannerResponse(extractJson(response));
}

async function postChatCompletion(config, messages, useSchema) {
  const body = {
    model: config.model,
    messages,
    temperature: 0.2,
  };

  if (useSchema) {
    body.response_format = {
      type: "json_schema",
      json_schema: {
        name: "overrun_planner_response",
        strict: true,
        schema: plannerResponseSchema,
      },
    };
  } else {
    body.response_format = { type: "json_object" };
  }

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
    const message = json.error && json.error.message ? json.error.message : "AI provider request failed.";
    const err = new Error(message);
    err.statusCode = response.status;
    err.canRetryWithoutSchema = useSchema && /response_format|json_schema|schema/i.test(message);
    throw err;
  }

  const content = json.choices && json.choices[0] && json.choices[0].message
    ? json.choices[0].message.content
    : "";
  return content;
}

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function trimSlash(value) {
  return String(value || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}
