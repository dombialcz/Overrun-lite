import type { Locator, Page } from "@playwright/test";
import type { LocalProviderConfig } from "./types";

export class SettingsPageObject {
  constructor(private readonly page: Page) {}

  get drawer(): Locator {
    return this.page.getByTestId("settings-drawer");
  }

  async useLocalProvider(config: LocalProviderConfig): Promise<void> {
    await this.page.getByRole("button", { name: "Settings" }).click();
    await this.page.getByTestId("provider-mode").selectOption("local");
    await this.page.getByTestId("local-base-url").fill(config.baseUrl);
    await this.page.getByTestId("local-model").fill(config.model);
    if (config.apiKey) {
      await this.page.getByTestId("local-api-key").fill(config.apiKey);
    }
    await this.page.getByTestId("save-settings").click();
  }

  async setGoogleClientId(clientId: string): Promise<void> {
    await this.page.getByRole("button", { name: "Settings" }).click();
    await this.page.getByTestId("google-client-id").fill(clientId);
    await this.page.getByTestId("save-settings").click();
  }
}
