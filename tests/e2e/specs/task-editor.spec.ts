import { expect, test } from "../fixtures/ui.fixture";

test.beforeEach(async ({ ui }) => {
  await ui.goto();
  await ui.resetState();
});

test("new task stays a focused draft until Create and can be discarded", async ({ ui }) => {
  await ui.calendar.openNewTask();

  await expect(ui.taskDetails.drawer).toHaveAttribute("aria-hidden", "false");
  await expect(ui.page.getByTestId("detail-task-title")).toBeFocused();
  await expect(ui.calendar.blocks()).toHaveCount(0);
  await expect(ui.page.getByTestId("detail-advanced")).not.toHaveAttribute("open", "");
  await expect(ui.page.getByTestId("detail-ai-section")).toBeHidden();

  await ui.page.getByTestId("detail-task-title").fill("Discard this draft");
  await ui.taskDetails.addSubtask("Temporary step", 15);
  await ui.taskDetails.cancel();

  await expect(ui.taskDetails.drawer).toHaveAttribute("aria-hidden", "true");
  await expect(ui.calendar.blocks()).toHaveCount(0);
  const discarded = await ui.page.evaluate(() =>
    JSON.parse(localStorage.getItem("overrun_lite_state") || '{"tasks":[],"backlog":[]}')
  );
  expect(discarded.tasks).toEqual([]);

  await ui.calendar.openNewTask();
  await ui.page.keyboard.press("Escape");
  await expect(ui.taskDetails.drawer).toHaveAttribute("aria-hidden", "true");
});

test("Create persists manual subtasks with stable planner data", async ({ ui }) => {
  await ui.calendar.openNewTask();
  await ui.page.getByTestId("detail-task-title").fill("Prepare workshop");
  await ui.taskDetails.addSubtask("Draft outline", 20);
  await ui.taskDetails.addSubtask("Prepare examples", 35);
  await ui.taskDetails.save();

  await expect(ui.calendar.blocks()).toHaveCount(1);
  await expect(ui.calendar.block(0)).toContainText("Prepare workshop");
  await expect(ui.calendar.block(0).getByTestId("subtask-chip")).toHaveText("Sub 0/2");

  const stored = await ui.page.evaluate(() =>
    JSON.parse(localStorage.getItem("overrun_lite_state") || "{}")
  );
  expect(stored.tasks[0].subtasks).toHaveLength(2);
  expect(stored.tasks[0].subtasks.map((subtask: { title: string; minutes: number }) => ({
    title: subtask.title,
    minutes: subtask.minutes,
  }))).toEqual([
    { title: "Draft outline", minutes: 20 },
    { title: "Prepare examples", minutes: 35 },
  ]);
  expect(stored.tasks[0].subtasks.every((subtask: { id: string; completed: boolean }) =>
    subtask.id.startsWith("subtask-") && subtask.completed === false
  )).toBe(true);
});

test("meetings use the same draft and manual subtask flow", async ({ ui }) => {
  await ui.page.getByTestId("add-meeting").click();
  await expect(ui.page.getByRole("heading", { name: "Create meeting" })).toBeVisible();
  await expect(ui.page.getByTestId("detail-task-title")).toBeFocused();
  await ui.page.getByTestId("detail-task-title").fill("Project kickoff");
  await ui.taskDetails.addSubtask("Share the agenda", 10);
  await ui.taskDetails.save();

  const stored = await ui.page.evaluate(() =>
    JSON.parse(localStorage.getItem("overrun_lite_state") || "{}")
  );
  expect(stored.tasks[0]).toMatchObject({
    name: "Project kickoff",
    type: "meeting",
  });
  expect(stored.tasks[0].subtasks[0].title).toBe("Share the agenda");
});

