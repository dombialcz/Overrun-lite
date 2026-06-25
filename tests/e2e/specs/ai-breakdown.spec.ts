import { expect, test } from "../fixtures/ui.fixture";

test.beforeEach(async ({ ui }) => {
  await ui.goto();
  await ui.resetState();
});

test("AI task breakdown is reviewed before applying subtasks", async ({ ui }) => {
  await ui.page.route("**/api/plan", async (route) => {
    const request = route.request();
    const payload = request.postDataJSON();
    expect(payload.mode).toBe("task_breakdown");
    expect(payload.granularity).toBe("large");
    expect(payload.applyMode).toBe("append");
    expect(payload.instructions).toContain("testing");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        summary: "Two implementation subtasks proposed.",
        subtasks: [
          { title: "Map the current AI flow", minutes: 20 },
          { title: "Add mocked review coverage", minutes: 35 },
        ],
        questions: [],
        warnings: [],
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
  await expect(ui.taskDetails.subtasks()).toHaveCount(2);
  await expect(ui.taskDetails.drawer).toContainText("Trace AI request and response flow");
  await expect(ui.taskDetails.drawer).toContainText("New action");

  const storedAfterApply = await ui.page.evaluate(() =>
    JSON.parse(localStorage.getItem("overrun_lite_state") || "{}")
  );
  expect(storedAfterApply.tasks[0].subtasks.map((item: { title: string }) => item.title)).toEqual([
    "Trace AI request and response flow",
    "New action",
  ]);
  expect(ui.consoleErrors).toEqual([]);
});
