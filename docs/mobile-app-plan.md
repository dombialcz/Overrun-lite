# Mobile App Goal and Implementation Plan

Status: M1 iOS shell scaffolded; Android parity queued\
Last updated: 2026-11-23\
Canonical tracker: this file

## Goal

Ship Overrun Lite as installable iOS and Android applications while preserving
the existing web application, local-first behavior, and review-before-apply AI
workflow.

The mobile applications must let a returning user open, view, and edit their
last synchronized schedule without internet access. Native task reminders must
work offline. Push-to-talk must place a transcript into the existing brain dump
for review; it must not analyze or apply tasks automatically.

## How to use this plan in future agent sessions

1. Read this file and `AGENTS.md` before changing mobile-related code.
2. Select one unchecked work item or one explicitly requested milestone. Do not
   begin a later milestone when an earlier prerequisite is incomplete.
3. Inspect the current implementation before following an old instruction;
   repository behavior and platform requirements may have changed.
4. Keep changes small enough to review. Preserve the vanilla HTML/CSS/JS web
   application and GitHub Pages mode.
5. Add or update automated tests with each behavior change. Test native-only
   behavior on physical devices when the milestone calls for it.
6. Update the checkboxes, status notes, and decision log in this file before
   ending the session. Record blockers without marking work complete.
7. Add user-visible shipped changes to `CHANGELOG.md`.

A useful continuation prompt is:

> Continue the mobile app plan in `docs/mobile-app-plan.md`. Work only on the
> next incomplete item in milestone M__. Verify it, update the tracker and
> decision log, and report remaining risks.

## Product decisions

- Use Capacitor as a native shell around bundled web assets.
- Deliver iOS first. Android tooling and application work are a separate next
  iteration and do not block the iOS beta.
- Keep shared service interfaces platform-neutral so the iOS iteration creates
  a reusable foundation rather than iOS-only feature logic.
- Continue serving the existing web application independently. Ionic UI, React,
  React Native, Flutter, and a full Swift/Kotlin rewrite are not required.
- Bundle the frontend in each application binary; do not make the application a
  remote WebView of the production website.
- Use native capabilities behind small JavaScript service interfaces. Browser
  fallbacks must keep the web application working.
- Local notifications are the first notification feature. Remote APNs/FCM push
  is deferred until there is a concrete server-originated use case.
- The device copy of planner state is the startup source. Network
  reconciliation happens after local state is visible.
- A locally modified, unsynchronized planner document must never be silently
  replaced by a cloud document.
- Push-to-talk produces editable text in the brain dump. Existing AI review and
  Apply controls remain mandatory.
- Hosted transcription may require internet in the first release. Viewing and
  editing the plan, typed brain dumps, and local reminders must not.

## Non-goals for the first mobile release

- Rewriting the interface in a native UI framework.
- Background, always-listening audio or wake-word detection.
- Automatically applying AI output.
- Exact-alarm or critical-alert privileges.
- Remote push notifications without a defined product event.
- Fully offline AI planning or guaranteed offline speech recognition.
- Tablet-specific redesign, widgets, Live Activities, or Wear OS/watchOS apps.

## Target architecture

The shared web application continues to own rendering, task behavior, AI
review, and planner-state normalization. Native services are accessed through a
small platform boundary:

```text
index.html / app.js / cloud.js / aiContract.js
                    |
              platform services
        storage | notifications | speech | links | files
                    |
              Capacitor bridge
             /                \
        iOS/WKWebView     Android WebView
```

Suggested service interfaces:

- `storageService`: initialize, get, set, remove, and flush durable values.
- `notificationService`: request permission, reconcile reminders, cancel, and
  handle a notification tap.
- `speechService`: request microphone permission, start recording, stop,
  transcribe, cancel, and report availability.
- `linkService`: receive activation, recovery, and task deep links.
- `fileService`: export through the native share sheet and import through the
  native document picker.
- `networkService`: report current connectivity and reconnect events.

