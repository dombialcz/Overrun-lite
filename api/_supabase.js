const { createClient } = require("@supabase/supabase-js");

function getSupabaseConfig() {
  return {
    url: String(process.env.SUPABASE_URL || "").trim(),
    publishableKey: String(process.env.SUPABASE_PUBLISHABLE_KEY || "").trim(),
    secretKey: String(process.env.SUPABASE_SECRET_KEY || "").trim(),
  };
}

function isAuthConfigured() {
  const config = getSupabaseConfig();
  return Boolean(config.url && config.publishableKey && config.secretKey);
}

function createAdminClient() {
  const config = getSupabaseConfig();
  if (!config.url || !config.secretKey) {
    const err = new Error("Authentication service is unavailable.");
    err.statusCode = 503;
    err.code = "auth_unavailable";
    throw err;
  }
  return createClient(config.url, config.secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

async function requireUser(req) {
  const header = String(req.headers.authorization || "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) throw apiError(401, "auth_required", "Sign in to use hosted AI.");

  const admin = createAdminClient();
  const { data, error } = await admin.auth.getUser(match[1]);
  if (error || !data || !data.user) {
    throw apiError(401, "auth_required", "Your session is invalid or expired.");
  }
  return { admin, user: data.user };
}

function apiError(statusCode, code, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

function sendError(res, err) {
  const statusCode = Number(err && err.statusCode) || 500;
  const code = err && err.code
    ? err.code
    : statusCode >= 500
      ? "server_error"
      : "request_failed";
  const message = statusCode >= 500 && !err.expose
    ? "The request could not be completed."
    : String((err && err.message) || "The request could not be completed.");
  res.status(statusCode).json({ error: message, code });
}

function setApiHeaders(req, res, methods) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Vary", "Origin");
  const configuredOrigin = String(process.env.APP_ORIGIN || "").replace(/\/+$/, "");
  const requestOrigin = String(req.headers.origin || "").replace(/\/+$/, "");
  if (configuredOrigin && requestOrigin === configuredOrigin) {
    res.setHeader("Access-Control-Allow-Origin", configuredOrigin);
  }
  res.setHeader("Access-Control-Allow-Methods", methods.join(", "));
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function handleOptions(req, res, methods) {
  setApiHeaders(req, res, methods);
  if (req.method !== "OPTIONS") return false;
  res.status(204).end();
  return true;
}

module.exports = {
  apiError,
  createAdminClient,
  getSupabaseConfig,
  handleOptions,
  isAuthConfigured,
  requireUser,
  sendError,
  setApiHeaders,
};
