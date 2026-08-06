# Changelog

All notable changes to Overrun Lite are documented here.

---

## [Unreleased]

### Added
- **Empty-day AI scheduling** — brain dumps can now propose reviewable day-planner destinations and start times when the calendar is empty, with an eight-hour cap that keeps overflow in the backlog.
- **Scanner-resistant invitation confirmation** — newly generated invite links now open an Overrun confirmation step and consume the one-time Supabase URL only after an explicit user click.
- **Recoverable auth callbacks** — activation and password-reset callbacks preserve credentials for transient retries while expired, invalid, or used links show a dedicated next step instead of falling back to sign-in.
- **Manual subtask editing** — task and meeting drafts can now add, rename, estimate, complete, and remove subtasks without an AI callback, including on open backlog items.
- **Draft-based task creation** — Add task and Add meeting now open a focused editor and persist only after an explicit Create action.
- **Shared backlog editor** — open backlog cards expose a dedicated Edit action without moving the item onto the day calendar.
- **Light and dark themes** — the planner now follows the system theme on first visit, exposes an always-visible toggle, and stores an explicit browser-only preference separately from planner data.
- **Theme and responsive regressions** — Playwright now covers system preference changes, saved theme persistence, contrast tokens, account/settings isolation, and compact mobile header layout.
- **Password recovery** — signed-out users can request a Supabase reset email and securely choose a new password when the recovery link returns to Overrun.
- **Done backlog** — completed day tasks now move immediately into a collapsed, newest-first Done archive and can be restored to the open backlog.
- **Invite-only Supabase accounts** — manually generated, one-time activation links now lead to password setup and persistent multi-device sessions without public sign-up.
- **Conflict-safe cloud sync** — authenticated planner data syncs through revision-checked Supabase state with explicit first-login and concurrent-edit choices.
- **Per-user hosted AI allowances** — Vercel AI requests require a valid Supabase session and atomically enforce a dashboard-editable 10-action Warsaw-day limit.
- **Graceful static guest mode** — GitHub Pages and plain local serving stay local-only without missing configuration or API errors.
- **Account and sync regression coverage** — Playwright now covers login, activation errors, first sync, sign-out isolation, revision conflicts, exhausted allowances, and local-provider override.
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
- **Reliable task timers** — running calendar blocks stay interactive so Pause works, active timers resume after refresh, and sub-minute progress survives pause/restart cycles.
- **Extended day calendar** — the planner now spans 04:00 through 24:00 while preserving existing tasks at their saved clock times.
- **Safer task deletion** — deleting an existing task or meeting from the editor now requires explicit confirmation.
- **Safer invite operations** — `npm run user:invite` now prints only the Overrun wrapper URL, and operator guidance covers fresh-link regeneration plus Supabase `otp_expired`/403 diagnosis.
- **Stable account reconciliation** — first-sync choices now run once when a browser adopts an account; repeated Supabase session confirmations and window focus changes keep using the connected account without reopening the local-versus-cloud prompt.
- **Focused task drawer** — task edits now use Save or Cancel, keep subtasks prominent, fold priority/progress and AI assistance by default, and retain accessible controls on narrow screens.
- **Clear button interaction states** — primary, secondary, and danger buttons now use explicit theme-aware hover colors and washed, variant-specific disabled treatments instead of relying on a barely visible brightness change.
- **Task-first color hierarchy** — light mode returns to flat white and floral-white surfaces with orange tasks as the main color event, while dark mode restores its quieter panels and uses controlled bright-maroon tasks; the inbox now has a theme-specific surface instead of sharing one treatment.
- **More expressive semantic palette** — amethyst carries primary actions, grape supports selection, orange emphasizes light-theme tasks and attention, pale green signals completion, and the brown-red family covers danger, conflicts, and controlled dark-theme task emphasis.
- **Focused planner header** — sync/account utilities, theme, settings, daily totals, and the day timer now have distinct compact rows that reduce top-of-page clutter on narrow screens.
- **Settings data hub** — day and backlog exports, imports, reports, and backlog clearing moved from the distant footer into a labeled Settings section; day export actions now use explicit names.
- **Clearer AI capture flow** — AI usage now appears beside its controls, the inbox helper foregrounds review-before-apply, unavailable sign-in controls are hidden, and Context organize is labeled Organize with current plan.
- **Streamlined AI brain dumps** — capture now favors immediately useful draft tasks, limits optional clarifications to two essential questions, keeps routine prerequisites out of task lists, and reserves detailed decomposition for the task-level “Help me get started” action.
- **Completion flow** — the Done button, full progress, and timer completion now close and archive tasks immediately; backlog export preserves completion timestamps and clearing the backlog preserves Done history.
- **Hosted AI quota reservation** — fixed the atomic daily-usage reservation conflict clause and added sanitized server diagnostics for quota RPC failures.
- **Invite activation callback** — invitation tokens are now consumed explicitly, removed from the address bar immediately, and covered by a token-shaped browser regression test before the password form opens.
- **Secure AI proxy** — `/api/plan` no longer accepts anonymous requests or wildcard origins, keeps provider keys server-side, and returns stable authentication, quota, and availability errors.
- **Collision-resistant IDs** — new task, subtask, and draft IDs use browser UUIDs so independently created device data cannot reuse local counters.
- **Deployment hardening** — added restrictive content security, referrer, MIME-sniffing, frame, and permissions policies; the pinned Supabase browser client is vendored with integrity metadata.
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