Each interface needs a browser implementation and may have a native Capacitor
implementation. Application features must call the interface rather than test
for iOS or Android throughout feature code.

## Offline state and synchronization contract

The current app writes planner state to browser storage before scheduling a
cloud save. Mobile work must retain that ordering and add persistent sync
metadata.

Store an envelope equivalent to:

```json
{
  "schemaVersion": 1,
  "planner": { "tasks": [], "backlog": [] },
  "baseRevision": 0,
  "dirty": false,
  "locallyModifiedAt": null,
  "accountId": null
}
```

Required behavior:

1. Initialize native storage before the first planner render.
2. Show the local planner immediately, regardless of connectivity or token
   refresh status.
3. Persist planner content and `dirty: true` before attempting a cloud write.
4. Save with the existing expected-revision server function.
5. After a successful save, update `baseRevision` and clear `dirty`.
6. When local state is clean, a newer cloud revision may replace it.
7. When local state is dirty and the cloud revision equals `baseRevision`, save
   the local document.
8. When local state is dirty and the cloud revision advanced, pause syncing and
   use the existing explicit reload-or-overwrite conflict choice.
9. Preserve dirty state, planner data, and the base revision across process
   termination and device restart.
10. Keep guest storage isolated from every signed-in account cache.

Use Capacitor Preferences for the current small, versioned planner document and
settings during the first release. Put authentication secrets or user-supplied
API keys in Keychain/Keystore-backed secure storage. Reassess SQLite before
adding multi-day history, large attachments, frequent queries, or planner
documents approaching 1 MB.

## Milestones

### M0 — Architecture baseline

- [x] Select a Capacitor hybrid architecture.
- [x] Define offline viewing/editing and local notifications as release
  requirements.
- [x] Defer remote push and offline AI until a concrete use case exists.
- [x] Sequence the work as an iOS release followed by Android parity.
- [x] Record the supported minimum iOS version after checking the Capacitor
  version selected during implementation (iOS 15 for Capacitor 8.5.3).
- [x] Decide the development application ID and display name with the product
  owner (`com.dombialcz.overrunlite` / `Overrun Lite`). Production display-name
  and URL/deep-link domains remain release-hardening decisions; Android's
  minimum version will be recorded during M7.

Exit criteria: architecture and unresolved product identifiers are explicit;
no implementation is implied by completing only this milestone.

### M1 — iOS native-shell spike

- [x] Add a repeatable build step that copies only deployable frontend assets
  into `dist/`; exclude API source, tests, migrations, and secrets.
- [x] Add and pin compatible Capacitor core, CLI, and iOS packages. Do not add
  the Android platform package in this iteration.
- [x] Add `capacitor.config.*` with `webDir: "dist"` and the approved
  development identifiers.
- [x] Generate the iOS project and document its prerequisites.
- [x] Open the bundled application on an iOS simulator (verified with
  `xcrun simctl install` and `xcrun simctl launch`; Capacitor's `cap run`
  deploy helper currently expects a missing Simulator.app path on Xcode 27).
- [ ] Confirm CSP, fonts, Supabase client loading, responsive layout, drawers,
  keyboard behavior, safe-area insets, and iOS navigation behavior. The first
  simulator pass now includes safe-area insets and mobile section ordering;
  runtime configuration/auth verification remains an M2 task.
- [x] Keep the desktop layout as a two-column grid with backlog and day views
  sharing a row, while narrow screens use three swipeable scroll-snap screens
  (brain dump, day schedule, backlog) with floating pagination dots, bottom
  breathing room, and per-screen vertical height.
- [x] Offer Schedule and List tabs for active day items in the shared web and
  mobile UI; default new devices to the timeline, remember the last selected
  view on each device, and order the compact list by scheduled start time.
- [x] Make the mobile task editor a bottom sheet with a visible grabber,
  sticky close/save controls, backdrop dismissal, and swipe-down dismissal;
  keep the desktop drawer behavior unchanged.
