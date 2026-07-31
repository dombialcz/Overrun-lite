#!/usr/bin/env node

const { createClient } = require("@supabase/supabase-js");
const {
  buildActivationRedirectUrl,
  buildInviteWrapperUrl,
} = require("../authLink");

async function main() {
  const [command, emailArg] = process.argv.slice(2);
  const email = String(emailArg || "").trim().toLowerCase();
  if (command !== "invite" || !email || !email.includes("@")) {
    throw new Error("Usage: npm run user:invite -- person@example.com");
  }

  const url = requireEnv("SUPABASE_URL");
  const secretKey = requireEnv("SUPABASE_SECRET_KEY");
  const appOrigin = requireEnv("APP_ORIGIN");
  const supabase = createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  const { data, error } = await supabase.auth.admin.generateLink({
    type: "invite",
    email,
    options: {
      redirectTo: buildActivationRedirectUrl(appOrigin),
    },
  });
  if (error) throw error;

  const link = data && data.properties && data.properties.action_link;
  if (!link) throw new Error("Supabase did not return an activation link.");
  process.stdout.write(`${buildInviteWrapperUrl(appOrigin, link)}\n`);
}

function requireEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`${err.message || err}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  buildActivationRedirectUrl,
  buildInviteWrapperUrl,
  main,
};
