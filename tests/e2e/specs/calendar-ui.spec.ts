import { expect, test } from "../fixtures/ui.fixture";

test.beforeEach(async ({ ui }) => {
  await ui.goto();
  await ui.resetState();
});

test("app loads without console errors", async ({ ui }) => {
  await expect(ui.calendar.root).toBeVisible();
  await expect(ui.inbox.root).toBeVisible();
  await expect(ui.backlog.root).toBeVisible();
  expect(ui.consoleErrors).toEqual([]);
});

test("calendar task blocks stay compact and open task details", async ({ ui }) => {
  await ui.calendar.addTask();
  await expect(ui.calendar.blocks()).toHaveCount(1);

  const metrics = await ui.calendar.blockMetrics(0);
  expect(metrics.height).toBeGreaterThanOrEqual(56);
  expect(metrics.gripHeight).toBe(18);
  expect(metrics.overflow).toBe(false);

  await ui.calendar.openTask(0);
  await expect(ui.taskDetails.drawer).toHaveAttribute("aria-hidden", "false");
  expect(ui.consoleErrors).toEqual([]);
});

test("short task keeps a readable minimum height", async ({ ui }) => {
  await ui.calendar.addTask();
  await ui.calendar.openTask(0);
  await ui.taskDetails.setDuration(10);

  const metrics = await ui.calendar.blockMetrics(0);
  expect(metrics.height).toBe(56);
  expect(metrics.gripHeight).toBe(18);
  expect(metrics.overflow).toBe(false);
  expect(metrics.text).toContain("0h 10m");
});

test("resize grip changes task block height", async ({ ui }) => {
  await ui.calendar.addTask();
  await ui.calendar.openTask(0);
  await ui.taskDetails.setDuration(10);
  await ui.taskDetails.close();

  const before = await ui.calendar.blockMetrics(0);
  await ui.calendar.resizeBlock(0, 80);
  const after = await ui.calendar.blockMetrics(0);

  expect(before.height).toBe(56);
  expect(after.height).toBeGreaterThan(before.height);
  expect(after.gripHeight).toBe(18);
  expect(after.overflow).toBe(false);
});

test("task blocks can be moved to a specific hour", async ({ ui }) => {
  await ui.calendar.addTask();

  const before = await ui.calendar.blockMetrics(0);
  await ui.calendar.moveBlock(0, 100);
  const afterDrag = await ui.calendar.blockMetrics(0);
  expect(afterDrag.top).toBeGreaterThan(before.top);

  await ui.calendar.openTask(0);
  await ui.taskDetails.setStartTime("10:00");
  const afterDetails = await ui.calendar.blockMetrics(0);
  expect(afterDetails.text).toContain("10:00");
});

test("overlapping tasks are allowed and flagged", async ({ ui }) => {
  await ui.calendar.addTask();
  await ui.calendar.addTask();

  await ui.calendar.openTask(0);
  await ui.taskDetails.setStartTime("09:00");
  await ui.taskDetails.close();

  await ui.calendar.openTask(1);
  await ui.taskDetails.setStartTime("09:00");

  const first = await ui.calendar.blockMetrics(0);
  const second = await ui.calendar.blockMetrics(1);

  expect(first.className).toContain("overlap-conflict");
  expect(second.className).toContain("overlap-conflict");
  expect(first.width).toBeLessThan(700);
  expect(second.left).toBeGreaterThan(first.left);
  expect(first.overflow).toBe(false);
  expect(second.overflow).toBe(false);
});

test("split creates grouped compact task blocks", async ({ ui }) => {
  await ui.calendar.addTask();
  await ui.calendar.openTask(0);
  await ui.taskDetails.splitInto(2);

  await expect(ui.calendar.blocks()).toHaveCount(2);
  const first = await ui.calendar.blockMetrics(0);
  const second = await ui.calendar.blockMetrics(1);

  expect(first.className).toContain("split-grouped");
  expect(second.className).toContain("split-grouped");
  expect(first.text).toContain("Part 1/2");
  expect(second.text).toContain("Part 2/2");
  expect(first.overflow).toBe(false);
  expect(second.overflow).toBe(false);
});

