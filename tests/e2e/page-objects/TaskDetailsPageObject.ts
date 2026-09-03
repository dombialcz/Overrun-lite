import type { Locator, Page } from "@playwright/test";

export class TaskDetailsPageObject {
  constructor(private readonly page: Page) {}

  get drawer(): Locator {
    return this.page.getByTestId("task-details-drawer");
  }

  async setDuration(minutes: number): Promise<void> {
    await this.page.getByTestId("detail-task-duration").fill(String(minutes));
    await this.save();
  }

  async setStartTime(time: string): Promise<void> {
    await this.page.getByTestId("detail-task-start").fill(time);
    await this.save();
  }

  async setProgress(minutes: number): Promise<void> {
    await this.page.getByTestId("detail-advanced").locator("summary").click();
    await this.page.getByTestId("detail-task-progress").fill(String(minutes));
    await this.save();
  }

  async markDone(): Promise<void> {
    await this.page.getByTestId("detail-toggle-done").click();
  }

  async requestBreakdown(options: {
    instructions?: string;
    granularity?: "small" | "medium" | "large";
    applyMode?: "append" | "replace";
  } = {}): Promise<void> {
    await this.page.getByTestId("detail-ai-section").locator("summary").click();
    if (options.instructions !== undefined) {
      await this.page.getByTestId("detail-breakdown-instructions").fill(options.instructions);
    }
    if (options.granularity) {
      await this.page.getByTestId("detail-breakdown-granularity").selectOption(options.granularity);
    }
    await this.page.getByTestId("detail-breakdown-ai").click();
    if (options.applyMode) {
      await this.page.getByTestId("review-breakdown-apply-mode").selectOption(options.applyMode);
    }
  }

  async exportAgentPrompt(): Promise<void> {
    await this.page.getByTestId("detail-export-agent").click();
  }

  agentExportDrawer(): Locator {
    return this.page.getByTestId("agent-export-drawer");
  }

  agentExportPrompt(): Locator {
    return this.page.getByTestId("agent-export-prompt");
  }

  subtasks(): Locator {
    return this.page.getByTestId("detail-subtasks").locator(".detail-subtask-row");
  }

  async addSubtask(title: string, minutes = 25): Promise<void> {
    await this.page.getByTestId("detail-add-subtask").click();
    const row = this.subtasks().last();
    await row.getByTestId("detail-subtask-title").fill(title);
    await row.getByTestId("detail-subtask-minutes").fill(String(minutes));
  }

  async save(): Promise<void> {
    await this.page.getByTestId("save-task-editor").click();
  }

  async cancel(): Promise<void> {
    await this.page.getByTestId("cancel-task-editor").click();
  }

  async splitInto(count: number): Promise<void> {
    this.page.once("dialog", async (dialog) => {
      await dialog.accept(String(count));
    });
    await this.page.getByTestId("detail-split").click();
  }

  async close(): Promise<void> {
    await this.page.getByTestId("close-task-details").click();
  }
}
