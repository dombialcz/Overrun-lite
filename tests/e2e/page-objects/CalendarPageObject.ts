import type { Locator, Page } from "@playwright/test";
import type { BlockMetrics } from "./types";

export class CalendarPageObject {
  constructor(private readonly page: Page) {}

  get root(): Locator {
    return this.page.getByTestId("calendar");
  }

  get addTaskButton(): Locator {
    return this.page.getByTestId("add-task");
  }

  blocks(): Locator {
    return this.page.getByTestId("calendar-block");
  }

  block(index: number): Locator {
    return this.blocks().nth(index);
  }

  async addTask(): Promise<void> {
    await this.addTaskButton.click();
  }

  async openTask(index: number): Promise<void> {
    await this.block(index).click();
  }

  async blockMetrics(index: number): Promise<BlockMetrics> {
    return this.block(index).evaluate((block) => {
      const rect = block.getBoundingClientRect();
      const grip = block.querySelector<HTMLElement>('[data-testid="resize-handle"]');
      if (!grip) throw new Error("Resize handle not found.");
      const gripRect = grip.getBoundingClientRect();
      return {
        className: block.className,
        gripHeight: Math.round(gripRect.height),
        height: Math.round(rect.height),
        left: Math.round(rect.left),
        overflow: block.scrollHeight > block.clientHeight,
        text: block.textContent?.trim() || "",
        top: Math.round(rect.top),
        width: Math.round(rect.width),
      };
    });
  }

  async moveBlock(index: number, deltaY: number): Promise<void> {
    const block = this.block(index);
    const box = await block.boundingBox();
    if (!box) throw new Error("Calendar block is not visible.");
    const startX = box.x + box.width / 2;
    const startY = box.y + Math.min(20, box.height / 2);
    await this.page.mouse.move(startX, startY);
    await this.page.mouse.down();
    await this.page.mouse.move(startX, startY + deltaY, { steps: 8 });
    await this.page.mouse.up();
  }

  async resizeBlock(index: number, deltaY: number): Promise<void> {
    const grip = this.block(index).getByTestId("resize-handle");
    const box = await grip.boundingBox();
    if (!box) throw new Error("Resize handle is not visible.");
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    await this.page.mouse.move(startX, startY);
    await this.page.mouse.down();
    await this.page.mouse.move(startX, startY + deltaY, { steps: 6 });
    await this.page.mouse.up();
  }
}