- [x] Keep mobile text-entry and select controls at a 16px minimum to prevent
  iOS WebView focus auto-zoom without disabling user-controlled accessibility
  zoom.
- [x] Make task creation validation explicit: show a missing-title message and
  require each subtask title before another subtask can be added or the draft
  can be saved.
- [x] Keep the one-day workflow schedule-focused: remove priority/urgency
  controls and the mobile status strip while retaining legacy saved fields as
  read-only compatibility data during normalization.
- [x] Remove task-level partial progress from the shared data model, editor,
  reports, import/export, sync, and AI context; discard legacy elapsed values
  during normalization while retaining binary Done state and subtask checks.
- [x] Separate mobile schedule gestures: ordinary touch scrolls or swipes,
  while a brief hold arms vertical task movement; desktop mouse drag and the
  resize grip remain direct.
- [x] Prepare the completed shared mobile interface improvements for the
  existing online web release, with contract tests, the full browser suite,
  and the mobile asset build as release checks.
- [ ] Keep the existing static web and Vercel development commands working.

Exit criteria: the iOS shell launches the bundled planner without loading a
remote page, while web tests and static hosting still pass. Android is not
required for this milestone.

### M2 — Runtime configuration, APIs, and authentication

- [ ] Introduce one runtime configuration module for web and native builds.
- [ ] Replace relative `/api/config`, `/api/plan`, and `/api/ai-usage` calls
  with a configured API origin on native builds; retain relative URLs on web.
- [ ] Update server CORS handling with an explicit native-origin allowlist. Do
  not use a wildcard with authenticated endpoints.
- [ ] Replace hostname-based static-host detection with an explicit runtime
  mode.
- [ ] Register Universal Links/App Links, with a custom-scheme fallback if
  necessary.
- [ ] Preserve the scanner-resistant invitation confirmation step.
- [ ] Route activation and password recovery callbacks into the installed app
  when appropriate, with a functioning web fallback.
- [ ] Verify Supabase session refresh after foreground/background transitions.
- [ ] Verify sign-out removes account credentials without deleting unrelated
  guest or other-account planner data.

Exit criteria: sign-in, invitation activation, password recovery, hosted AI,
and account sync work on a physical iOS device and on the web.

### M3 — Durable offline-first storage and sync

- [ ] Add the storage service with browser and native implementations.
- [ ] Migrate existing browser/WebView keys without destroying the source data
  until the new copy has been verified.
- [ ] Add the versioned state envelope and schema migration mechanism.
- [ ] Persist the dirty flag, base revision, and local modification time.
- [ ] Change startup to render the cached planner before network
  reconciliation.
- [ ] Prevent a returning account's clean cloud load from overwriting dirty
  offline state.
- [ ] Retry dirty state on reconnect, app foregrounding, and next launch.
- [ ] Reuse the existing explicit cloud-versus-local conflict UI.
- [ ] Add a visible `Offline`, `Unsynced`, `Saving`, `Synced`, or `Conflict`
  state without blocking planning.
- [ ] Add tests for offline launch, offline edits, process termination, later
  reconnect, same-revision save, advanced-revision conflict, and account
  isolation.

Exit criteria: a user can edit offline, terminate the app, reopen it, and later
sync without losing local work or silently overwriting concurrent cloud work.

### M4 — Local task reminders

- [ ] Define the first-release reminder model: current-day tasks, one optional
  offset from start time, and no exact-alarm requirement.
- [ ] Add reminder controls to the task-details drawer, not calendar blocks.
- [ ] Request notification permission only after an explanatory user action.
- [ ] Map task identifiers to stable platform-compatible notification IDs.
- [ ] Reconcile pending notifications after task edits, deletion, backlog/day
  moves, imports, sync, timezone changes, and app launch.
