import type { Locator, Page } from "@playwright/test";

export class AiReviewPageObject {
  constructor(private readonly page: Page) {}

  get drawer(): Locator {
    return this.page.getByTestId("ai-review-drawer");
  }

  async apply(): Promise<void> {
    await this.page.getByTestId("apply-review").click();
  }
}
