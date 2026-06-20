import type { Locator, Page } from "@playwright/test";

export class InboxPageObject {
  constructor(private readonly page: Page) {}

  get root(): Locator {
    return this.page.getByTestId("inbox");
  }

  async fillDump(text: string): Promise<void> {
    await this.page.getByTestId("brain-dump").fill(text);
  }
}