- [ ] Cancel obsolete notifications and avoid duplicates.
- [ ] Open the associated task when a notification is tapped.
- [ ] Explain disabled permission and provide a path to system settings.
- [ ] Test foreground, background, and terminated delivery on a physical iOS
  device. Repeat the platform-specific verification during Android parity.

Exit criteria: reminders for the locally stored plan continue to fire without
internet and accurately follow subsequent task changes.

### M5 — Push-to-talk brain dump

- [ ] Add an accessible microphone control beside the brain-dump field.
- [ ] Support press-and-hold plus a tap-to-start/tap-to-stop alternative.
- [ ] Show recording, processing, permission-denied, failure, and cancel states.
- [ ] Select and pin a maintained native recording plugin or implement the
  minimal audio bridge locally; record the choice in the decision log.
- [ ] Add an authenticated transcription endpoint with file-type validation,
  duration/size limits, rate limiting, stable error codes, and no retained
  audio by default.
- [ ] Decide explicitly whether transcription shares the hosted AI allowance or
  receives a separate quota.
- [ ] Insert the transcript at the current cursor position without exceeding
  the brain-dump length limit.
- [ ] Require the user to review/edit the transcript and press Analyze; never
  auto-submit or auto-apply it.
- [ ] Delete temporary audio after success, cancellation, or terminal failure.
- [ ] When offline, keep typed brain dumps working and explain that hosted
  transcription needs connectivity.
- [ ] Evaluate on-device speech as a later fallback, including English and
  Polish availability and accuracy.

Exit criteria: an iOS user can dictate a brain dump, correct the transcript,
and enter the unchanged AI review flow. Android parity is covered separately.

### M6 — Native file flows and release hardening

- [ ] Route exports through the native share sheet and imports through the
  document picker while keeping browser downloads intact.
- [ ] Add production icons, splash assets, status-bar treatment, and store
  metadata.
- [ ] Add microphone, notification, data-use, and required API privacy
  declarations for the App Store. Repeat the policy review for Google Play in
  the Android milestone.
- [ ] Confirm no secret keys are bundled; publishable Supabase configuration is
  allowed, while server and provider secrets remain server-side.
- [ ] Add crash reporting only after documenting its privacy impact and opt-out
  behavior.
- [ ] Run accessibility checks for screen readers, Dynamic Type/text scaling,
  contrast, reduced motion, and non-hold speech operation.
- [ ] Run the full web suite and native smoke matrix.
- [ ] Distribute through TestFlight.
- [ ] Resolve beta findings before public store submission.

Exit criteria: the iOS release candidate is installable, policy-compliant,
tested on physical devices, and preserves the web product.

### M7 — Android parity, next iteration

- [ ] Install Android Studio and its supported SDK, platform tools, emulator,
  command-line tools, and an ARM64 emulator image.
- [ ] Add the pinned Capacitor Android package matching the iOS/core major
  version and generate the Android project.
- [ ] Launch the bundled planner on an Android emulator without loading a
  remote page.
- [ ] Implement and verify Android runtime configuration, App Links, activation,
  recovery, authentication refresh, and Android back navigation.
- [ ] Verify the durable storage and dirty-revision sync contract through
  process termination and reconnect on Android.
- [ ] Implement notification channels, runtime permission handling, reminder
  reconciliation, notification taps, and inexact delivery without requesting
  exact-alarm privilege.
- [ ] Implement microphone permission, recording, cancellation, transcription,
  temporary-file deletion, and the accessible non-hold interaction.
- [ ] Route imports and exports through Android-native document and share flows.
- [ ] Run the shared web suite plus Android emulator and physical-device smoke
  matrices, including English and Polish.
- [ ] Add Google Play privacy declarations and distribute through its internal
  testing track.

Exit criteria: Android provides behavioral parity for offline planning, sync,
reminders, push-to-talk, authentication, and file flows without regressing iOS
or web behavior.

### M8 — Deferred remote push, only when justified

- [ ] Write the precise server-originated event and user-value statement before
  implementation.
- [ ] Add per-device token registration, rotation, revocation, account
  ownership, and RLS-protected storage.