test("task state persists after reload", async ({ ui }) => {
  await ui.calendar.addTask();
  await ui.calendar.openTask(0);
  await ui.taskDetails.setDuration(10);

  await ui.page.reload();
  await expect(ui.calendar.blocks()).toHaveCount(1);

  const metrics = await ui.calendar.blockMetrics(0);
  expect(metrics.height).toBe(56);
  expect(metrics.text).toContain("0h 10m");
  expect(ui.consoleErrors).toEqual([]);
});

test("calendar block shows subtask completion progress", async ({ ui }) => {
  await ui.page.evaluate(() => {
    localStorage.setItem(
      "overrun_lite_state",
      JSON.stringify({
        tasks: [
          {
            id: "task-with-subtasks",
            name: "Repair water system",
            minutes: 60,
            type: "task",
            startMinutes: 0,
            hasExplicitStart: true,
            elapsedMinutes: 0,
            completed: false,
            priorityScore: 80,
            priorityReason: "House water system needs attention.",
            urgency: 4,
            impact: 4,
            subtasks: [
              { id: "subtask-1", title: "Inspect pump", minutes: 25, completed: true },
              { id: "subtask-2", title: "Check softener", minutes: 25, completed: false },
              { id: "subtask-3", title: "Call plumber", minutes: 25, completed: false },
            ],
          },
        ],
        backlog: [],
      })
    );
  });
  await ui.page.reload();

  let metrics = await ui.calendar.blockMetrics(0);
  expect(metrics.text).toContain("Sub 1/3");
  expect(metrics.overflow).toBe(false);

  await ui.calendar.openTask(0);
  await ui.page.getByTestId("detail-subtasks").locator("input").nth(1).check();

  metrics = await ui.calendar.blockMetrics(0);
  expect(metrics.text).toContain("Sub 2/3");
  expect(metrics.overflow).toBe(false);
});

test("Google Calendar import previews events, applies them, and skips duplicates", async ({ ui }) => {
  await ui.settings.setGoogleClientId("test-google-client-id");
  await ui.page.evaluate(() => {
    (window as any).google = {
      accounts: {
        oauth2: {
          initTokenClient: ({ callback }) => ({
            requestAccessToken: () => callback({ access_token: "test-token", scope: "https://www.googleapis.com/auth/calendar.readonly" }),
          }),
          hasGrantedAllScopes: () => true,
        },
      },
    };
  });
  await ui.page.route("https://www.googleapis.com/calendar/v3/calendars/primary/events**", async (route) => {
    const now = new Date();
    const start = new Date(now);
    start.setHours(9, 30, 0, 0);
    const end = new Date(start);
    end.setMinutes(start.getMinutes() + 45);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            id: "google-event-1",
            iCalUID: "google-event-1@example.com",
            summary: "Imported planning meeting",
            updated: "2026-06-21T08:00:00.000Z",
            start: { dateTime: start.toISOString() },
            end: { dateTime: end.toISOString() },
          },
        ],
      }),
    });
  });

  await ui.googleImport.import();
  await expect(ui.googleImport.drawer).toHaveAttribute("aria-hidden", "false");
  await expect(ui.googleImport.events()).toHaveCount(1);

  await ui.googleImport.apply();
  await expect(ui.calendar.blocks()).toHaveCount(1);
  let metrics = await ui.calendar.blockMetrics(0);
  expect(metrics.text).toContain("Imported planning meeting");
  expect(metrics.text).toContain("09:30");

  await ui.googleImport.import();
  await expect(ui.googleImport.events()).toHaveCount(0);
  await ui.googleImport.apply();
  await expect(ui.calendar.blocks()).toHaveCount(1);

  await ui.page.reload();
  await expect(ui.calendar.blocks()).toHaveCount(1);
  metrics = await ui.calendar.blockMetrics(0);
  expect(metrics.text).toContain("Imported planning meeting");
  expect(ui.consoleErrors).toEqual([]);
});
