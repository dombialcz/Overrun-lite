import type { Download, Locator, Page } from "@playwright/test";

export class DataActionsPageObject {
  constructor(private readonly page: Page) {}

  get clearBacklogDrawer(): Locator {
    return this.page.getByTestId("clear-backlog-drawer");
  }

  get root(): Locator {
    return this.page.getByTestId("data-actions");
  }

  async open(): Promise<void> {
    const drawer = this.page.getByTestId("settings-drawer");
    if (await drawer.getAttribute("aria-hidden") === "true") {
      await this.page.getByRole("button", { name: "Settings" }).click();
    }
  }

  async exportBacklog(): Promise<Download> {
    await this.open();
    const download = this.page.waitForEvent("download");
    await this.page.getByRole("button", { name: "Export backlog" }).click();
    return download;
  }

  async exportDaySnapshot(): Promise<Download> {
    await this.open();
    const download = this.page.waitForEvent("download");
    await this.page.getByRole("button", { name: "Export day snapshot" }).click();
    return download;
  }

  async exportDayReport(): Promise<Download> {
    await this.open();
    const download = this.page.waitForEvent("download");
    await this.page.getByTestId("day-report").click();
    return download;
  }

  async importBacklog(filePath: string): Promise<void> {
    await this.open();
    await this.page.getByRole("button", { name: "Import backlog" }).click();
    await this.page.locator("#backlog-file").setInputFiles(filePath);
  }

  async openClearBacklog(): Promise<void> {
    await this.open();
    await this.page.getByTestId("clear-backlog").click();
  }

  async confirmClearBacklog(): Promise<void> {
    await this.page.getByTestId("confirm-clear-backlog").check();
    await this.page.getByTestId("confirm-clear-backlog-action").click();
  }
}
