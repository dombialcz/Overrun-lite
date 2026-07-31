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

  async openNewTask(): Promise<void> {
    await this.addTaskButton.click();
  }

  async addTask(title = "New task"): Promise<void> {
    await this.openNewTask();
    await this.page.getByTestId("detail-task-title").fill(title);
    await this.page.getByTestId("save-task-editor").click();
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

  async mobileGridMetrics(): Promise<{
    calendarRight: number;
    clientWidth: number;
    firstLabelLeft: number;
    firstLabelTop: number;
    gridColumnCount: number;
    labelHeight: number;
    labelVerticalGap: number;
    scrollWidth: number;
    secondLabelLeft: number;
    secondLabelTop: number;
  }> {
    return this.root.evaluate((calendar) => {
      const grid = calendar.querySelector<HTMLElement>(".calendar-grid");
      const labels = Array.from(calendar.querySelectorAll<HTMLElement>(".time-labels span"));
      const day = calendar.querySelector<HTMLElement>(".calendar-day");
      if (!grid || labels.length < 2 || !day) {
        throw new Error("Calendar grid metrics target not found.");
      }

      const first = labels[0].getBoundingClientRect();
      const second = labels[1].getBoundingClientRect();
      const dayRect = day.getBoundingClientRect();
      const documentElement = document.documentElement;
      const gridColumns = getComputedStyle(grid).gridTemplateColumns
        .split(" ")
        .filter(Boolean);

      return {
        calendarRight: Math.round(dayRect.right),
        clientWidth: documentElement.clientWidth,
        firstLabelLeft: Math.round(first.left),
        firstLabelTop: Math.round(first.top),
        gridColumnCount: gridColumns.length,
        labelHeight: Math.round(first.height),
        labelVerticalGap: Math.round(second.top - first.top),
        scrollWidth: documentElement.scrollWidth,
        secondLabelLeft: Math.round(second.left),
        secondLabelTop: Math.round(second.top),
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
