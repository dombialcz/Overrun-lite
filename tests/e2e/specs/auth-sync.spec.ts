import type { Page, Route } from "@playwright/test";
import { expect, test } from "../fixtures/ui.fixture";

type PlannerState = { tasks: Array<Record<string, unknown>>; backlog: Array<Record<string, unknown>> };
type MockCloudOptions = {
  cloudState?: PlannerState | null;
  revision?: number;
  used?: number;
  limit?: number;
  conflictOnce?: boolean;
  authLinkFailures?: Array<{ status: number; body: Record<string, unknown> }>;
};

const EMPTY_STATE: PlannerState = { tasks: [], backlog: [] };
const TEST_USER = {
  id: "11111111-1111-4111-8111-111111111111",
  aud: "authenticated",
  role: "authenticated",
  email: "tester@example.com",
  email_confirmed_at: "2026-07-23T10:00:00.000Z",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  identities: [],
  created_at: "2026-07-23T10:00:00.000Z",
  updated_at: "2026-07-23T10:00:00.000Z",
};

test.beforeEach(async ({ ui }) => {
  await ui.page.addInitScript(() => {
    (window as Window & { __OVERRUN_FORCE_CONFIG__?: boolean }).__OVERRUN_FORCE_CONFIG__ = true;
  });
});

test("invite-only sign in persists account data and sign out restores the guest workspace", async ({ ui }) => {
  const mock = await mockCloud(ui.page);
  await ui.goto();
  await ui.page.evaluate(() => localStorage.setItem("overrun_lite_theme", "dark"));
  await ui.page.reload();
  await expect(ui.page.locator("html")).toHaveAttribute("data-theme", "dark");

  await expect(ui.page.getByTestId("open-account")).toBeEnabled();
  await ui.page.getByTestId("open-account").click();
  await ui.page.getByTestId("account-email").fill(TEST_USER.email);
  await ui.page.getByTestId("account-password").fill("SecurePlanner1");
  await ui.page.getByTestId("sign-in").click();

  await expect(ui.page.getByTestId("open-account")).toHaveText(TEST_USER.email);
  await expect(ui.page.getByTestId("sync-status")).toHaveText("Synced");
  expect(await ui.theme.saved()).toBe("dark");
  await expect(ui.page.getByTestId("ai-usage")).toContainText("0 / 10");

  await ui.calendar.addTask();
  await expect.poll(() => mock.savedStates.length).toBe(1);
  expect(mock.savedStates[0].tasks).toHaveLength(1);
  await expect(ui.page.getByTestId("sync-status")).toHaveText("Synced");

  await ui.page.getByTestId("open-account").click();
  await ui.page.getByTestId("sign-out").click();
  await expect(ui.page.getByTestId("sync-status")).toHaveText("Local only");
  await expect(ui.calendar.blocks()).toHaveCount(0);
  await expect(ui.page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await ui.theme.saved()).toBe("dark");
  const accountCache = await ui.page.evaluate(
    (userId) => localStorage.getItem(`overrun_lite_state:${userId}`),
    TEST_USER.id
  );
  expect(accountCache).toBeNull();
});

test("first login chooses cloud data without silently merging local data", async ({ ui }) => {
  await mockCloud(ui.page, {
    cloudState: {
      tasks: [task("cloud-task", "Cloud task")],
      backlog: [],
    },
    revision: 4,
  });
  await ui.goto();
  await ui.calendar.addTask();

  await ui.page.getByTestId("open-account").click();
  await ui.page.getByTestId("account-email").fill(TEST_USER.email);
  await ui.page.getByTestId("account-password").fill("SecurePlanner1");
  await ui.page.getByTestId("sign-in").click();

  await expect(ui.page.getByTestId("initial-sync-drawer")).toHaveAttribute("aria-hidden", "false");
  await ui.page.getByTestId("initial-sync-cloud").click();
  await expect(ui.calendar.blocks()).toHaveCount(1);
  await expect(ui.calendar.blocks().first()).toContainText("Cloud task");
  expect(await ui.page.evaluate(() => localStorage.getItem("overrun_lite_state"))).toBeNull();
});

