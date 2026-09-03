import { expect, test } from "../fixtures/ui.fixture";

test.beforeEach(async ({ ui }) => {
  await ui.goto();
  await ui.resetState();
  await ui.settings.useLocalProvider({
    baseUrl: "http://local-ai.test/v1",
    model: "test-model",
  });
});

test("AI task breakdown is reviewed before applying subtasks", async ({ ui }) => {
  await ui.page.route("**/chat/completions", async (route) => {
    const request = route.request();
    const payload = request.postDataJSON();
    const prompt = payload.messages.map((message: { content: string }) => message.content).join("\n");
    expect(prompt).toContain("task_breakdown");
    expect(prompt).toContain('"granularity": "large"');
    expect(prompt).toContain('"applyMode": "append"');
    expect(prompt).toContain("testing");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              summary: "Two implementation subtasks proposed.",
              subtasks: [
                { title: "Map the current AI flow", minutes: 20 },
                { title: "Add mocked review coverage", minutes: 35 },
              ],
              questions: [],
              warnings: [],
            }),
          },
        }],
      }),
    });
  });

  await ui.calendar.addTask();
  await ui.calendar.openTask(0);
  await ui.taskDetails.requestBreakdown({
    instructions: "Focus on implementation and testing.",
    granularity: "large",
    applyMode: "append",
  });

  await expect(ui.aiReview.drawer).toHaveAttribute("aria-hidden", "false");
  await expect(ui.aiReview.heading).toHaveText("Review task breakdown");
  await expect(ui.aiReview.breakdownSubtasks()).toHaveCount(2);

  const storedBeforeApply = await ui.page.evaluate(() =>
    JSON.parse(localStorage.getItem("overrun_lite_state") || "{}")
  );
  expect(storedBeforeApply.tasks[0].subtasks).toEqual([]);

  await ui.aiReview.editBreakdownSubtask(0, "Trace AI request and response flow", 25);
  await ui.aiReview.removeBreakdownSubtask(1);
  await ui.aiReview.addBreakdownSubtask();
  await ui.aiReview.apply();

  await expect(ui.aiReview.drawer).toHaveAttribute("aria-hidden", "true");
  await ui.calendar.openTask(0);
  await expect(ui.taskDetails.subtasks()).toHaveCount(2);
  await expect(ui.taskDetails.subtasks().nth(0).getByTestId("detail-subtask-title")).toHaveValue("Trace AI request and response flow");
  await expect(ui.taskDetails.subtasks().nth(1).getByTestId("detail-subtask-title")).toHaveValue("New action");

  const storedAfterApply = await ui.page.evaluate(() =>
    JSON.parse(localStorage.getItem("overrun_lite_state") || "{}")
  );
  expect(storedAfterApply.tasks[0].subtasks.map((item: { title: string }) => item.title)).toEqual([
    "Trace AI request and response flow",
    "New action",
  ]);
  expect(ui.consoleErrors).toEqual([]);
});

test("task breakdown questions refine in place and preserve user edits", async ({ ui }) => {
  let requestCount = 0;
  await ui.page.route("**/chat/completions", async (route) => {
    requestCount += 1;
    const body = route.request().postDataJSON();
    const request = JSON.parse(body.messages[1].content);
    if (requestCount === 2) {
      expect(request.clarifications[0].answer).toBe("Existing customers");
      expect(request.currentDraft.subtasks[0]).toMatchObject({
        title: "Keep my first step",
      });
      expect(request.currentDraft.subtasks[0].userEditedFields)
        .toEqual(expect.arrayContaining(["title", "minutes"]));
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify(requestCount === 1 ? {
              summary: "Initial breakdown.",
              subtasks: [{ title: "Define the audience", minutes: 20 }],
              questions: [{
                id: "audience",
                question: "Who is the launch for?",
                reason: "The audience changes the steps.",
              }],
              warnings: [],
            } : {
              summary: "Updated for existing customers.",
              subtasks: [
                { title: "AI replacement first step", minutes: 25 },
                { title: "Draft the customer announcement", minutes: 35 },
              ],
              questions: [],
              warnings: [],
            }),
          },
        }],
      }),
    });
  });

  await ui.calendar.addTask("Prepare customer launch");
  await ui.calendar.openTask(0);
  await ui.taskDetails.addSubtask("Collect existing assets", 15);
  await ui.taskDetails.save();
  await ui.calendar.openTask(0);
  await ui.taskDetails.requestBreakdown();

  await expect(ui.page.getByTestId("review-context-title"))
    .toContainText("Prepare customer launch");
  await expect(ui.page.getByTestId("review-current-details")).toContainText("1 current step");
  await expect(ui.page.getByTestId("reanalyze-dump")).toBeDisabled();
  await ui.aiReview.editBreakdownSubtask(0, "Keep my first step", 20);
  await ui.page.getByTestId("review-questions").locator("textarea").fill("Existing customers");
  await expect(ui.page.getByTestId("reanalyze-dump")).toBeEnabled();
  await ui.page.getByTestId("reanalyze-dump").click();

  await expect(ui.aiReview.heading).toHaveText("Updated breakdown");
  await expect(ui.aiReview.breakdownSubtasks().first().getByTestId("breakdown-subtask-title"))
    .toHaveValue("Keep my first step");
  await expect(ui.page.getByTestId("review-guidance")).toContainText("Existing customers");
  await expect(ui.page.getByTestId("review-changes")).toContainText("Your manual edits were preserved");
  await ui.page.getByTestId("review-breakdown-apply-mode").selectOption("replace");
  await expect(ui.page.getByTestId("apply-review")).toHaveText("Replace 1 step with 2 steps");

  await ui.aiReview.apply();
  await ui.calendar.openTask(0);
  await expect(ui.taskDetails.subtasks()).toHaveCount(2);
  await expect(ui.taskDetails.subtasks().first().getByTestId("detail-subtask-title"))
    .toHaveValue("Keep my first step");
  expect(requestCount).toBe(2);
  expect(ui.consoleErrors).toEqual([]);
});

