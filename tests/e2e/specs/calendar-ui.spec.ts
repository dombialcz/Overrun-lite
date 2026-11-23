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

test("desktop keeps the backlog beside the day view", async ({ ui }) => {
  await ui.page.setViewportSize({ width: 1280, height: 900 });

  const positions = await Promise.all([
    ui.backlog.root.boundingBox(),
    ui.calendar.root.boundingBox(),
  ]);
  const [backlog, calendar] = positions;
  expect(backlog).not.toBeNull();
  expect(calendar).not.toBeNull();
  expect(Math.abs(backlog!.y - calendar!.y)).toBeLessThanOrEqual(1);
  expect(backlog!.x + backlog!.width).toBeLessThan(calendar!.x);

  await ui.calendar.showListView();
  const listPositions = await Promise.all([
    ui.backlog.root.boundingBox(),
    ui.calendar.root.boundingBox(),
  ]);
  expect(Math.abs(listPositions[0]!.y - listPositions[1]!.y)).toBeLessThanOrEqual(1);

  await ui.page.setViewportSize({ width: 800, height: 900 });
  const narrowPositions = await Promise.all([
    ui.backlog.root.boundingBox(),
    ui.calendar.root.boundingBox(),
  ]);
  expect(Math.abs(narrowPositions[0]!.x - narrowPositions[1]!.x)).toBeLessThanOrEqual(1);
  expect(narrowPositions[1]!.y + narrowPositions[1]!.height).toBeLessThan(narrowPositions[0]!.y);
  expect(ui.consoleErrors).toEqual([]);
});

test("planner keeps attention on the schedule without the status strip or ranking labels", async ({ ui }) => {
  await expect(ui.page.locator(".today-strip")).toHaveCount(0);
  await expect(ui.page.getByTestId("focus-summary")).toHaveCount(0);
  await ui.calendar.addTask("Prepare launch brief");
  await expect(ui.calendar.block(0)).toContainText("08:00");
  await expect(ui.calendar.block(0)).toContainText("1h 0m");
  await expect(ui.calendar.block(0)).not.toContainText(/priority|impact|urgency/i);
  expect(ui.consoleErrors).toEqual([]);
});

test("active tasks can be viewed as a chronological list and opened for editing", async ({ ui }) => {
  await ui.calendar.addTask("Later task");
  await ui.calendar.openTask(0);
  await ui.taskDetails.setStartTime("11:00");
  await ui.calendar.addTask("Earlier task");
  await ui.calendar.openTask(1);
  await ui.taskDetails.setStartTime("07:30");

  await ui.calendar.showListView();

  await expect(ui.calendar.listViewTab).toHaveAttribute("aria-selected", "true");
  await expect(ui.page.getByTestId("schedule-view")).toBeHidden();
  await expect(ui.page.getByTestId("active-list-view")).toBeVisible();
  await expect(ui.page.locator("#day-view-help")).toHaveText(
    "Tap a task to edit. Tasks are ordered by scheduled start."
  );
  await expect(ui.calendar.activeListItems()).toHaveCount(2);
  await expect(ui.calendar.activeListItems().nth(0)).toContainText("Earlier task");
  await expect(ui.calendar.activeListItems().nth(0)).toContainText("07:30");
  await expect(ui.calendar.activeListItems().nth(1)).toContainText("Later task");
  await expect(ui.calendar.activeListItems().nth(1)).toContainText("11:00");

  await ui.calendar.activeListItems().nth(0).click();
  await expect(ui.taskDetails.drawer).toHaveAttribute("aria-hidden", "false");
  await expect(ui.page.getByTestId("detail-task-title")).toHaveValue("Earlier task");
  await ui.page.getByTestId("close-task-details").click();
  await ui.calendar.showScheduleView();
  await expect(ui.page.locator("#day-view-help")).toContainText("drag vertically");
  expect(ui.consoleErrors).toEqual([]);
});

test("the selected active-task view persists across reloads", async ({ ui }) => {
  await ui.calendar.showListView();
  await ui.page.reload();

  await expect(ui.calendar.listViewTab).toHaveAttribute("aria-selected", "true");
  await expect(ui.page.getByTestId("active-list-view")).toBeVisible();
  await expect(ui.page.getByTestId("schedule-view")).toBeHidden();

  await ui.calendar.showScheduleView();
  await ui.page.reload();

  await expect(ui.calendar.scheduleViewTab).toHaveAttribute("aria-selected", "true");
  await expect(ui.page.getByTestId("schedule-view")).toBeVisible();
  await expect(ui.page.getByTestId("active-list-view")).toBeHidden();
  expect(ui.consoleErrors).toEqual([]);
});

