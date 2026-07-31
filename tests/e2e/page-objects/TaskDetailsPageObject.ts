import type { Locator, Page } from "@playwright/test";

export class TaskDetailsPageObject {
  constructor(private readonly page: Page) {}

  get drawer(): Locator {
    return this.page.getByTestId("task-details-drawer");
  }

  async setDuration(minutes: number): Promise<void> {
    await this.page.getByTestId("detail-task-duration").fill(String(minutes));
  }

  async setStartTime(time: string): Promise<void> {
    await this.page.getByTestId("detail-task-start").fill(time);
  }

  async setProgress(minutes: number): Promise<void> {
    await this.page.getByTestId("detail-task-progress").fill(String(minutes));
  }

  async markDone(): Promise<void> {
    await this.page.getByTestId("detail-toggle-done").click();
  }

  async requestBreakdown(options: {
    instructions?: string;
    granularity?: "small" | "medium" | "large";
    applyMode?: "append" | "replace";
  } = {}): Promise<void> {
    if (options.instructions !== undefined) {
      await this.page.getByTestId("detail-breakdown-instructions").fill(options.instructions);
    }
    if (options.granularity) {
      await this.page.getByTestId("detail-breakdown-granularity").selectOption(options.granularity);
    }
    if (options.applyMode) {
      await this.page.getByTestId("detail-breakdown-apply-mode").selectOption(options.applyMode);
    }
    await this.page.getByTestId("detail-breakdown-ai").click();
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