test("context organize reviews new tasks and merge suggestions before applying", async ({ ui }) => {
  await ui.page.evaluate(() => {
    localStorage.setItem(
      "overrun_lite_state",
      JSON.stringify({
        tasks: [
          {
            id: "planned-1",
            name: "Prepare launch email",
            minutes: 60,
            type: "task",
            startMinutes: 60,
            hasExplicitStart: true,
            elapsedMinutes: 0,
            completed: false,
            priorityScore: 50,
            urgency: 3,
            impact: 3,
            priorityReason: "Existing planned work.",
            subtasks: [],
          },
        ],
        backlog: [
          {
            id: "backlog-1",
            name: "Make a cake",
            minutes: 90,
            type: "task",
            startMinutes: 0,
            hasExplicitStart: true,
            elapsedMinutes: 0,
            completed: false,
            priorityScore: 30,
            urgency: 2,
            impact: 2,
            priorityReason: "Initial idea.",
            subtasks: [{ id: "subtask-1", title: "Choose a recipe", minutes: 20, completed: false }],
          },
        ],
      })
    );
  });
  await ui.page.reload();

  await ui.page.route("**/chat/completions", async (route) => {
    const payload = route.request().postDataJSON();
    const prompt = payload.messages.map((message: { content: string }) => message.content).join("\n");
    expect(prompt).toContain("context_organize");
    expect(prompt).toContain("cake ingredients");
    expect(prompt).toContain("planned-1");
    expect(prompt).toContain("backlog-1");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              summary: "Merged cake context and added one new task.",
              proposedTasks: [
                {
                  title: "Buy cake ingredients",
                  minutes: 35,
                  priorityScore: 70,
                  priorityReason: "Needed before baking.",
                  urgency: 4,
                  impact: 3,
                  subtasks: [],
                },
              ],
              mergeSuggestions: [
                {
                  taskId: "backlog-1",
                  reason: "The dump adds concrete cake prep.",
                  priorityScore: 88,
                  priorityReason: "Cake prep is now time-sensitive.",
                  urgency: 5,
                  impact: 4,
                  subtasks: [
                    { title: "Choose a recipe", minutes: 15 },
                    { title: "Check pantry for missing ingredients", minutes: 20 },
                  ],
                },
                {
                  taskId: "planned-1",
                  reason: "Launch wording was mentioned but should not be applied.",
                  priorityScore: 95,
                  priorityReason: "Rejected merge.",
                  urgency: 5,
                  impact: 5,
                  subtasks: [{ title: "Rejected subtask", minutes: 15 }],
                },
              ],
              questions: [],
              warnings: [],
            }),
          },
        }],
      }),
    });
  });

  await ui.inbox.fillDump("Need cake ingredients and maybe launch email wording.");
  await ui.inbox.contextOrganize();
  await expect(ui.aiReview.heading).toHaveText("Review organized plan");
  await expect(ui.aiReview.mergeSuggestions()).toHaveCount(2);

  const storedBeforeApply = await ui.page.evaluate(() =>
    JSON.parse(localStorage.getItem("overrun_lite_state") || "{}")
  );
  expect(storedBeforeApply.backlog[0].priorityScore).toBe(30);
  expect(storedBeforeApply.backlog[0].subtasks.map((item: { title: string }) => item.title)).toEqual(["Choose a recipe"]);

  await ui.aiReview.rejectMergeSuggestion(1);
  await ui.aiReview.apply();

  const storedAfterApply = await ui.page.evaluate(() =>
    JSON.parse(localStorage.getItem("overrun_lite_state") || "{}")
  );
  const cake = storedAfterApply.backlog.find((task: { id: string }) => task.id === "backlog-1");
  const launch = storedAfterApply.tasks.find((task: { id: string }) => task.id === "planned-1");
  const newTask = storedAfterApply.backlog.find((task: { name: string }) => task.name === "Buy cake ingredients");

  expect(cake.priorityScore).toBe(88);
  expect(cake.urgency).toBe(5);
  expect(cake.impact).toBe(4);
  expect(cake.subtasks.map((item: { title: string }) => item.title)).toEqual([
    "Choose a recipe",
    "Check pantry for missing ingredients",
  ]);
  expect(launch.priorityScore).toBe(50);
  expect(launch.subtasks).toEqual([]);
  expect(newTask).toBeTruthy();
  expect(ui.consoleErrors).toEqual([]);
});

test("task agent export creates a static prompt without mutating state", async ({ ui }) => {
  await ui.calendar.addTask();
  await ui.calendar.openTask(0);

  const before = await ui.page.evaluate(() => localStorage.getItem("overrun_lite_state"));
  await ui.taskDetails.exportAgentPrompt();

  await expect(ui.taskDetails.agentExportDrawer()).toHaveAttribute("aria-hidden", "false");
  const prompt = await ui.taskDetails.agentExportPrompt().inputValue();
  expect(prompt).toContain("You are helping me complete a task from Overrun Lite.");
  expect(prompt).toContain("## Task");
  expect(prompt).toContain("New task");
  expect(prompt).toContain("## Constraints");

  const after = await ui.page.evaluate(() => localStorage.getItem("overrun_lite_state"));
  expect(after).toBe(before);
  expect(ui.consoleErrors).toEqual([]);
});
