import type { Page } from "@playwright/test";
import { AiReviewPageObject } from "./AiReviewPageObject";
import { BacklogPageObject } from "./BacklogPageObject";
import { CalendarPageObject } from "./CalendarPageObject";
import { GoogleImportPageObject } from "./GoogleImportPageObject";
import { InboxPageObject } from "./InboxPageObject";
import { SettingsPageObject } from "./SettingsPageObject";
import { TaskDetailsPageObject } from "./TaskDetailsPageObject";

const STORAGE_KEYS = [
  "overrun_lite_state",
  "overrun_lite_id_counter",
  "overrun_lite_ai_settings",
  "overrun_lite_review_draft",
];

export class AppUi {
  readonly consoleErrors: string[] = [];

  #aiReview?: AiReviewPageObject;
  #backlog?: BacklogPageObject;
  #calendar?: CalendarPageObject;
  #googleImport?: GoogleImportPageObject;
  #inbox?: InboxPageObject;
  #settings?: SettingsPageObject;
  #taskDetails?: TaskDetailsPageObject;

  constructor(readonly page: Page) {
    page.on("console", (message) => {
      if (message.type() === "error") {
        this.consoleErrors.push(message.text());
      }
    });
    page.on("pageerror", (error) => {
      this.consoleErrors.push(error.message);
    });
  }

  get aiReview(): AiReviewPageObject {
    return (this.#aiReview ??= new AiReviewPageObject(this.page));
  }

  get backlog(): BacklogPageObject {
    return (this.#backlog ??= new BacklogPageObject(this.page));
  }

  get calendar(): CalendarPageObject {
    return (this.#calendar ??= new CalendarPageObject(this.page));
  }

  get googleImport(): GoogleImportPageObject {
    return (this.#googleImport ??= new GoogleImportPageObject(this.page));
  }

  get inbox(): InboxPageObject {
    return (this.#inbox ??= new InboxPageObject(this.page));
  }

  get settings(): SettingsPageObject {
    return (this.#settings ??= new SettingsPageObject(this.page));
  }

  get taskDetails(): TaskDetailsPageObject {
    return (this.#taskDetails ??= new TaskDetailsPageObject(this.page));
  }

  async goto(): Promise<void> {
    await this.page.goto("/index.html");
  }

  async resetState(): Promise<void> {
    await this.page.evaluate((keys) => {
      keys.forEach((key) => localStorage.removeItem(key));
    }, STORAGE_KEYS);
    await this.page.reload();
  }
}
