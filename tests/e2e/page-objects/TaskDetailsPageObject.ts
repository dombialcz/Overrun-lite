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
