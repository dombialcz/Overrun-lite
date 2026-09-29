const assert = require("node:assert/strict");
const test = require("node:test");

const i18n = require("../../i18n");

test.afterEach(() => i18n.setLocale("en"));

test("English is the default and unsupported locales fall back to English", () => {
  assert.equal(i18n.getLocale(), "en");
  assert.equal(i18n.t("Settings"), "Settings");
  assert.equal(
    i18n.plural("ai.existingTasksSkipped", 1),
    "1 existing task was returned by AI and skipped."
  );
  assert.match(i18n.plural("ai.overflowTasks", 2), /2 tasks were kept in the backlog/);
  assert.equal(i18n.normalizeLocale("de"), "en");
  assert.equal(i18n.setLocale("de"), "en");
});

test("English and Polish catalogs contain the same message keys", () => {
  assert.deepEqual(
    Object.keys(i18n.catalogs.en).sort(),
    Object.keys(i18n.catalogs.pl).sort()
  );
});

test("Polish translations interpolate values and use Polish plural categories", () => {
  i18n.setLocale("pl");
  assert.equal(i18n.t("Settings"), "Ustawienia");
  assert.equal(i18n.t("{duration} planned", { duration: "2 godz. 5 min" }), "Zaplanowano 2 godz. 5 min");
  assert.equal(i18n.plural("review.proposedSteps", 1), "1 proponowany krok");
  assert.equal(i18n.plural("review.proposedSteps", 2), "2 proponowane kroki");
  assert.equal(i18n.plural("review.proposedSteps", 5), "5 proponowanych kroków");
});
