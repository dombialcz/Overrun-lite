const {
  apiError,
  handleOptions,
  requireUser,
  sendError,
  setApiHeaders,
} = require("./_supabase");

module.exports = async function handler(req, res) {
  if (handleOptions(req, res, ["GET", "OPTIONS"])) return;
  setApiHeaders(req, res, ["GET", "OPTIONS"]);

  if (req.method !== "GET") {
    res.status(405).json({ error: "Only GET is supported.", code: "method_not_allowed" });
    return;
  }

  try {
    const { admin, user } = await requireUser(req);
    const { data, error } = await admin.rpc("get_ai_usage", { p_user_id: user.id });
    if (error) throw apiError(500, "usage_unavailable", "AI usage is unavailable.");
    res.status(200).json(normalizeUsage(data));
  } catch (err) {
    sendError(res, err);
  }
};

function normalizeUsage(data) {
  const row = Array.isArray(data) ? data[0] : data;
  const limit = Math.max(0, Number(row && row.daily_limit) || 0);
  const used = Math.max(0, Number(row && row.used_actions) || 0);
  return {
    day: String((row && row.usage_day) || ""),
    timezone: "Europe/Warsaw",
    used,
    limit,
    remaining: Math.max(0, limit - used),
    resetAt: row && row.reset_at ? new Date(row.reset_at).toISOString() : null,
  };
}

module.exports.normalizeUsage = normalizeUsage;
