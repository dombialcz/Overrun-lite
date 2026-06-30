import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { expect, test } from "../fixtures/ui.fixture";

test.beforeEach(async ({ ui }) => {
  await ui.goto();
  await ui.resetState();
});

async function readDownloadText(download: { path(): Promise<string | null> }): Promise<string> {
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error("Download path was not available.");
  return fs.readFile(downloadPath, "utf8");
}

async function writeImportFile(name: string, payload: unknown): Promise<string> {
  const filePath = path.join(os.tmpdir(), `${name}-${Date.now()}.json`);
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2));
  return filePath;
}

test("backlog export downloads versioned JSON with task progress", async ({ ui }) => {
  await ui.page.evaluate(() => {
    localStorage.setItem("overrun_lite_state", JSON.stringify({
      tasks: [],
      backlog: [
        {
          id: "backlog-export-1",
          name: "Exportable backlog item",
          minutes: 50,
          type: "task",
          startMinutes: 0,
          hasExplicitStart: true,
          elapsedMinutes: 20,
          completed: false,
          priorityScore: 75,
          priorityReason: "Important follow-up.",
          urgency: 4,
          impact: 5,
          subtasks: [
            { id: "sub-1", title: "Completed part", minutes: 15, completed: true },
          ],
        },
      ],
    }));
  });
  await ui.page.reload();

  const download = await ui.footerActions.exportBacklog();
  expect(download.suggestedFilename()).toBe("overrun_backlog.json");

  const payload = JSON.parse(await readDownloadText(download));
  expect(payload.type).toBe("overrun_backlog_export");
  expect(payload.version).toBe(1);
  expect(payload.backlog).toHaveLength(1);
  expect(payload.backlog[0]).toMatchObject({
    name: "Exportable backlog item",
    elapsedMinutes: 20,
    completed: false,
    priorityScore: 75,
  });
  expect(payload.backlog[0].subtasks[0]).toMatchObject({ title: "Completed part", completed: true });
});

