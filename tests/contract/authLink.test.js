const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildActivationRedirectUrl,
  buildInviteWrapperUrl,
  readInviteConfirmationUrl,
  validateInviteActionUrl,
} = require("../../authLink");

const APP_ORIGIN = "https://overrun.example";
const SUPABASE_URL = "https://project.supabase.co";

function actionUrl(overrides = {}) {
  const action = new URL(overrides.origin || `${SUPABASE_URL}/auth/v1/verify`);
  action.searchParams.set("token", overrides.token === undefined ? "one-time-token" : overrides.token);
  action.searchParams.set("type", overrides.type || "invite");
  action.searchParams.set(
    "redirect_to",
    overrides.redirect || buildActivationRedirectUrl(APP_ORIGIN)
  );
  return action.toString();
}

test("invite wrapper preserves the expected activation redirect and encoded action URL", () => {
  const action = actionUrl();
  const wrapper = buildInviteWrapperUrl(`${APP_ORIGIN}/`, action);

  assert.equal(wrapper.startsWith(`${APP_ORIGIN}/?invite=1#confirmation_url=`), true);
  assert.equal(readInviteConfirmationUrl(wrapper), action);
  assert.equal(
    validateInviteActionUrl(readInviteConfirmationUrl(wrapper), {
      supabaseUrl: SUPABASE_URL,
      appOrigin: APP_ORIGIN,
    }),
    true
  );
  assert.equal(buildActivationRedirectUrl(`${APP_ORIGIN}/ignored/path?old=1`), `${APP_ORIGIN}/?activation=1`);
});

test("invite validation rejects foreign origins, paths, types, missing tokens, and redirects", () => {
  const options = { supabaseUrl: SUPABASE_URL, appOrigin: APP_ORIGIN };
  const invalid = [
    actionUrl({ origin: "https://attacker.example/auth/v1/verify" }),
    actionUrl({ origin: "https://user:password@project.supabase.co/auth/v1/verify" }),
    actionUrl({ origin: `${SUPABASE_URL}/auth/v1/user` }),
    actionUrl({ type: "recovery" }),
    actionUrl({ token: "" }),
    actionUrl({ redirect: "https://attacker.example/?activation=1" }),
    actionUrl({ redirect: `${APP_ORIGIN}/?recovery=1` }),
    actionUrl({ redirect: `${APP_ORIGIN}/?activation=1&next=foreign` }),
    actionUrl({ redirect: `${APP_ORIGIN}/?activation=1#access_token=secret` }),
  ];

  for (const value of invalid) {
    assert.equal(validateInviteActionUrl(value, options), false, value);
  }
});

test("non-wrapper locations do not expose a confirmation URL", () => {
  assert.equal(readInviteConfirmationUrl(`${APP_ORIGIN}/#confirmation_url=secret`), "");
  assert.equal(readInviteConfirmationUrl(`${APP_ORIGIN}/?invite=1#unrelated=value`), "");
});
