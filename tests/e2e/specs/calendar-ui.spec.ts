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