test("same-user auth confirmations do not repeat first sync", async ({ ui }) => {
  const mock = await mockCloud(ui.page, {
    cloudState: {
      tasks: [task("cloud-task", "Cloud task")],
      backlog: [],
    },
    revision: 4,
  });
  await ui.goto();
  await ui.calendar.addTask("Local task");
  await signIn(ui.page);

  await expect(ui.page.getByTestId("initial-sync-drawer")).toHaveAttribute("aria-hidden", "false");
  await ui.page.getByTestId("initial-sync-cloud").click();
  await expect(ui.page.getByTestId("sync-status")).toHaveText("Synced");
  expect(mock.plannerReads).toBe(1);

  await ui.page.evaluate(() => {
    document.dispatchEvent(new Event("visibilitychange"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await ui.page.waitForTimeout(250);

  await expect(ui.page.getByTestId("initial-sync-drawer")).toHaveAttribute("aria-hidden", "true");
  await expect(ui.calendar.blocks()).toHaveCount(1);
  await expect(ui.calendar.blocks().first()).toContainText("Cloud task");
  expect(mock.plannerReads).toBe(1);
});

test("a returning account cache skips guest reconciliation on reload", async ({ ui }) => {
  const mock = await mockCloud(ui.page, {
    cloudState: {
      tasks: [task("cloud-task", "Cloud task")],
      backlog: [],
    },
    revision: 4,
  });
  await ui.goto();
  await signIn(ui.page);
  await expect(ui.page.getByTestId("sync-status")).toHaveText("Synced");

  await ui.page.evaluate((guestState) => {
    localStorage.setItem("overrun_lite_state", JSON.stringify(guestState));
  }, {
    tasks: [task("stale-guest-task", "Stale guest task")],
    backlog: [],
  });
  await ui.page.reload();

  await expect(ui.page.getByTestId("sync-status")).toHaveText("Synced");
  await expect(ui.page.getByTestId("initial-sync-drawer")).toHaveAttribute("aria-hidden", "true");
  await expect(ui.calendar.blocks()).toHaveCount(1);
  await expect(ui.calendar.blocks().first()).toContainText("Cloud task");
  expect(mock.plannerReads).toBe(2);
});

test("signing out during first sync cancels the stale account connection", async ({ ui }) => {
  await mockCloud(ui.page, {
    cloudState: {
      tasks: [task("cloud-task", "Cloud task")],
      backlog: [],
    },
  });
  await ui.goto();
  await ui.calendar.addTask("Guest task");
  await signIn(ui.page);
  await expect(ui.page.getByTestId("initial-sync-drawer")).toHaveAttribute("aria-hidden", "false");

  await ui.page.evaluate(async () => {
    await (window as Window & {
      OverrunCloud: { signOut(): Promise<void> };
    }).OverrunCloud.signOut();
  });

  await expect(ui.page.getByTestId("initial-sync-drawer")).toHaveAttribute("aria-hidden", "true");
  await expect(ui.page.getByTestId("open-account")).toHaveText("Sign in");
  await expect(ui.calendar.blocks()).toHaveCount(1);
  await expect(ui.calendar.blocks().first()).toContainText("Guest task");
});

test("a completed sign-out allows the next login to reconcile new guest data", async ({ ui }) => {
  await mockCloud(ui.page, {
    cloudState: {
      tasks: [task("cloud-task", "Cloud task")],
      backlog: [],
    },
  });
  await ui.goto();
  await signIn(ui.page);
  await expect(ui.page.getByTestId("sync-status")).toHaveText("Synced");

  await ui.page.getByTestId("open-account").click();
  await ui.page.getByTestId("sign-out").click();
  await expect(ui.page.getByTestId("sync-status")).toHaveText("Local only");
  await ui.calendar.addTask("New guest task");
  await signIn(ui.page);

  await expect(ui.page.getByTestId("initial-sync-drawer")).toHaveAttribute("aria-hidden", "false");
  await expect(ui.page.getByTestId("initial-sync-cloud")).toHaveText("Use account data");
});

test("revision conflicts pause saves and allow an explicit local overwrite", async ({ ui }) => {
  const mock = await mockCloud(ui.page, {
    cloudState: {
      tasks: [task("base-task", "Account task")],
      backlog: [],
    },
    revision: 2,
    conflictOnce: true,
  });
  await ui.goto();
  await signIn(ui.page);
  await expect(ui.page.getByTestId("sync-status")).toHaveText("Synced");

  await ui.calendar.addTask();
  await expect(ui.page.getByTestId("sync-conflict-drawer")).toHaveAttribute("aria-hidden", "false");
  await expect(ui.page.getByTestId("sync-status")).toHaveText("Conflict");
  await ui.page.getByTestId("conflict-use-local").click();
  await expect(ui.page.getByTestId("sync-conflict-drawer")).toHaveAttribute("aria-hidden", "true");
  await expect(ui.page.getByTestId("sync-status")).toHaveText("Synced");
  expect(mock.savedStates.at(-1)?.tasks).toHaveLength(2);
});

test("exhausted hosted allowance disables AI but local provider remains available", async ({ ui }) => {
  await mockCloud(ui.page, { used: 10, limit: 10 });
  await ui.goto();
  await signIn(ui.page);

  await expect(ui.page.getByTestId("ai-usage")).toContainText("10 / 10");
  await expect(ui.page.getByTestId("analyze-dump")).toBeDisabled();
  await expect(ui.page.getByTestId("context-organize")).toBeDisabled();

  await ui.settings.useLocalProvider({
    baseUrl: "http://local-ai.test/v1",
    model: "test-model",
  });
  await expect(ui.page.getByTestId("analyze-dump")).toBeEnabled();
  await expect(ui.page.getByTestId("context-organize")).toBeEnabled();
  await expect(ui.page.getByTestId("ai-usage")).toContainText("Using custom settings");
});

test("activation requires a strong matching password and clears the one-time URL", async ({ ui }) => {
  await mockCloud(ui.page);
  await ui.page.goto(
    `/?activation=1#access_token=${inviteAccessToken()}&refresh_token=test-refresh-token&type=invite`
  );

  await expect(ui.page.getByTestId("activation-form")).toBeVisible();
  await expect(ui.page).toHaveURL(/\/\?activation=1$/);
  await ui.page.getByTestId("activation-password").fill("alllowercase12");
  await ui.page.getByTestId("activation-password-confirm").fill("alllowercase12");
  await ui.page.getByTestId("activate-account").click();
  await expect(ui.page.getByTestId("account-status")).toContainText("at least 12 characters");

  await ui.page.getByTestId("activation-password").fill("SecurePlanner1");
  await ui.page.getByTestId("activation-password-confirm").fill("SecurePlanner1");
  await ui.page.getByTestId("activate-account").click();
  await expect(ui.page.getByTestId("account-drawer")).toHaveAttribute("aria-hidden", "true");
  expect(new URL(ui.page.url()).searchParams.has("activation")).toBe(false);
});

test("invite wrappers wait for an explicit confirmation before verification", async ({ ui }) => {
  const mock = await mockCloud(ui.page);
  const action = inviteActionUrl();
  const wrapper = `/?invite=1#confirmation_url=${encodeURIComponent(action)}`;

  await ui.page.goto(wrapper);

  await expect(ui.page.getByTestId("invite-confirmation")).toBeVisible();
  await expect(ui.page).toHaveURL(/\/\?invite=1$/);
  expect(mock.verifyRequests).toBe(0);

  await ui.page.getByTestId("accept-invite").click();

  await expect(ui.page.getByTestId("activation-form")).toBeVisible();
  await expect(ui.page).toHaveURL(/\/\?activation=1$/);
  expect(mock.verifyRequests).toBe(1);
});

test("transient activation failures preserve credentials and retry successfully", async ({ ui }) => {
  const mock = await mockCloud(ui.page, {
    authLinkFailures: [{ status: 503, body: { message: "temporary outage" } }],
  });
  await ui.page.goto(
    `/?activation=1#access_token=${inviteAccessToken()}&refresh_token=test-refresh-token&type=invite`
  );

  await expect(ui.page.getByTestId("retry-auth-link")).toBeVisible();
  expect(ui.page.url()).toContain("access_token=");
  expect(mock.authLinkRequests).toBe(1);

  await ui.page.getByTestId("retry-auth-link").click();

  await expect(ui.page.getByTestId("activation-form")).toBeVisible();
  await expect(ui.page).toHaveURL(/\/\?activation=1$/);
  expect(mock.authLinkRequests).toBe(2);
});

test("terminal activation failures clear credentials and request a fresh invitation", async ({ ui }) => {
  await mockCloud(ui.page, {
    authLinkFailures: [{
      status: 403,
      body: { code: "refresh_token_not_found", message: "Refresh Token Already Used" },
    }],
  });
  await ui.page.goto(
    `/?activation=1#access_token=${inviteAccessToken()}&refresh_token=used-token&type=invite`
  );

  await expect(ui.page.getByTestId("auth-link-failure")).toBeVisible();
  await expect(ui.page.getByTestId("sign-in-form")).toBeHidden();
  await expect(ui.page.getByTestId("retry-auth-link")).toBeHidden();
  await expect(ui.page.getByTestId("account-status")).toHaveText(
    "This invitation is expired or has already been used. Ask the person who invited you for a new link."
  );
  expect(ui.page.url()).not.toContain("access_token=");
});

test("activation mode without a callback shows a dedicated failure", async ({ ui }) => {
  await mockCloud(ui.page);
  await ui.page.goto("/?activation=1");

  await expect(ui.page.getByTestId("auth-link-failure")).toBeVisible();
  await expect(ui.page.getByTestId("sign-in-form")).toBeHidden();
  await expect(ui.page.getByTestId("account-status")).toContainText("Ask the person who invited you");
});

test("malformed invite wrappers neither navigate nor expose their nested URL", async ({ ui }) => {
  const mock = await mockCloud(ui.page);
  const foreign = "https://attacker.example/auth/v1/verify?token=secret&type=invite";
  await ui.page.goto(`/?invite=1#confirmation_url=${encodeURIComponent(foreign)}`);

  await expect(ui.page).toHaveURL(/\/\?invite=1$/);
  await expect(ui.page.getByTestId("invite-confirmation")).toBeHidden();
  await expect(ui.page.getByTestId("auth-link-failure")).toBeVisible();
  await expect(ui.page.getByTestId("sign-in-form")).toBeHidden();
  await expect(ui.page.locator("body")).not.toContainText(foreign);
  expect(mock.verifyRequests).toBe(0);
});

test("forgot password requests a recovery email without revealing account existence", async ({ ui }) => {
  const mock = await mockCloud(ui.page);
  await ui.goto();

  await ui.page.getByTestId("open-account").click();
  await ui.page.getByTestId("account-email").fill(TEST_USER.email);
  await ui.page.getByTestId("forgot-password").click();

  await expect(ui.page.getByTestId("account-status")).toHaveText(
    "If that account exists, a password reset email is on its way."
  );
  expect(mock.resetRequests).toHaveLength(1);
  expect(mock.resetRequests[0].email).toBe(TEST_USER.email);
  expect(mock.resetRequests[0].redirectTo).toBe("http://127.0.0.1:4173/?recovery=1");
});

test("recovery links open password reset and preserve the existing account", async ({ ui }) => {
  const mock = await mockCloud(ui.page, {
    cloudState: { tasks: [task("recovered-task", "Recovered account task")], backlog: [] },
  });
  await ui.page.goto(
    `/#access_token=${inviteAccessToken()}&refresh_token=test-refresh-token&type=recovery`
  );

  await expect(ui.page.getByTestId("recovery-form")).toBeVisible();
  await expect(ui.page.getByTestId("activation-form")).toBeHidden();
  await expect(ui.page).toHaveURL(/\/?recovery=1$/);
  await ui.page.getByTestId("recovery-password").fill("SecurePlanner2");
  await ui.page.getByTestId("recovery-password-confirm").fill("DifferentPlanner2");
  await ui.page.getByTestId("reset-password").click();
  await expect(ui.page.getByTestId("account-status")).toHaveText("Passwords do not match.");

  await ui.page.getByTestId("recovery-password-confirm").fill("SecurePlanner2");
  await ui.page.getByTestId("reset-password").click();

  await expect(ui.page.getByTestId("account-drawer")).toHaveAttribute("aria-hidden", "true");
  await expect(ui.page.getByTestId("sync-status")).toHaveText("Synced");
  await expect(ui.calendar.blocks()).toHaveCount(1);
  expect(mock.passwordUpdates).toEqual(["SecurePlanner2"]);
  expect(new URL(ui.page.url()).searchParams.has("recovery")).toBe(false);
});

test("recovery callbacks can retry transient failures", async ({ ui }) => {
  const mock = await mockCloud(ui.page, {
    authLinkFailures: [{ status: 503, body: { message: "temporary outage" } }],
  });
  await ui.page.goto(
    `/?recovery=1#access_token=${inviteAccessToken()}&refresh_token=test-refresh-token&type=recovery`
  );

  await expect(ui.page.getByTestId("retry-auth-link")).toBeVisible();
  expect(ui.page.url()).toContain("refresh_token=");
  await ui.page.getByTestId("retry-auth-link").click();
  await expect(ui.page.getByTestId("recovery-form")).toBeVisible();
  await expect(ui.page).toHaveURL(/\/\?recovery=1$/);
  expect(mock.authLinkRequests).toBe(2);
});

test("expired recovery links show a recovery-specific error", async ({ ui }) => {
  await mockCloud(ui.page);
  await ui.page.goto("/?recovery=1#error=access_denied&error_description=Recovery+link+has+expired");
  await expect(ui.page.getByTestId("account-drawer")).toHaveAttribute("aria-hidden", "false");
  await expect(ui.page.getByTestId("account-status")).toHaveText(
    "This password reset link is expired or has already been used. Request a new password reset email."
  );
  await expect(ui.page.getByTestId("sign-in-form")).toBeHidden();
});

test("expired or used activation links show a stable error", async ({ ui }) => {
  await mockCloud(ui.page);
  await ui.page.goto("/?activation=1#error=access_denied&error_description=Invite+link+has+expired");
  await expect(ui.page.getByTestId("account-drawer")).toHaveAttribute("aria-hidden", "false");
  await expect(ui.page).toHaveURL(/\/\?activation=1$/);
  await expect(ui.page.getByTestId("account-status")).toHaveText(
    "This invitation is expired or has already been used. Ask the person who invited you for a new link."
  );
  await expect(ui.page.getByTestId("sign-in-form")).toBeHidden();
});

async function signIn(page: Page): Promise<void> {
  await page.getByTestId("open-account").click();
  await page.getByTestId("account-email").fill(TEST_USER.email);
  await page.getByTestId("account-password").fill("SecurePlanner1");
  await page.getByTestId("sign-in").click();
}

async function mockCloud(page: Page, options: MockCloudOptions = {}) {
  let cloudState = options.cloudState === undefined ? null : options.cloudState;
  let revision = options.revision || 0;
  let conflictPending = Boolean(options.conflictOnce);
  const authLinkFailures = [...(options.authLinkFailures || [])];
  let plannerReads = 0;
  let authLinkRequests = 0;
  let verifyRequests = 0;
  const savedStates: PlannerState[] = [];
  const resetRequests: Array<{ email: string; redirectTo: string }> = [];
  const passwordUpdates: string[] = [];

  await page.route("**/api/config", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      auth: {
        enabled: true,
        url: "https://test.supabase.co",
        publishableKey: "sb_publishable_test",
      },
      ai: { hostedAvailable: true },
    }),
  }));
  await page.route("**/api/ai-usage", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      day: "2026-07-23",
      timezone: "Europe/Warsaw",
      used: options.used || 0,
      limit: options.limit === undefined ? 10 : options.limit,
      remaining: Math.max(0, (options.limit === undefined ? 10 : options.limit) - (options.used || 0)),
      resetAt: "2026-07-23T22:00:00.000Z",
    }),
  }));
  await page.route("https://test.supabase.co/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/auth/v1/recover") {
      const body = route.request().postDataJSON();
      resetRequests.push({
        email: String(body.email || ""),
        redirectTo: url.searchParams.get("redirect_to") || String(body.redirect_to || ""),
      });
      await json(route, {});
      return;
    }
    if (url.pathname === "/auth/v1/token") {
      await json(route, {
        access_token: "test-access-token",
        refresh_token: "test-refresh-token",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: "bearer",
        user: TEST_USER,
      });
      return;
    }
    if (url.pathname === "/auth/v1/verify") {
      verifyRequests += 1;
      const redirect = url.searchParams.get("redirect_to") || "http://127.0.0.1:4173/?activation=1";
      await route.fulfill({
        status: 302,
        headers: {
          Location: `${redirect}#access_token=${inviteAccessToken()}&refresh_token=test-refresh-token&type=invite`,
        },
      });
      return;
    }
    if (url.pathname === "/auth/v1/logout") {
      await json(route, {});
      return;
    }
    if (url.pathname === "/auth/v1/user") {
      if (route.request().method() === "PUT") {
        const body = route.request().postDataJSON();
        passwordUpdates.push(String(body.password || ""));
      } else {
        authLinkRequests += 1;
        const failure = authLinkFailures.shift();
        if (failure) {
          await json(route, failure.body, failure.status);
          return;
        }
      }
      await json(route, TEST_USER);
      return;
    }
    if (url.pathname === "/rest/v1/planner_states") {
      plannerReads += 1;
      await json(route, cloudState ? [{ state: cloudState, revision, updated_at: new Date().toISOString() }] : []);
      return;
    }
    if (url.pathname === "/rest/v1/rpc/save_planner_state") {
      const body = route.request().postDataJSON();
      const nextState = body.p_state as PlannerState;
      if (conflictPending) {
        conflictPending = false;
        revision += 1;
        await json(route, [{
          saved: false,
          revision,
          state: cloudState || EMPTY_STATE,
          updated_at: new Date().toISOString(),
        }]);
        return;
      }
      cloudState = nextState;
      revision = Math.max(1, revision + 1);
      savedStates.push(nextState);
      await json(route, [{
        saved: true,
        revision,
        state: nextState,
        updated_at: new Date().toISOString(),
      }]);
      return;
    }
    await json(route, {});
  });

  return {
    get plannerReads() {
      return plannerReads;
    },
    get authLinkRequests() {
      return authLinkRequests;
    },
    get verifyRequests() {
      return verifyRequests;
    },
    passwordUpdates,
    resetRequests,
    savedStates,
  };
}

async function json(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({
    status,
    contentType: "application/json",
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Expose-Headers": "Content-Range",
      "Content-Range": "0-0/*",
    },
    body: JSON.stringify(body),
  });
}

function task(id: string, name: string): Record<string, unknown> {
  return {
    id,
    name,
    title: name,
    minutes: 60,
    type: "task",
    startMinutes: 0,
    hasExplicitStart: true,
    elapsedMinutes: 0,
    completed: false,
    priorityScore: 50,
    priorityReason: "",
    urgency: 3,
    impact: 3,
    subtasks: [],
  };
}

function inviteAccessToken(): string {
  const encode = (value: Record<string, unknown>) => Buffer
    .from(JSON.stringify(value))
    .toString("base64url");
  return [
    encode({ alg: "ES256", typ: "JWT" }),
    encode({
      aud: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 3600,
      sub: TEST_USER.id,
    }),
    "test-signature",
  ].join(".");
}

function inviteActionUrl(): string {
  const action = new URL("https://test.supabase.co/auth/v1/verify");
  action.searchParams.set("token", "invite-token");
  action.searchParams.set("type", "invite");
  action.searchParams.set("redirect_to", "http://127.0.0.1:4173/?activation=1");
  return action.toString();
}
