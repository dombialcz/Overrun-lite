import { expect, test } from "../fixtures/ui.fixture";

type ThemeColors = Record<string, string>;

const CONTRAST_PAIRS = [
  ["ink", "bg"],
  ["muted", "panel-solid"],
  ["primary-ink", "primary-bg"],
  ["attention-ink", "attention-bg"],
  ["inbox-ink", "inbox-bg-edge"],
  ["inbox-muted", "inbox-bg-edge"],
  ["inbox-action-ink", "inbox-action-bg"],
  ["task-block-ink", "task-block-bg-edge"],
  ["task-block-muted", "task-block-bg-edge"],
  ["success-ink", "surface-success"],
  ["danger-ink", "danger-bg"],
  ["notice-ink", "notice-bg"],
  ["overlap-chip-ink", "overlap-chip-bg"],
] as const;

test.beforeEach(async ({ ui }) => {
  await ui.goto();
  await ui.resetState();
});

test("follows system theme until the user saves a preference", async ({ ui }) => {
  await ui.page.emulateMedia({ colorScheme: "dark" });
  await ui.page.evaluate(() => localStorage.removeItem("overrun_lite_theme"));
  await ui.page.reload();

  await expect(ui.page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(ui.theme.toggle).toHaveText("Light theme");
  expect(await ui.theme.saved()).toBeNull();

  await ui.page.emulateMedia({ colorScheme: "light" });
  await expect(ui.page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(ui.theme.toggle).toHaveText("Dark theme");
  expect(await ui.theme.saved()).toBeNull();
});

test("theme toggle saves an explicit browser preference across reloads", async ({ ui }) => {
  await ui.page.emulateMedia({ colorScheme: "light" });
  await ui.page.evaluate(() => localStorage.removeItem("overrun_lite_theme"));
  await ui.page.reload();

  await ui.theme.switch();
  await expect(ui.page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await ui.theme.saved()).toBe("dark");

  await ui.page.reload();
  await expect(ui.page.locator("html")).toHaveAttribute("data-theme", "dark");
  await ui.theme.switch();
  await expect(ui.page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await ui.theme.saved()).toBe("light");
});

test("theme preference survives planner changes and AI settings cleanup", async ({ ui }) => {
  await ui.page.evaluate(() => localStorage.setItem("overrun_lite_theme", "dark"));
  await ui.page.reload();
  await ui.calendar.addTask();
  await ui.settings.useLocalProvider({
    baseUrl: "http://local-ai.test/v1",
    model: "test-model",
    apiKey: "temporary-key",
  });
  await ui.settings.clearLocalSettings();

  expect(await ui.theme.saved()).toBe("dark");
  await expect(ui.page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(ui.calendar.blocks()).toHaveCount(1);
});

test("light and dark semantic text pairs meet WCAG AA contrast", async ({ ui }) => {
  for (const theme of ["light", "dark"] as const) {
    await ui.page.evaluate((nextTheme) => localStorage.setItem("overrun_lite_theme", nextTheme), theme);
    await ui.page.reload();
    const colors = await readThemeColors(ui.page);

    for (const [foreground, background] of CONTRAST_PAIRS) {
      expect(
        contrastRatio(colors[foreground], colors[background]),
        `${theme} ${foreground} on ${background}`
      ).toBeGreaterThanOrEqual(4.5);
    }
  }
});

test("mobile header stays compact and keeps every utility on screen", async ({ ui }) => {
  await ui.page.setViewportSize({ width: 390, height: 844 });
  const metrics = await ui.page.evaluate(() => {
    const header = document.querySelector<HTMLElement>(".topbar");
    const inbox = document.querySelector<HTMLElement>(".inbox-shell");
    const utilities = Array.from(document.querySelectorAll<HTMLElement>(".utility-actions > *"))
      .filter((element) => !element.classList.contains("hidden"))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, visible: rect.width > 0 && rect.height > 0 };
      });
    if (!header || !inbox) throw new Error("Header metrics target not found.");
    return {
      clientWidth: document.documentElement.clientWidth,
      inboxTop: Math.round(inbox.getBoundingClientRect().top),
      scrollWidth: document.documentElement.scrollWidth,
      utilities,
    };
  });

  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
  expect(metrics.inboxTop).toBeLessThanOrEqual(240);
  expect(metrics.utilities.every((item) => item.visible)).toBe(true);
  expect(metrics.utilities.every((item) => item.left >= 0 && item.right <= metrics.clientWidth)).toBe(true);
});

async function readThemeColors(page: import("@playwright/test").Page): Promise<ThemeColors> {
  const names = Array.from(new Set(CONTRAST_PAIRS.flat()));
  return page.evaluate((variableNames) => {
    const styles = getComputedStyle(document.documentElement);
    return Object.fromEntries(variableNames.map((name) => [name, styles.getPropertyValue(`--${name}`).trim()]));
  }, names);
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const light = Math.max(foregroundLuminance, backgroundLuminance);
  const dark = Math.min(foregroundLuminance, backgroundLuminance);
  return (light + 0.05) / (dark + 0.05);
}

function relativeLuminance(color: string): number {
  const normalized = color.slice(1);
  const expanded = normalized.length === 3
    ? normalized.split("").map((channel) => channel + channel).join("")
    : normalized;
  const channels = expanded.match(/.{2}/g)?.map((channel) => Number.parseInt(channel, 16) / 255);
  if (!channels || channels.length !== 3 || channels.some(Number.isNaN)) {
    throw new Error(`Unsupported contrast color: ${color}`);
  }
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}