test("active task list works on mobile and exposes an empty state", async ({ ui }) => {
  await ui.page.setViewportSize({ width: 390, height: 844 });
  await ui.page.emulateMedia({ reducedMotion: "reduce" });
  await ui.page.getByTestId("mobile-pagination").locator(".mobile-pagination-dot").nth(1).click();
  await ui.calendar.showListView();

  await expect(ui.calendar.activeList).toContainText("No active tasks yet.");
  await ui.calendar.addTask("Mobile list task");
  await ui.calendar.showListView();
  await expect(ui.calendar.activeListItems()).toHaveCount(1);
  await expect(ui.calendar.activeListItems().first()).toContainText("Mobile list task");

  const overflow = await ui.page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
  expect(ui.consoleErrors).toEqual([]);
});

test("calendar spans 04:00 through 24:00 without shifting existing task times", async ({ ui }) => {
  const labels = ui.calendar.root.locator(".time-labels span");
  await expect(labels).toHaveCount(21);
  await expect(labels.first()).toHaveText("04:00");
  await expect(labels.last()).toHaveText("24:00");

  await ui.calendar.addTask("Boundary task");
  await expect(ui.calendar.block(0)).toContainText("08:00");
  await ui.calendar.openTask(0);

  const startInput = ui.page.getByTestId("detail-task-start");
  await expect(startInput).toHaveAttribute("min", "04:00");
  await expect(startInput).toHaveAttribute("max", "23:50");
  await startInput.fill("04:00");
  await ui.taskDetails.save();

  await expect(ui.calendar.block(0)).toContainText("04:00");
  let stored = await ui.page.evaluate(() =>
    JSON.parse(localStorage.getItem("overrun_lite_state") || "{}")
  );
  expect(stored.tasks[0].startMinutes).toBe(-240);

  await ui.calendar.openTask(0);
  await ui.page.getByTestId("detail-task-duration").fill("10");
  await ui.page.getByTestId("detail-task-start").fill("23:50");
  await ui.taskDetails.save();

  await expect(ui.calendar.block(0)).toContainText("23:50");
  stored = await ui.page.evaluate(() =>
    JSON.parse(localStorage.getItem("overrun_lite_state") || "{}")
  );
  expect(stored.tasks[0].startMinutes).toBe(950);
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

test("Start and Stop only control the day-task emphasis", async ({ ui }) => {
  await ui.calendar.addTask("Focus on this task");
  await expect(ui.calendar.block(0)).not.toContainText("left");

  await ui.calendar.openTask(0);
  await ui.page.getByTestId("detail-toggle-timer").click();

  await expect(ui.taskDetails.drawer).toHaveAttribute("aria-hidden", "true");
  await expect(ui.calendar.block(0)).toHaveClass(/timer-active/);

  await ui.calendar.block(0).click({ delay: 1100 });
  await expect(ui.taskDetails.drawer).toHaveAttribute("aria-hidden", "false");
  await expect(ui.page.getByTestId("detail-toggle-timer")).toHaveText("Stop");
  await ui.page.getByTestId("detail-toggle-timer").click();

  await expect(ui.calendar.block(0)).not.toHaveClass(/timer-active/);
  const stored = await ui.page.evaluate(() => ({
    planner: JSON.parse(localStorage.getItem("overrun_lite_state") || "{}"),
    timer: localStorage.getItem("overrun_lite_task_timer"),
  }));
  expect(stored.planner.tasks[0]).not.toHaveProperty("elapsedMinutes");
  expect(stored.planner.tasks[0]).not.toHaveProperty("elapsedSeconds");
  expect(stored.timer).toBeNull();
});

test("starting another task transfers the persistent emphasis", async ({ ui }) => {
  await ui.calendar.addTask("First focus");
  await ui.calendar.addTask("Second focus");

  await ui.calendar.openTask(0);
  await ui.page.getByTestId("detail-toggle-timer").click();
  await expect(ui.calendar.block(0)).toHaveClass(/timer-active/);
  await expect(ui.calendar.block(1)).not.toHaveClass(/timer-active/);

  await ui.calendar.openTask(1);
  await expect(ui.page.getByTestId("detail-toggle-timer")).toHaveText("Start");
  await ui.page.getByTestId("detail-toggle-timer").click();
  await expect(ui.calendar.block(0)).not.toHaveClass(/timer-active/);
  await expect(ui.calendar.block(1)).toHaveClass(/timer-active/);

  const activeBeforeReload = await ui.page.evaluate(() => {
    const planner = JSON.parse(localStorage.getItem("overrun_lite_state") || "{}");
    const active = JSON.parse(localStorage.getItem("overrun_lite_task_timer") || "{}");
    return { activeId: active.activeId, secondTaskId: planner.tasks[1].id };
  });
  expect(activeBeforeReload.activeId).toBe(activeBeforeReload.secondTaskId);

  await ui.page.reload();
  await expect(ui.calendar.block(0)).not.toHaveClass(/timer-active/);
  await expect(ui.calendar.block(1)).toHaveClass(/timer-active/);
  await ui.calendar.openTask(1);
  await expect(ui.page.getByTestId("detail-toggle-timer")).toHaveText("Stop");
  await ui.page.getByTestId("detail-toggle-timer").click();
  await expect(ui.calendar.block(1)).not.toHaveClass(/timer-active/);
});

test("legacy progress is discarded without completing an active task", async ({ ui }) => {
  await ui.page.evaluate(() => {
    localStorage.setItem("overrun_lite_state", JSON.stringify({
      tasks: [{
        id: "near-estimate",
        name: "Stay active",
        minutes: 10,
        startMinutes: 300,
        elapsedSeconds: 600,
        completed: false,
      }],
      backlog: [],
    }));
    localStorage.setItem("overrun_lite_task_timer", JSON.stringify({
      activeId: "near-estimate",
    }));
  });
  await ui.page.reload();
  await ui.page.waitForTimeout(1100);

  await expect(ui.calendar.blocks()).toHaveCount(1);
  await expect(ui.calendar.block(0)).toHaveClass(/timer-active/);
  const stored = await ui.page.evaluate(() =>
    JSON.parse(localStorage.getItem("overrun_lite_state") || "{}")
  );
  expect(stored.tasks[0]).toMatchObject({ completed: false });
  expect(stored.tasks[0]).not.toHaveProperty("elapsedMinutes");
  expect(stored.tasks[0]).not.toHaveProperty("elapsedSeconds");
  expect(stored.backlog).toEqual([]);
});

test("completing the active task clears focus and leaves the planner interactive", async ({ ui }) => {
  await ui.calendar.addTask("Finish this active task");
  await ui.calendar.addTask("Open this next");

  await ui.calendar.openTask(0);
  await ui.page.getByTestId("detail-toggle-timer").click();
  await expect(ui.calendar.block(0)).toHaveClass(/timer-active/);

  await ui.calendar.openTask(0);
  await ui.page.getByTestId("detail-toggle-done").click();
  await expect(ui.taskDetails.drawer).toHaveAttribute("aria-hidden", "true");
  await expect(ui.calendar.blocks()).toHaveCount(1);
  await expect(ui.page.locator(".calendar-block.timer-active")).toHaveCount(0);

  await ui.calendar.openTask(0);
  await expect(ui.taskDetails.drawer).toHaveAttribute("aria-hidden", "false");
  expect(ui.consoleErrors).toEqual([]);
});

test("completing tasks archives them immediately in newest-first Done order", async ({ ui }) => {
  await ui.calendar.addTask();
  await ui.calendar.addTask();

  await ui.calendar.openTask(0);
  await ui.page.getByTestId("detail-task-title").fill("First completed");
  await ui.taskDetails.markDone();

  await expect(ui.taskDetails.drawer).toHaveAttribute("aria-hidden", "true");
  await expect(ui.calendar.blocks()).toHaveCount(1);
  await expect(ui.backlog.doneSection).not.toHaveAttribute("open", "");
  await expect(ui.backlog.doneToggle).toContainText("1");

  await ui.calendar.openTask(0);
  await ui.page.getByTestId("detail-task-title").fill("Latest completed");
  await ui.taskDetails.markDone();

  await expect(ui.calendar.blocks()).toHaveCount(0);
  await ui.backlog.doneToggle.click();
  await expect(ui.backlog.doneItems()).toHaveCount(2);
  await expect(ui.backlog.doneItems().nth(0)).toContainText("Latest completed");
  await expect(ui.backlog.doneItems().nth(1)).toContainText("First completed");
});

test("restoring a Done task returns it to the open backlog", async ({ ui }) => {
  await ui.calendar.addTask();
  await ui.calendar.openTask(0);
  await ui.taskDetails.markDone();
  await ui.backlog.doneToggle.click();
  await ui.backlog.doneItems().getByRole("button", { name: "Restore" }).click();

  await expect(ui.backlog.doneItems()).toHaveCount(0);
  await expect(ui.backlog.items()).toHaveCount(1);
  const stored = await ui.page.evaluate(() => JSON.parse(localStorage.getItem("overrun_lite_state") || "{}"));
  expect(stored.backlog[0]).toMatchObject({ completed: false, completedAt: null });
  expect(stored.backlog[0]).not.toHaveProperty("elapsedMinutes");
  expect(stored.backlog[0]).not.toHaveProperty("elapsedSeconds");
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

test("mobile calendar keeps hour labels in a vertical rail", async ({ ui }) => {
  await ui.page.setViewportSize({ width: 390, height: 844 });
  await ui.page.emulateMedia({ reducedMotion: "reduce" });
  await ui.page.getByTestId("mobile-pagination").locator(".mobile-pagination-dot").nth(1).click();
  await expect(ui.page.getByTestId("mobile-pagination").locator(".mobile-pagination-dot").nth(1)).toHaveAttribute(
    "aria-current",
    "true"
  );

  const metrics = await ui.calendar.mobileGridMetrics();

  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
  expect(metrics.calendarRight).toBeLessThanOrEqual(metrics.clientWidth);
  expect(metrics.gridColumnCount).toBe(2);
  expect(metrics.secondLabelTop).toBeGreaterThan(metrics.firstLabelTop);
  expect(metrics.labelVerticalGap).toBeGreaterThan(metrics.labelHeight * 4);
  expect(Math.abs(metrics.secondLabelLeft - metrics.firstLabelLeft)).toBeLessThanOrEqual(2);
});

test("resize grip changes task block height", async ({ ui }) => {
  await ui.calendar.addTask();
  await ui.calendar.openTask(0);
  await ui.taskDetails.setDuration(10);

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
  expect(before.text).toContain("08:00");
  await ui.calendar.moveBlock(0, 100);
  const afterDrag = await ui.calendar.blockMetrics(0);
  expect(afterDrag.text).toContain("09:00");

  await ui.calendar.openTask(0);
  await ui.taskDetails.setStartTime("10:00");
  const afterDetails = await ui.calendar.blockMetrics(0);
  expect(afterDetails.text).toContain("10:00");
});

test("a touch swipe starting on a task does not move it or open the editor", async ({ ui }) => {
  await ui.page.setViewportSize({ width: 390, height: 844 });
  await ui.calendar.addTask("Swipe-safe task");
  await ui.page.getByTestId("mobile-pagination").locator(".mobile-pagination-dot").nth(1).click();

  const before = await ui.calendar.blockMetrics(0);
  await ui.page.evaluate(() => {
    const block = document.querySelector<HTMLElement>('[data-testid="calendar-block"]');
    if (!block) throw new Error("Calendar block not found.");
    const init = (type: string, clientX: number, clientY: number) => {
      block.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        button: 0,
        clientX,
        clientY,
        pointerId: 41,
        pointerType: "touch",
      }));
    };
    init("pointerdown", 120, 200);
    init("pointermove", 220, 202);
    init("pointerup", 220, 202);
  });

  const after = await ui.calendar.blockMetrics(0);
  expect(after.text).toContain("08:00");
  expect(after.top).toBe(before.top);
  await expect(ui.taskDetails.drawer).toHaveAttribute("aria-hidden", "true");
  await expect(ui.calendar.block(0)).toHaveCSS("touch-action", "manipulation");
});

test("leaving the schedule screen cancels a pending touch move", async ({ ui }) => {
  await ui.page.setViewportSize({ width: 390, height: 844 });
  await ui.calendar.addTask("Navigation-safe task");
  await ui.page.getByTestId("mobile-pagination").locator(".mobile-pagination-dot").nth(1).click();

  await ui.page.evaluate(() => {
    const block = document.querySelector<HTMLElement>('[data-testid="calendar-block"]');
    if (!block) throw new Error("Calendar block not found.");
    block.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      clientX: 120,
      clientY: 200,
      pointerId: 43,
      pointerType: "touch",
    }));
  });
  await ui.page.getByTestId("mobile-screen-deck").evaluate((deck) => {
    deck.scrollLeft = deck.clientWidth * 2;
    deck.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  await ui.page.waitForTimeout(420);
  await ui.page.evaluate(() => {
    const block = document.querySelector<HTMLElement>('[data-testid="calendar-block"]');
    if (!block) throw new Error("Calendar block not found.");
    block.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      button: 0,
      clientX: 120,
      clientY: 300,
      pointerId: 43,
      pointerType: "touch",
    }));
    block.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      button: 0,
      clientX: 120,
      clientY: 300,
      pointerId: 43,
      pointerType: "touch",
    }));
  });

  await ui.page.getByTestId("mobile-pagination").locator(".mobile-pagination-dot").nth(1).click();
  await expect(ui.calendar.block(0)).toContainText("08:00");
  await expect(ui.taskDetails.drawer).toHaveAttribute("aria-hidden", "true");
});

