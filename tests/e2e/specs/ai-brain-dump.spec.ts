import { expect, test } from "../fixtures/ui.fixture";

test.beforeEach(async ({ ui }) => {
  await ui.goto();
  await ui.resetState();
  await ui.settings.useLocalProvider({
    baseUrl: "http://local-ai.test/v1",
    model: "test-model",
  });
});

test("brain dump hides empty clarifications and keeps the first draft applicable", async ({ ui }) => {
  await ui.page.route("**/chat/completions", async (route) => {
    const requestBody = route.request().postDataJSON();
    const userMessage = JSON.parse(requestBody.messages[1].content);
    expect(userMessage.scheduling).toMatchObject({
      canPlanDay: true,
      dayStartTime: "04:00",
      dayEndTime: "24:00",
      maxPlannedMinutes: 480,
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              summary: "One straightforward task extracted.",
              proposedTasks: [{
                title: "Install flower holders on the wall",
                minutes: 35,
                priorityScore: 45,
                priorityReason: "A useful household improvement.",
                urgency: 2,
                impact: 3,
                subtasks: [],
              }],
              questions: [],
              priorityUpdates: [],
              warnings: ["Before drilling, check the wall for hidden cables or pipes."],
            }),
          },
        }],
      }),
    });
  });

  await ui.inbox.fillDump("Install flower holders on the wall and drill the required holes.");
  await ui.page.getByTestId("analyze-dump").click();

  await expect(ui.aiReview.drawer).toHaveAttribute("aria-hidden", "false");
  await expect(ui.page.getByTestId("review-questions")).toBeHidden();
  await expect(ui.page.getByTestId("reanalyze-dump")).toBeHidden();
  await expect(ui.page.getByTestId("apply-review")).toBeEnabled();
  await expect(ui.page.getByTestId("review-warnings")).toContainText("hidden cables or pipes");
  await expect(ui.page.getByTestId("proposal-destination")).toHaveValue("day");
  await expect(ui.page.getByTestId("proposal-start-time")).toHaveValue("08:00");

  await ui.aiReview.apply();
  await expect(ui.calendar.blocks()).toHaveCount(1);
  await expect(ui.calendar.block(0)).toContainText("Install flower holders on the wall");
  await expect(ui.calendar.block(0)).toContainText("08:00");
  await expect(ui.backlog.items()).toHaveCount(0);
});

test("empty-day AI suggestions schedule fitting work and keep overflow in backlog", async ({ ui }) => {
  await ui.page.route("**/chat/completions", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              summary: "A focused day plan with one overflow task.",
              proposedTasks: [
                {
                  title: "Write project brief",
                  minutes: 180,
                  priorityScore: 90,
                  priorityReason: "Highest-impact focused work.",
                  urgency: 5,
                  impact: 5,
                  destination: "day",
                  startTime: "08:00",
                  subtasks: [],
                },
                {
                  title: "Prepare presentation",
                  minutes: 180,
                  priorityScore: 80,
                  priorityReason: "Needed for tomorrow.",
                  urgency: 4,
                  impact: 5,
                  destination: "day",
                  startTime: "12:00",
                  subtasks: [],
                },
                {
                  title: "Clean up research notes",
                  minutes: 180,
                  priorityScore: 40,
                  priorityReason: "Useful but less urgent.",
                  urgency: 2,
                  impact: 3,
                  destination: "day",
                  startTime: "16:00",
                  subtasks: [],
                },
              ],
              questions: [],
              priorityUpdates: [],
              warnings: [],
            }),
          },
        }],
      }),
    });
  });

  await ui.inbox.fillDump("Write the brief, prepare tomorrow's presentation, and clean up my research notes.");
  await ui.page.getByTestId("analyze-dump").click();

  const proposals = ui.page.getByTestId("task-proposal");
  await expect(proposals).toHaveCount(3);
  await expect(proposals.nth(0).getByTestId("proposal-destination")).toHaveValue("day");
  await expect(proposals.nth(0).getByTestId("proposal-start-time")).toHaveValue("08:00");
  await expect(proposals.nth(1).getByTestId("proposal-destination")).toHaveValue("day");
  await expect(proposals.nth(1).getByTestId("proposal-start-time")).toHaveValue("12:00");
  await expect(proposals.nth(2).getByTestId("proposal-destination")).toHaveValue("backlog");
  await expect(ui.page.getByTestId("review-warnings")).toContainText("kept in the backlog");

  const beforeApply = await ui.page.evaluate(() =>
    JSON.parse(localStorage.getItem("overrun_lite_state") || "{}")
  );
  expect(beforeApply.tasks || []).toEqual([]);
  expect(beforeApply.backlog || []).toEqual([]);

  await ui.aiReview.apply();

  await expect(ui.calendar.blocks()).toHaveCount(2);
  await expect(ui.backlog.items()).toHaveCount(1);
  await expect(ui.backlog.items().first()).toContainText("Clean up research notes");
  const afterApply = await ui.page.evaluate(() =>
    JSON.parse(localStorage.getItem("overrun_lite_state") || "{}")
  );
  expect(afterApply.tasks.map((task: { name: string; startMinutes: number }) => ({
    name: task.name,
    startMinutes: task.startMinutes,
  }))).toEqual([
    { name: "Write project brief", startMinutes: 0 },
    { name: "Prepare presentation", startMinutes: 240 },
  ]);
  expect(afterApply.backlog.map((task: { name: string }) => task.name)).toEqual([
    "Clean up research notes",
  ]);
  expect(ui.consoleErrors).toEqual([]);
});

