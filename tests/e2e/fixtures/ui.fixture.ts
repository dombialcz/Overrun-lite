import { test as base, expect } from "@playwright/test";
import { AppUi } from "../page-objects/AppUi";

type UiFixture = {
  ui: AppUi;
};

const test = base.extend<UiFixture>({
  ui: async ({ page }, use) => {
    const ui = new AppUi(page);
    await use(ui);
  },
});

export { expect, test };
