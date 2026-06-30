import type { Download, Locator, Page } from "@playwright/test";

export class FooterActionsPageObject {
  constructor(private readonly page: Page) {}

  get clearBacklogDrawer(): Locator {
    return this.page.getByTestId("clear-backlog-drawer");
  }

  async exportBacklog(): Promise<Download> {
    const download = this.page.waitForEvent("download");
    await this.page.getByRole("button", { name: "Export backlog" }).click();
    return download;
  }

  async saveDay(): Promise<Download> {
    const download = this.page.waitForEvent("download");
    await this.page.getByRole("button", { name: "Save the day" }).click();
    return download;
  }

  async dayReport(): Promise<Download> {
    const download = this.page.waitForEvent("download");
    await this.page.getByTestId("day-report").click();
    return download;
  }

  async importBacklog(filePath: string): Promise<void> {
    await this.page.getByRole("button", { name: "Import backlog" }).click();
    await this.page.locator("#backlog-file").setInputFiles(filePath);
  }

  async openClearBacklog(): Promise<void> {
    await this.page.getByTestId("clear-backlog").click();
  }

  async confirmClearBacklog(): Promise<void> {
    await this.page.getByTestId("confirm-clear-backlog").check();
    await this.page.getByTestId("confirm-clear-backlog-action").click();
  }
}