test("brain dump offers at most two optional questions and refines with complete answers", async ({ ui }) => {
  let requestCount = 0;
  await ui.page.route("**/chat/completions", async (route) => {
    requestCount += 1;
    const requestBody = route.request().postDataJSON();
    const userMessage = JSON.parse(requestBody.messages[1].content);

    if (requestCount === 1) {
      expect(userMessage.clarifications).toEqual([]);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                summary: "A useful initial draft.",
                proposedTasks: [{
                  title: "Prepare launch materials",
                  minutes: 60,
                  priorityScore: 65,
                  priorityReason: "Supports the launch.",
                  urgency: 3,
                  impact: 4,
                  subtasks: [],
                }],
                questions: [
                  {
                    id: "deadline",
                    question: "When does the launch need to be ready?",
                    reason: "The deadline affects urgency.",
                  },
                  {
                    id: "audience",
                    question: "Who is the launch for?",
                    reason: "The audience affects scope.",
                  },
                  {
                    id: "excess",
                    question: "Which color should it use?",
                    reason: "This question should be capped.",
                  },
                ],
                priorityUpdates: [],
                warnings: [],
              }),
            },
          }],
        }),
      });
      return;
    }

    expect(userMessage.clarifications).toEqual([{
      id: "deadline",
      question: "When does the launch need to be ready?",
      reason: "The deadline affects urgency.",
      answer: "Next Friday",
    }]);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              summary: "Refined around the confirmed deadline.",
              proposedTasks: [{
                title: "Prepare launch materials by next Friday",
                minutes: 90,
                priorityScore: 82,
                priorityReason: "The deadline is confirmed.",
                urgency: 5,
                impact: 4,
                subtasks: [],
              }],
              questions: [
                {
                  id: "deadline-again",
                  question: "When does the launch need to be ready?",
                  reason: "Already answered.",
                },
                {
                  id: "audience",
                  question: "Who is the launch for?",
                  reason: "The audience still affects scope.",
                },
              ],
              priorityUpdates: [],
              warnings: [],
            }),
          },
        }],
      }),
    });
  });

  await ui.inbox.fillDump("Prepare the launch materials.");
  await ui.page.getByTestId("analyze-dump").click();

  const questions = ui.page.getByTestId("review-questions");
  await expect(questions).toBeVisible();
  await expect(questions.locator("textarea")).toHaveCount(2);
  await expect(ui.page.getByTestId("apply-review")).toBeEnabled();
  await expect(ui.page.getByTestId("reanalyze-dump")).toBeVisible();
  await expect(ui.page.getByTestId("reanalyze-dump")).toBeDisabled();

  await questions.locator("textarea").first().fill("   ");
  await expect(ui.page.getByTestId("reanalyze-dump")).toBeDisabled();
  await questions.locator("textarea").first().fill("Next Friday");
  await expect(ui.page.getByTestId("reanalyze-dump")).toBeEnabled();

  const storedDraft = await ui.page.evaluate(() =>
    JSON.parse(localStorage.getItem("overrun_lite_review_draft") || "{}")
  );
  expect(storedDraft.answers.deadline).toBe("Next Friday");

  await ui.page.getByTestId("reanalyze-dump").click();

  await expect(ui.aiReview.heading).toHaveText("Updated plan");
  await expect(ui.page.locator(".proposal-card input[type='text']").first())
    .toHaveValue("Prepare launch materials by next Friday");
  await expect(questions).not.toContainText("When does the launch need to be ready?");
  await expect(questions).toContainText("Who is the launch for?");
  await expect(ui.page.getByTestId("review-guidance")).toContainText("Next Friday");
  await expect(ui.page.getByTestId("review-changes")).toContainText("Estimated time changed");
  expect(requestCount).toBe(2);
  expect(ui.consoleErrors).toEqual([]);
});

