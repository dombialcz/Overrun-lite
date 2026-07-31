import type { Locator, Page } from "@playwright/test";

export class BacklogPageObject {
  constructor(private readonly page: Page) {}

  get root(): Locator {
    return this.page.getByTestId("backlog");
  }

  items(): Locator {
    return this.page.getByTestId("backlog-item");
  }

  get doneSection(): Locator {
    return this.page.getByTestId("done-backlog");
  }

  get doneToggle(): Locator {
    return this.page.getByTestId("done-backlog-toggle");
  }

  doneItems(): Locator {
    return this.page.getByTestId("done-backlog-item");
  }
}
