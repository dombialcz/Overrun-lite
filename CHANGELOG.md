# Changelog

All notable changes to Overrun Lite are documented here.

---

## [Unreleased]

### Added
- **GitHub Pages deployment** — project is now live at https://dombialcz.github.io/Overrun-lite/
- **AI task breakdown** — selected tasks can now request AI-proposed subtasks with compact instructions, granularity, append/replace controls, and review-before-apply.
- **AI contract tests** — added fast Node tests for planner and breakdown parsing/normalization behavior.
- **Local LLM eval notes** — documented open questions for a future real local-model evaluation harness.
- **Manual local LLM eval** — added an advisory command for checking whether a running local model returns parseable task-breakdown output.
- **Eval response inspection** — local LLM evals now show raw response excerpts, can save failed raw outputs, and can emit JSON reports.
- **Versioned planner exports** — backlog and day exports now use explicit JSON envelopes and day snapshots preserve task progress.
- **Day report export** — added a plain text hour-by-hour report for timesheets and standup notes.
- **Clear backlog confirmation** — added an explicit checkbox-confirmed workflow for clearing only backlog items.

### Changed
- **Backlog import** — imports are incremental, accept day snapshots and legacy arrays, and skip duplicates.
- **Google Calendar import removed** — Google Calendar import controls and OAuth settings were removed from the app.
- **Priority labels** — priority score (1–100) is now displayed as a human-readable label everywhere: `LOW` (1–25), `MEDIUM` (26–50), `HIGH` (51–75), `CRITICAL` (76–100). The task details drawer now shows a select dropdown instead of a number input.
- **Completed task colour** — completed calendar blocks now turn green instead of dimming.
- **Active timer colour + animation** — clicking Start on a task turns its calendar block yellow with a repeating pulse animation so it is easy to spot at a glance.
- **Close drawer on Start / Split** — clicking the Start timer button or the Split button in the task details drawer now closes the drawer automatically, returning focus to the calendar.
- **Brain dump character limit** — the brain dump textarea is capped at 1 800 characters. A live counter (`X / 1800`) is shown below the field and turns orange when approaching the limit.
- **AI thinking overlay** — while the AI is analysing a brain dump, a 50 % translucent overlay covers the screen with an animated "Thinking…" message and a "DO NOT CLOSE THIS TAB" notice.
- **Subtask progress tint** — as subtasks are completed the calendar block's background gradually shifts toward green proportional to progress (e.g. 2 of 4 subtasks done → 50 % green tint).
- **Drag column stability fix** — when three or more tasks occupy the same hour, dragging any one of them no longer causes it to jump to a different column mid-drag. The block's lane position is now locked for the duration of the drag gesture.
- **Overlap layout regressions** — fixed edge cases where partially overlapping tasks could overflow, stack on top of each other, or change columns depending on localStorage order.
- **Incidental overlap display** — short overlaps now stay full-width with a small visual offset instead of forcing cramped narrow columns.
- **Stable active drag lanes** — while dragging a task, its column is preserved as long as it still overlaps the original task group, avoiding left-column teleporting when crossing another task's start time.
- **Three-column overlap cap** — dragging is now blocked from creating a fourth simultaneous overlap column, keeping the calendar readable during temporary scheduling conflicts.
- **Calendar regression tests** — added Playwright coverage for storage-order-independent lanes, incidental overlaps, stable drag lanes, and the three-column drag lock.

---

## [4747603] — 2026-06-21

### Changed
- Refined AI planner scheduling logic and local AI provider support.
- Extended Playwright E2E coverage for calendar UI interactions and settings.

---

## [47fc8cd]

### Added / Changed
- Improved planner task scheduling and local OpenAI-compatible AI support.

---

## [b045f60]

### Added
- AI planner UI with brain dump inbox, review drawer, and proposed task workflow.
- Playwright E2E test suite.

---

## [638ed17]

### Added
- Vercel deployment configuration.

---

## [fb00dce]

### Added
- Initial commit — core calendar day-view, backlog, task timer, drag-to-resize, and local state persistence.