test("refinement preserves manual proposal edits and sends them back as context", async ({ ui }) => {
  let requestCount = 0;
  await ui.page.route("**/chat/completions", async (route) => {
    requestCount += 1;
    const body = route.request().postDataJSON();
    const request = JSON.parse(body.messages[1].content);
    if (requestCount === 2) {
      expect(request.currentDraft.proposedTasks[0]).toMatchObject({
        title: "Keep my launch wording",
        userEditedFields: ["title"],
      });
      expect(request.clarifications[0].answer).toBe("Next Friday");
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify(requestCount === 1 ? {
              summary: "Initial launch draft.",
              proposedTasks: [{
                title: "Prepare launch materials",
                minutes: 60,
                priorityScore: 65,
                priorityReason: "Supports the launch.",
                urgency: 3,
                impact: 4,
                subtasks: [],
              }],
              questions: [{
                id: "deadline",
                question: "When does the launch need to be ready?",
                reason: "The deadline affects urgency.",
              }],
              priorityUpdates: [],
              warnings: [],
            } : {
              summary: "Updated for the confirmed deadline.",
              proposedTasks: [{
                title: "AI replacement title",
                minutes: 90,
                priorityScore: 82,
                priorityReason: "The deadline is confirmed.",
                urgency: 5,
                impact: 4,
                subtasks: [],
              }],
              questions: [],
              priorityUpdates: [],
              warnings: [],
            }),
          },
        }],
      }),
    });
  });

  await ui.inbox.fillDump("Prepare the launch materials.");
  await ui.page.getByTestId("analyze-dump").click();
  await ui.page.locator(".proposal-title-input").fill("Keep my launch wording");
  await ui.page.getByTestId("review-questions").locator("textarea").fill("Next Friday");
  await ui.page.getByTestId("reanalyze-dump").click();

  await expect(ui.page.locator(".proposal-title-input")).toHaveValue("Keep my launch wording");
  await expect(ui.page.getByTestId("review-guidance")).toContainText("Next Friday");
  await expect(ui.page.getByTestId("review-changes")).toContainText("Your manual edits were preserved");
  expect(requestCount).toBe(2);
  expect(ui.consoleErrors).toEqual([]);
});

test("review drawer is modal, keyboard dismissible, and keeps actions visible on mobile", async ({ ui }) => {
  await ui.page.setViewportSize({ width: 390, height: 844 });
  await ui.page.route("**/chat/completions", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              summary: "A compact review draft.",
              proposedTasks: [{
                title: "Prepare launch materials",
                minutes: 90,
                priorityScore: 82,
                priorityReason: "Important launch work.",
                urgency: 5,
                impact: 4,
                subtasks: [{ title: "Draft announcement", minutes: 30 }],
              }],
              questions: [],
              priorityUpdates: [],
              warnings: [],
            }),
          },
        }],
      }),
    });
  });

  await ui.inbox.fillDump("Prepare launch materials.");
  await ui.page.getByTestId("analyze-dump").click();
  await expect(ui.aiReview.drawer).toHaveAttribute("role", "dialog");
  await expect(ui.aiReview.drawer).toHaveAttribute("aria-modal", "true");
  await expect(ui.page.getByTestId("review-footer")).toBeInViewport();
  await expect(ui.page.locator("#review-card")).toBeFocused();

  await ui.page.keyboard.press("Escape");
  await expect(ui.aiReview.drawer).toHaveAttribute("aria-hidden", "true");
  await expect(ui.page.getByTestId("analyze-dump")).toBeFocused();
  expect(ui.consoleErrors).toEqual([]);
});
