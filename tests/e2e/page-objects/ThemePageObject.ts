import type { Locator, Page } from "@playwright/test";

export class ThemePageObject {
  constructor(private readonly page: Page) {}

  get toggle(): Locator {
    return this.page.getByTestId("theme-toggle");
  }

  async current(): Promise<string | null> {
    return this.page.locator("html").getAttribute("data-theme");
  }

  async saved(): Promise<string | null> {
    return this.page.evaluate(() => localStorage.getItem("overrun_lite_theme"));
  }

  async switch(): Promise<void> {
    await this.toggle.click();
  }
}
