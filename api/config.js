const {
  getSupabaseConfig,
  handleOptions,
  isAuthConfigured,
  setApiHeaders,
} = require("./_supabase");

module.exports = async function handler(req, res) {
  if (handleOptions(req, res, ["GET", "OPTIONS"])) return;
  setApiHeaders(req, res, ["GET", "OPTIONS"]);

  if (req.method !== "GET") {
    res.status(405).json({ error: "Only GET is supported.", code: "method_not_allowed" });
    return;
  }

  const config = getSupabaseConfig();
  const authEnabled = isAuthConfigured();
  res.status(200).json({
    auth: authEnabled
      ? {
          enabled: true,
          url: config.url,
          publishableKey: config.publishableKey,
        }
      : { enabled: false },
    ai: {
      hostedAvailable: authEnabled && Boolean(process.env.OPENAI_API_KEY),
    },
  });
};
