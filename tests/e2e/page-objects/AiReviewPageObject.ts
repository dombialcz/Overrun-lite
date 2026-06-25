import type { Locator, Page } from "@playwright/test";

export class AiReviewPageObject {
  constructor(private readonly page: Page) {}

  get drawer(): Locator {
    return this.page.getByTestId("ai-review-drawer");
  }

  get heading(): Locator {
    return this.page.getByTestId("review-heading");
  }

  breakdownSubtasks(): Locator {
    return this.page.getByTestId("breakdown-subtask");
  }

  async editBreakdownSubtask(index: number, title: string, minutes: number): Promise<void> {
    const subtask = this.breakdownSubtasks().nth(index);
    await subtask.getByTestId("breakdown-subtask-title").fill(title);
    await subtask.getByTestId("breakdown-subtask-minutes").fill(String(minutes));
  }

  async removeBreakdownSubtask(index: number): Promise<void> {
    await this.breakdownSubtasks().nth(index).getByRole("button", { name: "Remove" }).click();
  }

  async addBreakdownSubtask(): Promise<void> {
    await this.page.getByTestId("add-breakdown-subtask").click();
  }

  async apply(): Promise<void> {
    await this.page.getByTestId("apply-review").click();
  }
}
