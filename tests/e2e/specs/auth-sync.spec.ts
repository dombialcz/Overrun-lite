import type { Page, Route } from "@playwright/test";
import { expect, test } from "../fixtures/ui.fixture";

type PlannerState = { tasks: Array<Record<string, unknown>>; backlog: Array<Record<string, unknown>> };
type MockCloudOptions = {
  cloudState?: PlannerState | null;
  revision?: number;
  used?: number;
  limit?: number;
  conflictOnce?: boolean;
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

test("expired recovery links show a recovery-specific error", async ({ ui }) => {
  await mockCloud(ui.page);
  await ui.page.goto("/?recovery=1#error=access_denied&error_description=Recovery+link+has+expired");
  await expect(ui.page.getByTestId("account-drawer")).toHaveAttribute("aria-hidden", "false");
  await expect(ui.page.getByTestId("account-status")).toHaveText(
    "This password reset link is expired or has already been used."
  );
});

test("expired or used activation links show a stable error", async ({ ui }) => {
  await mockCloud(ui.page);
  await ui.page.goto("/?activation=1#error=access_denied&error_description=Invite+link+has+expired");
  await expect(ui.page.getByTestId("account-drawer")).toHaveAttribute("aria-hidden", "false");
  await expect(ui.page).toHaveURL(/\/\?activation=1$/);
  await expect(ui.page.getByTestId("account-status")).toHaveText(
    "This activation link is expired or has already been used."
  );
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
    if (url.pathname === "/auth/v1/logout") {
      await json(route, {});
      return;
    }
    if (url.pathname === "/auth/v1/user") {
      if (route.request().method() === "PUT") {
        const body = route.request().postDataJSON();
        passwordUpdates.push(String(body.password || ""));
      }
      await json(route, TEST_USER);
      return;
    }
    if (url.pathname === "/rest/v1/planner_states") {
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

  return { passwordUpdates, resetRequests, savedStates };
}

async function json(route: Route, body: unknown): Promise<void> {
  await route.fulfill({
    status: 200,
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
