import type { Locator, Page } from "@playwright/test";

export class GoogleImportPageObject {
  constructor(private readonly page: Page) {}

  get drawer(): Locator {
    return this.page.getByTestId("google-import-drawer");
  }

  events(): Locator {
    return this.page.getByTestId("google-import-event");
  }

  async import(): Promise<void> {
    await this.page.getByTestId("import-google-calendar").click();
  }

  async apply(): Promise<void> {
    await this.page.getByTestId("apply-google-import").click();
  }
}