test("existing subtask edits are draft-only until Save", async ({ ui }) => {
  await ui.calendar.openNewTask();
  await ui.page.getByTestId("detail-task-title").fill("Ship release");
  await ui.taskDetails.addSubtask("Run tests", 20);
  await ui.taskDetails.addSubtask("Write notes", 15);
  await ui.taskDetails.save();

  await ui.calendar.openTask(0);
  const originalTitle = await ui.taskDetails.subtasks().first().evaluate((row) =>
    row.querySelector<HTMLInputElement>('[data-testid="detail-subtask-title"]')?.value
  );
  expect(originalTitle).toBe("Run tests");
  await ui.taskDetails.subtasks().first().getByTestId("detail-subtask-title").fill("Run full suite");
  await ui.taskDetails.subtasks().nth(1).getByTestId("detail-remove-subtask").click();
  await ui.taskDetails.addSubtask("Tag release", 10);
  await ui.taskDetails.cancel();

  let stored = await ui.page.evaluate(() =>
    JSON.parse(localStorage.getItem("overrun_lite_state") || "{}")
  );
  expect(stored.tasks[0].subtasks.map((subtask: { title: string }) => subtask.title)).toEqual([
    "Run tests",
    "Write notes",
  ]);

  await ui.calendar.openTask(0);
  const firstRow = ui.taskDetails.subtasks().first();
  await firstRow.getByTestId("detail-subtask-title").fill("Run full suite");
  await firstRow.getByTestId("detail-subtask-minutes").fill("30");
  await firstRow.getByTestId("detail-subtask-completed").check();
  await ui.taskDetails.subtasks().nth(1).getByTestId("detail-remove-subtask").click();
  await ui.taskDetails.addSubtask("Tag release", 10);
  await ui.taskDetails.save();

  stored = await ui.page.evaluate(() =>
    JSON.parse(localStorage.getItem("overrun_lite_state") || "{}")
  );
  expect(stored.tasks[0].subtasks.map((subtask: { title: string; minutes: number; completed: boolean }) => ({
    title: subtask.title,
    minutes: subtask.minutes,
    completed: subtask.completed,
  }))).toEqual([
    { title: "Run full suite", minutes: 30, completed: true },
    { title: "Tag release", minutes: 10, completed: false },
  ]);
  await expect(ui.calendar.block(0).getByTestId("subtask-chip")).toHaveText("Sub 1/2");
});

test("deleting an edited task requires confirmation", async ({ ui }) => {
  await ui.calendar.addTask("Keep unless confirmed");
  await ui.calendar.openTask(0);

  ui.page.once("dialog", async (dialog) => {
    expect(dialog.message()).toBe("Delete this task? This action cannot be undone.");
    await dialog.dismiss();
  });
  await ui.page.getByTestId("detail-delete").click();

  await expect(ui.taskDetails.drawer).toHaveAttribute("aria-hidden", "false");
  await expect(ui.calendar.blocks()).toHaveCount(1);
  let stored = await ui.page.evaluate(() =>
    JSON.parse(localStorage.getItem("overrun_lite_state") || "{}")
  );
  expect(stored.tasks).toHaveLength(1);

  ui.page.once("dialog", async (dialog) => {
    await dialog.accept();
  });
  await ui.page.getByTestId("detail-delete").click();

  await expect(ui.taskDetails.drawer).toHaveAttribute("aria-hidden", "true");
  await expect(ui.calendar.blocks()).toHaveCount(0);
  stored = await ui.page.evaluate(() =>
    JSON.parse(localStorage.getItem("overrun_lite_state") || "{}")
  );
  expect(stored.tasks).toEqual([]);
});

test("open backlog items share the editor without being picked up", async ({ ui }) => {
  await ui.calendar.addTask("Backlog candidate");
  await ui.calendar.openTask(0);
  await ui.page.getByTestId("detail-backlog").click();

  await expect(ui.backlog.items()).toHaveCount(1);
  await expect(ui.calendar.blocks()).toHaveCount(0);
  await ui.backlog.editItem(0);
  await expect(ui.page.getByTestId("detail-task-start")).toBeHidden();
  await expect(ui.page.getByTestId("detail-ai-section")).not.toHaveAttribute("open", "");
  await ui.page.getByTestId("detail-task-title").fill("Edited in backlog");
  await ui.taskDetails.addSubtask("Clarify scope", 20);
  await ui.taskDetails.save();

  let stored = await ui.page.evaluate(() =>
    JSON.parse(localStorage.getItem("overrun_lite_state") || "{}")
  );
  expect(stored.tasks).toEqual([]);
  expect(stored.backlog[0].name).toBe("Edited in backlog");
  expect(stored.backlog[0].subtasks[0].title).toBe("Clarify scope");

  await ui.backlog.items().getByRole("button", { name: "Pick up" }).click();
  await expect(ui.calendar.blocks()).toHaveCount(1);
  stored = await ui.page.evaluate(() =>
    JSON.parse(localStorage.getItem("overrun_lite_state") || "{}")
  );
  expect(stored.tasks[0].name).toBe("Edited in backlog");
  expect(stored.backlog).toEqual([]);
});

test("subtask editor controls stay inside a narrow drawer", async ({ ui }) => {
  await ui.page.setViewportSize({ width: 390, height: 844 });
  await ui.calendar.openNewTask();
  await ui.page.getByTestId("detail-task-title").fill("Mobile task");
  await ui.taskDetails.addSubtask("A step with a deliberately longer title", 25);

  const metrics = await ui.taskDetails.subtasks().first().evaluate((row) => {
    const rect = row.getBoundingClientRect();
    return {
      clientWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      left: rect.left,
      right: rect.right,
    };
  });
  expect(metrics.documentScrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
  expect(metrics.left).toBeGreaterThanOrEqual(0);
  expect(metrics.right).toBeLessThanOrEqual(metrics.clientWidth);
  await expect(ui.page.getByTestId("save-task-editor")).toBeVisible();
  expect(ui.consoleErrors).toEqual([]);
});
