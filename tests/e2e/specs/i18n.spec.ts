import { readFile } from "node:fs/promises";
import { expect, test } from "../fixtures/ui.fixture";

test("guest language changes immediately, localizes generated output, and resets on reload", async ({ ui }) => {
  await ui.goto();
  await ui.page.locator("#open-settings").click();
  await ui.page.getByTestId("settings-language").selectOption("pl");

  await expect(ui.page.locator("html")).toHaveAttribute("lang", "pl");
  await expect(ui.page.locator("h1")).toHaveText("Wyrzuć z głowy wszystko, co zaprząta Ci myśli.");
  await expect(ui.page.getByTestId("add-task")).toHaveText("Dodaj zadanie");

  await ui.page.getByTestId("close-settings").click();
  await ui.calendar.addTask("Napisać raport");
  await expect(ui.calendar.block(0)).toContainText("ŚREDNI");

  await ui.calendar.openTask(0);
  await ui.taskDetails.exportAgentPrompt();
  await expect(ui.taskDetails.agentExportPrompt()).toHaveValue(/## Zadanie/);
  await expect(ui.taskDetails.agentExportPrompt()).toHaveValue(/## Oczekiwany wynik/);
  await ui.page.getByTestId("close-agent-export").click();
  await ui.page.getByTestId("close-task-details").click();

  await ui.page.locator("#open-settings").click();
  const downloadPromise = ui.page.waitForEvent("download");
  await ui.page.getByTestId("day-report").click();
  const download = await downloadPromise;
  const reportPath = await download.path();
  expect(reportPath).not.toBeNull();
  const report = await readFile(reportPath as string, "utf8");
  expect(report).toContain("Raport dnia Overrun Lite");
  expect(report).toContain("Podsumowanie");
  expect(report).toContain("Plan godzinowy");

  await ui.page.reload();
  await expect(ui.page.locator("html")).toHaveAttribute("lang", "en");
  await expect(ui.page.getByTestId("add-task")).toHaveText("Add task");
});

test("Polish locale is included in local AI requests", async ({ ui }) => {
  let requestedLocale = "";
  await ui.page.route("http://local-ai.test/v1/chat/completions", async (route) => {
    const body = route.request().postDataJSON();
    const userMessage = body.messages.find((message: { role: string }) => message.role === "user");
    requestedLocale = JSON.parse(userMessage.content).locale;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              summary: "Gotowe do sprawdzenia.",
              proposedTasks: [],
              questions: [],
              priorityUpdates: [],
              warnings: [],
            }),
          },
        }],
      }),
    });
  });

  await ui.goto();
  await ui.page.locator("#open-settings").click();
  await ui.page.getByTestId("settings-language").selectOption("pl");
  await ui.page.getByTestId("provider-mode").selectOption("local");
  await ui.page.getByTestId("local-base-url").fill("http://local-ai.test/v1");
  await ui.page.getByTestId("local-model").fill("test-model");
  await ui.page.getByTestId("save-settings").click();
  await ui.page.getByTestId("brain-dump").fill("Zaplanuj raport.");
  await ui.page.getByTestId("analyze-dump").click();

  await expect.poll(() => requestedLocale).toBe("pl");
  await expect(ui.page.getByTestId("review-summary")).toHaveText("Gotowe do sprawdzenia.");
});