- [ ] Add APNs and FCM provider configuration on the server.
- [ ] Deep-link notifications to the relevant planner item.
- [ ] Add per-category preferences, quiet behavior, observability, retry, and
  invalid-token cleanup.

Exit criteria: remote push exists only for an approved event that cannot be
served by local scheduling.

## Verification commands and test matrix

Run for every meaningful shared-code change:

```sh
npm test
npm run test:e2e
```

Add build and native commands to this section when M1 establishes them. Run the
iOS cases during the current iteration and repeat the applicable matrix for
Android during M7.

M1 commands:

```sh
npm run build:mobile
npx cap sync ios
npx cap doctor
npx cap run ios --target <simulator-udid> # builds; Xcode 27 may need manual simctl deploy
xcrun simctl install <simulator-udid> ios/DerivedData/<simulator-udid>/Build/Products/Debug-iphonesimulator/App.app
xcrun simctl launch <simulator-udid> com.dombialcz.overrunlite
```

Minimum device scenarios:

- Fresh install online and offline.
- Returning signed-in user launching offline.
- Guest mode offline.
- Offline edit, forced app termination, offline relaunch, then reconnect.
- Concurrent edit on another device and explicit conflict handling.
- Notification permission allowed, denied, and later changed in Settings.
- Reminder task edited, deleted, completed, moved to backlog, and imported.
- Microphone permission allowed, denied, and revoked.
- Speech success, timeout, network loss, over-limit audio, and cancellation.
- English and Polish UI and transcription.
- Timezone and daylight-saving transition behavior.

## Known repository changes required

- `cloud.js` currently discovers configuration using browser hostname and calls
  relative API paths. Native builds need explicit runtime configuration.
- `app.js` currently persists synchronously to `localStorage`. Native durable
  storage initialization is asynchronous and must complete before planner
  hydration.
- The current reconnect path retries the in-memory planner, but there is no
  durable dirty marker protecting offline edits across a killed-and-relaunched
  process. M3 must fix this before claiming safe offline editing.
- Activation and recovery currently derive redirects from
  `window.location.origin`. Native deep links must replace that assumption.
- Browser blob downloads need native file/share equivalents.
- The task model currently needs an explicit reminder representation before
  notifications can be scheduled reliably.

## Risks and guardrails

- Do not allow native work to make GitHub Pages require a build server or API.
- Do not put native-only checks throughout planner logic; use service adapters.
- Do not request permissions at first launch without explaining the feature.
- Do not depend on periodic background JavaScript for correct reminders or
  sync; mobile operating systems do not guarantee it.
- Do not use Android exact-alarm or iOS critical-alert privileges for ordinary
  planner reminders.
- Do not store refresh tokens or user API keys in ordinary preferences.
- Do not upload microphone audio before an explicit recording action.
- Do not retain audio by default or use it to train models without separate,
  explicit consent.
- Do not mark a milestone complete based only on simulator behavior when its
  exit criteria require physical-device verification.

## Decision log

