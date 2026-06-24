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
            elapsedMinutes: 0,
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
            elapsedMinutes: 0,
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
            elapsedMinutes: 0,
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
      elapsedMinutes: 0,
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
      elapsedMinutes: 0,
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
      elapsedMinutes: 0,
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
            elapsedMinutes: 0,
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
            elapsedMinutes: 0,
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
            elapsedMinutes: 0,
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
            elapsedMinutes: 0,
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
            elapsedMinutes: 0,
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
            elapsedMinutes: 0,
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
            elapsedMinutes: 0,
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
  await ui.page.route("/api/plan", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
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