test("a held touch can arm vertical task movement without making scrolling move tasks", async ({ ui }) => {
  await ui.page.setViewportSize({ width: 390, height: 844 });
  await ui.calendar.addTask("Held touch task");
  await ui.page.getByTestId("mobile-pagination").locator(".mobile-pagination-dot").nth(1).click();

  await ui.page.evaluate(() => {
    const block = document.querySelector<HTMLElement>('[data-testid="calendar-block"]');
    if (!block) throw new Error("Calendar block not found.");
    block.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      clientX: 120,
      clientY: 200,
      pointerId: 42,
      pointerType: "touch",
    }));
  });
  await ui.page.waitForTimeout(420);
  await ui.page.evaluate(() => {
    const block = document.querySelector<HTMLElement>('[data-testid="calendar-block"]');
    if (!block) throw new Error("Calendar block not found.");
    const init = (type: string, clientY: number) => {
      block.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        button: 0,
        clientX: 120,
        clientY,
        pointerId: 42,
        pointerType: "touch",
      }));
    };
    init("pointermove", 300);
    init("pointerup", 300);
  });

  await expect(ui.calendar.block(0)).toContainText("09:00");
  await expect(ui.taskDetails.drawer).toHaveAttribute("aria-hidden", "true");
});

test("overlapping tasks are allowed and flagged", async ({ ui }) => {
  await ui.calendar.addTask();
  await ui.calendar.addTask();

  await ui.calendar.openTask(0);
  await ui.taskDetails.setStartTime("09:00");

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

test("short incidental overlaps do not force narrow columns", async ({ ui }) => {
  await ui.page.evaluate(() => {
    localStorage.setItem(
      "overrun_lite_state",
      JSON.stringify({
        tasks: [
          {
            id: "slight-a",
            name: "First task",
            minutes: 60,
            type: "task",
            startMinutes: 0,
            hasExplicitStart: true,
            completed: false,
            priorityScore: 50,
            urgency: 3,
            impact: 3,
            subtasks: [],
          },
          {
            id: "slight-b",
            name: "Second task",
            minutes: 60,
            type: "task",
            startMinutes: 55,
            hasExplicitStart: true,
            completed: false,
            priorityScore: 50,
            urgency: 3,
            impact: 3,
            subtasks: [],
          },
          {
            id: "slight-c",
            name: "Third task",
            minutes: 60,
            type: "task",
            startMinutes: 110,
            hasExplicitStart: true,
            completed: false,
            priorityScore: 50,
            urgency: 3,
            impact: 3,
            subtasks: [],
          },
        ],
        backlog: [],
      })
    );
  });
  await ui.page.reload();

  const layerWidth = await ui.page.getByTestId("calendar-blocks").evaluate((layer) =>
    layer.getBoundingClientRect().width
  );
  const first = await ui.calendar.blockMetrics(0);
  const second = await ui.calendar.blockMetrics(1);
  const third = await ui.calendar.blockMetrics(2);

  expect(first.className).toContain("overlap-conflict");
  expect(second.className).toContain("overlap-conflict");
  expect(third.className).toContain("overlap-conflict");
  expect(first.width).toBeGreaterThan(layerWidth * 0.9);
  expect(second.width).toBeGreaterThan(layerWidth * 0.9);
  expect(third.width).toBeGreaterThan(layerWidth * 0.9);
  expect(first.overflow).toBe(false);
  expect(second.overflow).toBe(false);
  expect(third.overflow).toBe(false);
});

test("substantial overlaps keep distinct lanes regardless of storage order", async ({ ui }) => {
  const tasks = [
    {
      id: "task-20",
      name: "New task (part 2) (part 1)",
      minutes: 60,
      type: "task",
      startMinutes: 210,
      hasExplicitStart: true,
      completed: false,
      priorityScore: 50,
      urgency: 3,
      impact: 3,
      parentId: "task-1",
      splitGroupId: "task-1",
      splitPartIndex: 1,
      splitPartCount: 2,
      subtasks: [],
    },
    {
      id: "task-21",
      name: "New task (part 2) (part 2)",
      minutes: 100,
      type: "task",
      startMinutes: 155,
      hasExplicitStart: true,
      completed: false,
      priorityScore: 50,
      urgency: 3,
      impact: 3,
      parentId: "task-1",
      splitGroupId: "task-1",
      splitPartIndex: 2,
      splitPartCount: 2,
      subtasks: [],
    },
    {
      id: "task-2",
      name: "New task (part 1)",
      minutes: 85,
      type: "task",
      startMinutes: 150,
      hasExplicitStart: true,
      completed: false,
      priorityScore: 50,
      urgency: 3,
      impact: 3,
      parentId: "task-1",
      splitGroupId: "task-1",
      subtasks: [],
    },
  ];

  await ui.page.evaluate((seedTasks) => {
    localStorage.setItem("overrun_lite_state", JSON.stringify({ tasks: seedTasks, backlog: [] }));
  }, tasks);
  await ui.page.reload();

  const layerWidth = await ui.page.getByTestId("calendar-blocks").evaluate((layer) =>
    layer.getBoundingClientRect().width
  );
  const laneMetrics = await ui.page.getByTestId("calendar-block").evaluateAll((blocks) =>
    blocks.map((block) => {
      const rect = block.getBoundingClientRect();
      return {
        id: (block as HTMLElement).dataset.id,
        left: Math.round(rect.left),
        overflow: block.scrollHeight > block.clientHeight || block.scrollWidth > block.clientWidth,
        width: Math.round(rect.width),
      };
    })
  );
  const laneLefts = new Set(laneMetrics.map((metric) => metric.left));

  expect(laneMetrics).toHaveLength(3);
  expect(laneLefts.size).toBe(3);
  laneMetrics.forEach((metric) => {
    expect(metric.width).toBeLessThan(layerWidth * 0.4);
    expect(metric.overflow).toBe(false);
  });

  const movingBlock = ui.page.locator('[data-id="task-2"]');
  const movingBox = await movingBlock.boundingBox();
  if (!movingBox) throw new Error("Expected task-2 to be visible.");
  await ui.page.mouse.move(movingBox.x + movingBox.width / 2, movingBox.y + 20);
  await ui.page.mouse.down();
  await ui.page.mouse.move(movingBox.x + movingBox.width / 2, movingBox.y - 10, { steps: 4 });
  await ui.page.mouse.up();

  const afterMoveMetrics = await ui.page.getByTestId("calendar-block").evaluateAll((blocks) =>
    blocks.map((block) => {
      const rect = block.getBoundingClientRect();
      return {
        id: (block as HTMLElement).dataset.id,
        left: Math.round(rect.left),
        overflow: block.scrollHeight > block.clientHeight || block.scrollWidth > block.clientWidth,
        width: Math.round(rect.width),
      };
    })
  );
  const afterMoveLefts = new Set(afterMoveMetrics.map((metric) => metric.left));
  expect(afterMoveLefts.size).toBe(3);
  afterMoveMetrics.forEach((metric) => {
    expect(metric.width).toBeLessThan(layerWidth * 0.4);
    expect(metric.overflow).toBe(false);
  });
});

test("dragged task keeps its lane while still overlapping its original cluster", async ({ ui }) => {
  await ui.page.evaluate(() => {
    localStorage.setItem(
      "overrun_lite_state",
      JSON.stringify({
        tasks: [
          {
            id: "task-20",
            name: "New task (part 2) (part 1)",
            minutes: 60,
            type: "task",
            startMinutes: 135,
            hasExplicitStart: true,
            completed: false,
            priorityScore: 50,
            urgency: 3,
            impact: 3,
            parentId: "task-1",
            splitGroupId: "task-1",
            splitPartIndex: 1,
            splitPartCount: 2,
            subtasks: [],
          },
          {
            id: "task-21",
            name: "New task (part 2) (part 2)",
            minutes: 100,
            type: "task",
            startMinutes: 135,
            hasExplicitStart: true,
            completed: false,
            priorityScore: 50,
            urgency: 3,
            impact: 3,
            parentId: "task-1",
            splitGroupId: "task-1",
            splitPartIndex: 2,
            splitPartCount: 2,
            subtasks: [],
          },
          {
            id: "task-2",
            name: "New task (part 1)",
            minutes: 85,
            type: "task",
            startMinutes: 135,
            hasExplicitStart: true,
            completed: false,
            priorityScore: 50,
            urgency: 3,
            impact: 3,
            parentId: "task-1",
            splitGroupId: "task-1",
            subtasks: [],
          },
        ],
        backlog: [],
      })
    );
  });
  await ui.page.reload();

  const middleBlock = ui.page.locator('[data-id="task-2"]');
  const beforeLeft = await middleBlock.evaluate((block) =>
    Math.round(block.getBoundingClientRect().left)
  );
  const box = await middleBlock.boundingBox();
  if (!box) throw new Error("Expected task-2 to be visible.");

  await ui.page.mouse.move(box.x + box.width / 2, box.y + 20);
  await ui.page.mouse.down();
  await ui.page.mouse.move(box.x + box.width / 2, box.y - 18, { steps: 5 });

  const duringLeft = await middleBlock.evaluate((block) =>
    Math.round(block.getBoundingClientRect().left)
  );
  expect(duringLeft).toBe(beforeLeft);

  await ui.page.mouse.up();
});

test("dragging cannot create a fourth substantial overlap column", async ({ ui }) => {
  await ui.page.evaluate(() => {
    localStorage.setItem(
      "overrun_lite_state",
      JSON.stringify({
        tasks: [
          {
            id: "lane-a",
            name: "Lane A",
            minutes: 100,
            type: "task",
            startMinutes: 135,
            hasExplicitStart: true,
            completed: false,
            priorityScore: 50,
            urgency: 3,
            impact: 3,
            subtasks: [],
          },
          {
            id: "lane-b",
            name: "Lane B",
            minutes: 85,
            type: "task",
            startMinutes: 135,
            hasExplicitStart: true,
            completed: false,
            priorityScore: 50,
            urgency: 3,
            impact: 3,
            subtasks: [],
          },
          {
            id: "lane-c",
            name: "Lane C",
            minutes: 60,
            type: "task",
            startMinutes: 135,
            hasExplicitStart: true,
            completed: false,
            priorityScore: 50,
            urgency: 3,
            impact: 3,
            subtasks: [],
          },
          {
            id: "moving-fourth",
            name: "Moving fourth",
            minutes: 60,
            type: "task",
            startMinutes: 300,
            hasExplicitStart: true,
            completed: false,
            priorityScore: 50,
            urgency: 3,
            impact: 3,
            subtasks: [],
          },
        ],
        backlog: [],
      })
    );
  });
  await ui.page.reload();

  const movingBlock = ui.page.locator('[data-id="moving-fourth"]');
  const box = await movingBlock.boundingBox();
  if (!box) throw new Error("Expected moving-fourth to be visible.");

  await ui.page.mouse.move(box.x + box.width / 2, box.y + 20);
  await ui.page.mouse.down();
  await ui.page.mouse.move(box.x + box.width / 2, box.y - 170, { steps: 12 });
  await ui.page.mouse.up();

  const storedStart = await ui.page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem("overrun_lite_state") || "{}");
    return stored.tasks.find((task: { id: string }) => task.id === "moving-fourth").startMinutes;
  });
  expect(storedStart).toBeGreaterThanOrEqual(235);

  const maxVisibleColumns = await ui.page.getByTestId("calendar-block").evaluateAll((blocks) => {
    const topGroups = new Map<number, Set<number>>();
    blocks.forEach((block) => {
      const rect = block.getBoundingClientRect();
      const top = Math.round(rect.top / 5) * 5;
      const group = topGroups.get(top) || new Set<number>();
      group.add(Math.round(rect.left));
      topGroups.set(top, group);
    });
    return Math.max(...Array.from(topGroups.values()).map((lefts) => lefts.size));
  });
  expect(maxVisibleColumns).toBeLessThanOrEqual(3);
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

test("calendar block shows subtask completion", async ({ ui }) => {
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
  await ui.taskDetails.subtasks().nth(1).getByTestId("detail-subtask-completed").check();
  await ui.taskDetails.save();

  metrics = await ui.calendar.blockMetrics(0);
  expect(metrics.text).toContain("Sub 2/3");
  expect(metrics.overflow).toBe(false);
});

test("settings can clear API keys while keeping tasks", async ({ ui }) => {
  await ui.calendar.addTask();
  await ui.settings.useLocalProvider({
    baseUrl: "https://openrouter.ai/api/v1",
    model: "qwen/qwen3.7-plus",
    apiKey: "temporary-test-key",
  });

  let storedSettings = await ui.page.evaluate(() =>
    JSON.parse(localStorage.getItem("overrun_lite_ai_settings") || "{}")
  );
  expect(storedSettings.localApiKey).toBe("temporary-test-key");
  await expect(ui.calendar.blocks()).toHaveCount(1);

  await ui.settings.clearLocalSettings();

  storedSettings = await ui.page.evaluate(() =>
    JSON.parse(localStorage.getItem("overrun_lite_ai_settings") || "{}")
  );
  expect(storedSettings.localApiKey).toBeUndefined();
  expect(await ui.page.evaluate(() => localStorage.getItem("overrun_lite_state"))).not.toBeNull();
  await expect(ui.calendar.blocks()).toHaveCount(1);
  await expect(ui.page.getByTestId("ai-status")).toHaveText("Local AI settings cleared. Tasks and backlog were kept.");
});

test("AI review skips existing tasks echoed by weak local models", async ({ ui }) => {
  await ui.calendar.addTask();
  await ui.settings.useLocalProvider({
    baseUrl: "http://local-ai.test/v1",
    model: "test-model",
  });
  await ui.page.route("**/chat/completions", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              currentTasks: [
                {
                  title: "New task",
                  minutes: 60,
                  priorityScore: 50,
                  priorityReason: "Existing task echoed from context.",
                  urgency: 3,
                  impact: 3,
                  subtasks: [],
                },
              ],
              currentBacklog: [
                {
                  title: "Make a cake",
                  minutes: 140,
                  priorityScore: 30,
                  priorityReason: "Lacks a deadline and specific requirements.",
                  urgency: 2,
                  impact: 2,
                  subtasks: [
                    { title: "Select a cake recipe", minutes: 20 },
                    { title: "Purchase all required ingredients", minutes: 45 },
                  ],
                },
              ],
              questions: [
                "When do you need the cake to be ready by?",
                "What kind of cake are you looking to make?",
              ],
              priorityUpdates: [],
              warnings: [],
            }),
          },
        }],
      }),
    });
  });

  await ui.inbox.fillDump("I need to make a cake but I have no ingredients and no recipe.");
  await ui.page.getByTestId("analyze-dump").click();
  await expect(ui.page.getByTestId("ai-status")).toHaveText("Draft ready for review.");

  const proposalTitles = await ui.page.locator(".proposal-card input[type='text']").evaluateAll((inputs) =>
    inputs.map((input) => (input as HTMLInputElement).value)
  );
  expect(proposalTitles).toContain("Make a cake");
  expect(proposalTitles).not.toContain("New task");
  await expect(ui.page.getByTestId("review-warnings")).toContainText("1 existing task was returned by AI and skipped.");
  await expect(ui.page.getByTestId("review-questions")).toContainText("When do you need the cake to be ready by?");
});