| Date | Decision | Reason |
| --- | --- | --- |
| 2026-10-10 | Use Capacitor with bundled web assets. | Reuses the existing vanilla application while permitting native services on both platforms. |
| 2026-10-10 | Make local state authoritative during startup and preserve dirty revisions. | Users must be able to work off-grid without losing changes during a relaunch or reconnect. |
| 2026-10-10 | Implement local reminders before remote push. | Planner reminders can work offline and do not require a notification provider backend. |
| 2026-10-10 | Keep hosted push-to-talk transcription separate from AI application. | Transcription should create editable input and preserve review-before-apply. |
| 2026-10-10 | Deliver iOS first and schedule Android as a separate parity milestone. | The current machine setup and iteration can focus on one native toolchain while shared interfaces preserve an efficient Android path. |
| 2026-10-10 | Use `com.dombialcz.overrunlite` as the stable development bundle identifier and `Overrun Lite` as the current display name. | The bundle identifier must remain stable; the App Store display name can change during release preparation. |
| 2026-10-10 | Pin Capacitor 8.5.3 and use Swift Package Manager for the generated iOS shell. | This matches the installed Xcode toolchain and keeps the native dependency graph reproducible. |
| 2026-10-10 | On narrow screens, place the brain dump first, the day schedule second, and the backlog last; use native safe-area insets and give sign-in the primary action treatment when available. | The mobile workflow starts with capture and planning, while the simulator needs content kept below the iOS status area and a visible account entry point. |
| 2026-10-10 | Use a horizontal scroll-snap deck with three mobile screens and floating pagination dots, while retaining the desktop grid. | Swipe navigation gives the phone layout a focused task at a time without changing the web application's wider-screen information density; bottom padding keeps the final content scrollable above the dots. |
| 2026-10-10 | Size the mobile deck to the active screen and clip inactive screens vertically. | The phone should scroll through the current screen's content rather than inheriting blank space from the tallest screen; a ResizeObserver keeps the height correct as tasks and content change. |
| 2026-10-10 | Match the native WebView/status-area base to the light theme with Capacitor's static `backgroundColor`; defer dynamic native status-bar theming. | The top bar and iOS safe-area region should feel like one surface now, while theme-aware native chrome can be added with a small platform bridge later. |
| 2026-10-10 | Present task creation and editing as a mobile bottom sheet with a grabber, sticky actions, backdrop tap, and swipe-down dismissal. | A full-screen editor needs a clear, one-handed escape route on touch devices; draft-only close semantics make these dismissal paths safe, while desktop keeps the existing side drawer. |
| 2026-10-10 | Keep mobile text-entry and select controls at a 16px computed font size instead of disabling viewport zoom. | iOS focus auto-zoom is avoided without taking away the user's accessibility zoom controls. |
| 2026-10-10 | Make schedule placement the primary planning decision and remove priority/urgency controls plus the mobile status strip. | The product plans one day at a time, so time placement and task progress are more useful than a separate ranking system; old fields remain readable for compatibility. |
| 2026-10-10 | Validate task titles explicitly in the editor and require a completed subtask title before adding another. | Mobile WebViews do not always surface native form prompts consistently; inline feedback keeps the draft actionable and prevents ambiguous empty subtasks. |
| 2026-10-11 | Give mobile schedule gestures explicit ownership: tap opens, ordinary swipe/scroll navigates, and a short hold arms vertical task movement. | A task block must share the same touch surface as schedule scrolling and the three-screen deck; delaying movement prevents horizontal swipes and vertical scrolling from changing task times accidentally. |
| 2026-10-16 | Add a compact chronological List tab beside the default Schedule tab for active day items on web and mobile. | The alternate view makes the current workload scannable without changing task data, scheduling semantics, or the existing task editor. |
| 2026-10-16 | Explicitly place the desktop backlog and day panel in the same grid row, then remove that placement below the desktop breakpoint. | Mobile screen wrappers should not let DOM auto-placement move the backlog below the day panel on wide screens; narrow layouts still need their stacked and swipeable order. |
| 2026-10-16 | Persist the selected Schedule/List tab as a device-local UI preference. | View choice should survive reloads on web and native shells without becoming planner data or changing cross-device sync semantics. |
| 2026-10-16 | Remove task-level partial progress while keeping binary task completion and subtask checkboxes. | Done minutes added state and AI-context complexity without improving the schedule-first workflow; legacy elapsed values can be discarded safely during normalization. |
| 2026-11-23 | Release the completed M1 shared interface changes through the existing web deployment, alongside the iOS scaffold. | Swipe navigation, the mobile editor, gesture fixes, and Schedule/List views are shared frontend behavior and should be available online without waiting for later native milestones. |

Append decisions here rather than silently changing an earlier architectural
assumption. If a decision is reversed, add a new dated row and update the
affected milestone and product-decision sections.