test("backlog import accepts versioned exports incrementally and skips duplicates", async ({ ui }) => {
  await ui.page.evaluate(() => {
    localStorage.setItem("overrun_lite_state", JSON.stringify({
      tasks: [],
      backlog: [
        {
          id: "existing-backlog",
          name: "Existing backlog item",
          minutes: 30,
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
      ],
    }));
  });
  await ui.page.reload();

  const filePath = await writeImportFile("backlog-import", {
    type: "overrun_backlog_export",
    version: 1,
    exportedAt: "2026-06-30T10:00:00.000Z",
    backlog: [
      { id: "dupe", name: "Existing backlog item", minutes: 30, subtasks: [] },
      { id: "new", name: "Imported backlog item", minutes: 45, priorityScore: 90, subtasks: [] },
    ],
  });

  await ui.footerActions.importBacklog(filePath);
  await expect(ui.backlog.items()).toHaveCount(2);
  await expect(ui.backlog.root).toContainText("Imported backlog item");
  await expect(ui.page.getByTestId("ai-status")).toHaveText("1 backlog item imported. 1 duplicate skipped.");
});

test("day snapshot import preserves completed and partial progress in backlog", async ({ ui }) => {
  const filePath = await writeImportFile("day-snapshot-import", {
    type: "overrun_day_snapshot",
    version: 1,
    exportedAt: "2026-06-30T18:00:00.000Z",
    date: "2026-06-30",
    tasks: [
      {
        id: "done-task",
        name: "Finished client report",
        minutes: 60,
        type: "task",
        startMinutes: 60,
        hasExplicitStart: true,
        elapsedMinutes: 60,
        completed: true,
        priorityScore: 80,
        urgency: 4,
        impact: 4,
        subtasks: [{ id: "done-sub", title: "Send report", minutes: 10, completed: true }],
      },
      {
        id: "partial-task",
        name: "Partly done migration",
        minutes: 90,
        type: "task",
        startMinutes: 150,
        hasExplicitStart: true,
        elapsedMinutes: 35,
        completed: false,
        priorityScore: 70,
        urgency: 3,
        impact: 5,
        subtasks: [],
      },
    ],
    backlog: [
      { id: "snapshot-backlog", name: "Snapshot backlog follow-up", minutes: 25, subtasks: [] },
    ],
  });

  await ui.footerActions.importBacklog(filePath);
  await expect(ui.backlog.items()).toHaveCount(3);

  const stored = await ui.page.evaluate(() =>
    JSON.parse(localStorage.getItem("overrun_lite_state") || "{}")
  );
  const done = stored.backlog.find((task: { name: string }) => task.name === "Finished client report");
  const partial = stored.backlog.find((task: { name: string }) => task.name === "Partly done migration");
  expect(done.completed).toBe(true);
  expect(done.elapsedMinutes).toBe(60);
  expect(done.sourceImportId).toBe("done-task");
  expect(partial.completed).toBe(false);
  expect(partial.elapsedMinutes).toBe(35);
  expect(partial.sourceSnapshotId).toBe("2026-06-30T18:00:00.000Z");
});

test("save day exports a full snapshot without mutating state", async ({ ui }) => {
  await ui.page.evaluate(() => {
    localStorage.setItem("overrun_lite_state", JSON.stringify({
      tasks: [
        {
          id: "day-task",
          name: "Write standup notes",
          minutes: 40,
          type: "task",
          startMinutes: 30,
          hasExplicitStart: true,
          elapsedMinutes: 20,
          completed: false,
          priorityScore: 60,
          urgency: 3,
          impact: 3,
          subtasks: [],
        },
      ],
      backlog: [
        { id: "day-backlog", name: "Backlog remains", minutes: 20, subtasks: [] },
      ],
    }));
  });
  await ui.page.reload();

  const before = await ui.page.evaluate(() => localStorage.getItem("overrun_lite_state"));
  const download = await ui.footerActions.saveDay();
  const after = await ui.page.evaluate(() => localStorage.getItem("overrun_lite_state"));
  expect(after).toBe(before);
  expect(download.suggestedFilename()).toBe("overrun_day.json");

  const payload = JSON.parse(await readDownloadText(download));
  expect(payload.type).toBe("overrun_day_snapshot");
  expect(payload.tasks[0].name).toBe("Write standup notes");
  expect(payload.backlog[0].name).toBe("Backlog remains");
  expect(payload.summary).toMatchObject({ plannedMinutes: 40, doneMinutes: 20, taskCount: 1 });
});

test("clear backlog requires checkbox confirmation and preserves day tasks", async ({ ui }) => {
  await ui.page.evaluate(() => {
    localStorage.setItem("overrun_lite_state", JSON.stringify({
      tasks: [
        { id: "day-task", name: "Keep day task", minutes: 30, type: "task", startMinutes: 0, hasExplicitStart: true, subtasks: [] },
      ],
      backlog: [
        { id: "backlog-a", name: "Remove A", minutes: 20, subtasks: [] },
        { id: "backlog-b", name: "Remove B", minutes: 20, subtasks: [] },
      ],
    }));
  });
  await ui.page.reload();
  await expect(ui.backlog.items()).toHaveCount(2);

  await ui.footerActions.openClearBacklog();
  await expect(ui.footerActions.clearBacklogDrawer).toHaveAttribute("aria-hidden", "false");
  await expect(ui.page.getByTestId("confirm-clear-backlog-action")).toBeDisabled();

  await ui.footerActions.confirmClearBacklog();
  await expect(ui.footerActions.clearBacklogDrawer).toHaveAttribute("aria-hidden", "true");
  await expect(ui.backlog.items()).toHaveCount(0);
  await expect(ui.calendar.blocks()).toHaveCount(1);
  await expect(ui.page.getByTestId("ai-status")).toHaveText("2 backlog items cleared.");
});

test("day report downloads hour-by-hour plain text", async ({ ui }) => {
  await ui.page.evaluate(() => {
    localStorage.setItem("overrun_lite_state", JSON.stringify({
      tasks: [
        {
          id: "report-task-1",
          name: "Implement export flow",
          minutes: 60,
          type: "task",
          startMinutes: 60,
          hasExplicitStart: true,
          elapsedMinutes: 60,
          completed: true,
          priorityScore: 80,
          priorityReason: "Needed for timesheets.",
          urgency: 4,
          impact: 4,
          subtasks: [
            { id: "sub-1", title: "Write import tests", minutes: 20, completed: true },
          ],
        },
        {
          id: "report-task-2",
          name: "Review backlog import",
          minutes: 45,
          type: "task",
          startMinutes: 150,
          hasExplicitStart: true,
          elapsedMinutes: 15,
          completed: false,
          priorityScore: 60,
          urgency: 3,
          impact: 3,
          subtasks: [],
        },
      ],
      backlog: [],
    }));
  });
  await ui.page.reload();

  const download = await ui.footerActions.dayReport();
  expect(download.suggestedFilename()).toBe("overrun_day_report.txt");
  const report = await readDownloadText(download);
  expect(report).toContain("Totals");
  expect(report).toContain("Planned: 1h 45m");
  expect(report).toContain("Done: 1h 15m");
  expect(report).toContain("09:00-10:00 | Implement export flow");
  expect(report).toContain("10:30-11:15 | Review backlog import");
  expect(report).toContain("completed subtasks: Write import tests");
  expect(report).toContain("Needed for timesheets.");
});

test("Google Calendar controls are removed", async ({ ui }) => {
  await expect(ui.page.getByTestId("import-google-calendar")).toHaveCount(0);
  await ui.page.getByRole("button", { name: "Settings" }).click();
  await expect(ui.page.getByTestId("google-client-id")).toHaveCount(0);
  expect(ui.consoleErrors).toEqual([]);
});
