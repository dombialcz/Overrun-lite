const STORAGE_KEY = "overrun_lite_state";
const ID_COUNTER_KEY = "overrun_lite_id_counter";
const SETTINGS_KEY = "overrun_lite_ai_settings";
const REVIEW_KEY = "overrun_lite_review_draft";
const THEME_KEY = "overrun_lite_theme";
const memoryStore = {};
const DEFAULT_MINUTES = 60;
const MIN_MINUTES = 10;
const SEGMENT_BLOCK = 30;
const RESIZE_STEP_MINUTES = 5;
const CALENDAR_BLOCK_MIN_HEIGHT = 56;
const DAY_START_HOUR = 8;
const DAY_MINUTES = 11 * 60;
const MOVE_STEP_MINUTES = 5;
const COLUMN_OVERLAP_MINUTES = 15;
const COMPACT_OVERLAP_OFFSET_PX = 12;
const DEFAULT_AI_SETTINGS = {
  providerMode: "vercel",
  localBaseUrl: "http://localhost:11434/v1",
  localModel: "",
  localApiKey: "",
};

const ai = window.OverrunAI;
const cloud = window.OverrunCloud;
let activeStorageKey = STORAGE_KEY;
let activeReviewKey = REVIEW_KEY;
let activeUserId = null;
let suppressCloudSave = false;
let cloudCapabilities = { authEnabled: false, hostedAvailable: false };
let cloudUser = null;
let cloudUsage = null;
let pendingInitialSyncChoice = null;

const state = {
  tasks: [],
  backlog: [],
  selectedTaskId: null,
  selectedTaskLocation: null,
  reviewDraft: null,
  aiSettings: { ...DEFAULT_AI_SETTINGS },
};

const els = {
  accountCopy: document.getElementById("account-copy"),
  accountEmail: document.getElementById("account-email"),
  accountEmailStatus: document.getElementById("account-email-status"),
  accountHeading: document.getElementById("account-heading"),
  accountPanel: document.getElementById("account-panel"),
  accountPassword: document.getElementById("account-password"),
  accountStatus: document.getElementById("account-status"),
  acceptInvite: document.getElementById("accept-invite"),
  activateAccount: document.getElementById("activate-account"),
  activationForm: document.getElementById("activation-form"),
  activationPassword: document.getElementById("activation-password"),
  activationPasswordConfirm: document.getElementById("activation-password-confirm"),
  addTask: document.getElementById("add-task"),
  addMeeting: document.getElementById("add-meeting"),
  agentExportPanel: document.getElementById("agent-export-panel"),
  agentExportPrompt: document.getElementById("agent-export-prompt"),
  agentExportStatus: document.getElementById("agent-export-status"),
  analyzeDump: document.getElementById("analyze-dump"),
  applyReview: document.getElementById("apply-review"),
  backlogFile: document.getElementById("backlog-file"),
  backlogList: document.getElementById("backlog-list"),
  backlogTemplate: document.getElementById("backlog-template"),
  doneBacklog: document.getElementById("done-backlog"),
  doneBacklogCount: document.getElementById("done-backlog-count"),
  doneBacklogList: document.getElementById("done-backlog-list"),
  brainDump: document.getElementById("brain-dump"),
  calendarBlocks: document.getElementById("calendar-blocks"),
  cancelTaskEditor: document.getElementById("cancel-task-editor"),
  cancelClearBacklog: document.getElementById("cancel-clear-backlog"),
  cancelClearBacklogSecondary: document.getElementById("cancel-clear-backlog-secondary"),
  clearBacklog: document.getElementById("clear-backlog"),
  clearBacklogPanel: document.getElementById("clear-backlog-panel"),
  clearDump: document.getElementById("clear-dump"),
  closeAgentExport: document.getElementById("close-agent-export"),
  closeAccount: document.getElementById("close-account"),
  closeReview: document.getElementById("close-review"),
  closeSettings: document.getElementById("close-settings"),
  clearLocalStorage: document.getElementById("clear-local-storage"),
  closeTaskDetails: document.getElementById("close-task-details"),
  confirmClearBacklog: document.getElementById("confirm-clear-backlog"),
  confirmClearBacklogAction: document.getElementById("confirm-clear-backlog-action"),
  conflictUseCloud: document.getElementById("conflict-use-cloud"),
  conflictUseLocal: document.getElementById("conflict-use-local"),
  contextOrganize: document.getElementById("context-organize"),
  copyAgentExport: document.getElementById("copy-agent-export"),
  dayReport: document.getElementById("day-report"),
  dayTimer: document.getElementById("day-timer"),
  detailBacklog: document.getElementById("detail-backlog"),
  detailAISection: document.getElementById("detail-ai-section"),
  detailAddSubtask: document.getElementById("detail-add-subtask"),
  detailAdvanced: document.getElementById("detail-advanced"),
  detailAdvancedSummary: document.getElementById("detail-advanced-summary"),
  detailBreakdownAI: document.getElementById("detail-breakdown-ai"),
  detailBreakdownApplyMode: document.getElementById("detail-breakdown-apply-mode"),
  detailBreakdownGranularity: document.getElementById("detail-breakdown-granularity"),
  detailBreakdownInstructions: document.getElementById("detail-breakdown-instructions"),
  detailDelete: document.getElementById("detail-delete"),
  detailEyebrow: document.getElementById("detail-eyebrow"),
  detailExportAgent: document.getElementById("detail-export-agent"),
  detailHeading: document.getElementById("detail-heading"),
  detailImpact: document.getElementById("detail-impact"),
  detailPriorityReason: document.getElementById("detail-priority-reason"),
  detailPriorityScore: document.getElementById("detail-priority-score"),
  dumpCharCount: document.getElementById("dump-char-count"),
  thinkingOverlay: document.getElementById("thinking-overlay"),
  detailSplit: document.getElementById("detail-split"),
  detailSubtasks: document.getElementById("detail-subtasks"),
  detailTaskActions: document.getElementById("detail-task-actions"),
  detailTaskStart: document.getElementById("detail-task-start"),
  detailTaskStartField: document.getElementById("detail-task-start-field"),
  detailTaskDuration: document.getElementById("detail-task-duration"),
  detailTaskProgress: document.getElementById("detail-task-progress"),
  detailTaskTitle: document.getElementById("detail-task-title"),
  detailToggleDone: document.getElementById("detail-toggle-done"),
  detailToggleTimer: document.getElementById("detail-toggle-timer"),
  detailUrgency: document.getElementById("detail-urgency"),
  discardReview: document.getElementById("discard-review"),
  doneTime: document.getElementById("done-time"),
  exportBacklog: document.getElementById("export-backlog"),
  forgotPassword: document.getElementById("forgot-password"),
  authLinkFailure: document.getElementById("auth-link-failure"),
  importBacklog: document.getElementById("import-backlog"),
  initialSyncCloud: document.getElementById("initial-sync-cloud"),
  initialSyncCopy: document.getElementById("initial-sync-copy"),
  initialSyncLocal: document.getElementById("initial-sync-local"),
  initialSyncPanel: document.getElementById("initial-sync-panel"),
  inviteConfirmation: document.getElementById("invite-confirmation"),
  localApiKey: document.getElementById("local-api-key"),
  localBaseUrl: document.getElementById("local-base-url"),
  localModel: document.getElementById("local-model"),
  openAccount: document.getElementById("open-account"),
  openSettings: document.getElementById("open-settings"),
  providerMode: document.getElementById("provider-mode"),
  reanalyzeDump: document.getElementById("reanalyze-dump"),
  recoveryForm: document.getElementById("recovery-form"),
  recoveryPassword: document.getElementById("recovery-password"),
  recoveryPasswordConfirm: document.getElementById("recovery-password-confirm"),
  resetPassword: document.getElementById("reset-password"),
  retryAuthLink: document.getElementById("retry-auth-link"),
  reviewHeading: document.getElementById("review-heading"),
  reviewPanel: document.getElementById("review-panel"),
  reviewQuestions: document.getElementById("review-questions"),
  reviewSummary: document.getElementById("review-summary"),
  reviewTasks: document.getElementById("review-tasks"),
  reviewWarnings: document.getElementById("review-warnings"),
  saveDay: document.getElementById("save-day"),
  saveSettings: document.getElementById("save-settings"),
  signedInActions: document.getElementById("signed-in-actions"),
  signInForm: document.getElementById("sign-in-form"),
  signOut: document.getElementById("sign-out"),
  settingsPanel: document.getElementById("settings-panel"),
  sortBacklog: document.getElementById("sort-backlog"),
  status: document.getElementById("ai-status"),
  syncConflictPanel: document.getElementById("sync-conflict-panel"),
  syncStatus: document.getElementById("sync-status"),
  taskDetailsPanel: document.getElementById("task-details-panel"),
  taskEditorForm: document.getElementById("task-editor-form"),
  themeToggle: document.getElementById("theme-toggle"),
  toggleDay: document.getElementById("toggle-day"),
  totalTime: document.getElementById("total-time"),
  saveTaskEditor: document.getElementById("save-task-editor"),
  aiUsage: document.getElementById("ai-usage"),
};

const dragState = {
  moveId: null,
  resizeId: null,
  progressId: null,
  progressRect: null,
  stableLaneCount: 0,
  stableLaneMap: null,
  stableTaskIds: null,
  startY: 0,
  startMinutes: 0,
  startTopMinutes: 0,
  isResizing: false,
  isMoving: false,
  pointerMoved: false,
};

const timerState = {
  activeId: null,
  intervalId: null,
  lastTick: 0,
  remainderMs: 0,
};

const dayTimer = {
  remainingSeconds: 8 * 60 * 60,
  intervalId: null,
  lastTick: 0,
};

const taskEditorState = {
  mode: null,
  location: null,
  draft: null,
};

function getPixelsPerMinute() {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue("--hour-height")
    .trim();
  const pixels = Number(value.replace("px", "")) || 80;
  return pixels / 60;
}

function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch (err) {
    return memoryStore[key] || null;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    memoryStore[key] = value;
  }
}

function safeRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch (err) {
    delete memoryStore[key];
  }
}

function readJson(key, fallback) {
  const raw = safeGet(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`Failed to load ${key}`, err);
    return fallback;
  }
}

function getStoredTheme() {
  const theme = safeGet(THEME_KEY);
  return theme === "light" || theme === "dark" ? theme : null;
}

function getSystemTheme() {
  return typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function updateThemeToggle(theme) {
  const nextTheme = theme === "dark" ? "light" : "dark";
  els.themeToggle.textContent = `${nextTheme[0].toUpperCase()}${nextTheme.slice(1)} theme`;
  els.themeToggle.setAttribute("aria-label", `Switch to ${nextTheme} theme`);
}

function applyTheme(theme) {
  const normalizedTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = normalizedTheme;
  updateThemeToggle(normalizedTheme);
}

function toggleTheme() {
  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  safeSet(THEME_KEY, nextTheme);
  applyTheme(nextTheme);
}

function setupTheme() {
  applyTheme(getStoredTheme() || getSystemTheme());
  if (typeof window.matchMedia !== "function") return;
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (event) => {
    if (!getStoredTheme()) applyTheme(event.matches ? "dark" : "light");
  });
}

function loadState() {
  const parsed = readJson(activeStorageKey, {});
  state.tasks = Array.isArray(parsed.tasks) ? parsed.tasks.map(normalizeTask) : [];
  assignSequentialStartsWhenMissing(state.tasks);
  state.backlog = Array.isArray(parsed.backlog) ? parsed.backlog.map(normalizeTask) : [];
  state.aiSettings = {
    ...DEFAULT_AI_SETTINGS,
    ...readJson(SETTINGS_KEY, {}),
  };
  state.reviewDraft = readJson(activeReviewKey, null);
}

function saveState() {
  const plannerState = { tasks: state.tasks, backlog: state.backlog };
  safeSet(
    activeStorageKey,
    JSON.stringify(plannerState)
  );
  if (!suppressCloudSave && activeUserId && cloud) {
    cloud.scheduleSave(plannerState);
  }
}

function saveSettings() {
  safeSet(SETTINGS_KEY, JSON.stringify(state.aiSettings));
}

function saveReviewDraft() {
  if (state.reviewDraft) {
    safeSet(activeReviewKey, JSON.stringify(state.reviewDraft));
  } else {
    safeRemove(activeReviewKey);
  }
}

function clearLocalStorageState() {
  if (!confirm("Clear local AI settings and API keys from this browser? Current tasks and backlog will be kept.")) {
    return;
  }
  [SETTINGS_KEY, activeReviewKey].forEach(safeRemove);
  [SETTINGS_KEY, activeReviewKey].forEach((key) => {
    delete memoryStore[key];
  });
  resetTaskEditorState();
  state.reviewDraft = null;
  state.aiSettings = { ...DEFAULT_AI_SETTINGS };
  els.brainDump.value = "";
  pauseTimer();
  closeDrawer(els.reviewPanel);
  closeDrawer(els.taskDetailsPanel);
  closeClearBacklogPanel();
  render();
  openDrawer(els.settingsPanel);
  setStatus("Local AI settings cleared. Tasks and backlog were kept.");
}

function getPlannerState() {
  return {
    tasks: state.tasks.map(serializeTask),
    backlog: state.backlog.map(serializeTask),
  };
}

function applyPlannerState(plannerState) {
  const source = plannerState && typeof plannerState === "object" ? plannerState : {};
  suppressCloudSave = true;
  state.tasks = Array.isArray(source.tasks) ? source.tasks.map(normalizeTask) : [];
  assignSequentialStartsWhenMissing(state.tasks);
  state.backlog = Array.isArray(source.backlog) ? source.backlog.map(normalizeTask) : [];
  resetTaskEditorState();
  pauseTimer();
  closeDrawer(els.taskDetailsPanel);
  saveState();
  suppressCloudSave = false;
  render();
}

function activateAccount(userId, plannerState) {
  activeUserId = userId;
  activeStorageKey = `${STORAGE_KEY}:${userId}`;
  activeReviewKey = `${REVIEW_KEY}:${userId}`;
  state.reviewDraft = readJson(activeReviewKey, null);
  applyPlannerState(plannerState);
}

function activateGuest() {
  cancelInitialSyncChoice();
  if (activeUserId) {
    safeRemove(`${STORAGE_KEY}:${activeUserId}`);
    safeRemove(`${REVIEW_KEY}:${activeUserId}`);
  }
  activeUserId = null;
  activeStorageKey = STORAGE_KEY;
  activeReviewKey = REVIEW_KEY;
  loadState();
  render();
}

function cancelInitialSyncChoice() {
  const resolve = pendingInitialSyncChoice;
  pendingInitialSyncChoice = null;
  closeDrawer(els.initialSyncPanel);
  if (resolve) resolve(null);
}

function chooseInitialSync({ hasCloud }) {
  els.initialSyncCopy.textContent = hasCloud
    ? "This browser and your account both contain planner data. Choose the complete version to keep."
    : "This browser contains local planner data. Move it into your account to use it on other devices, or start with an empty account.";
  els.initialSyncCloud.textContent = hasCloud ? "Use account data" : "Start with empty account";
  openDrawer(els.initialSyncPanel);
  return new Promise((resolve) => {
    pendingInitialSyncChoice = resolve;
  });
}

function finishInitialSyncChoice(choice) {
  if (!pendingInitialSyncChoice) return;
  const resolve = pendingInitialSyncChoice;
  pendingInitialSyncChoice = null;
  closeDrawer(els.initialSyncPanel);
  resolve(choice);
}

function renderAccount(authState = {}) {
  cloudUser = authState.user || null;
  const activationRequired = Boolean(authState.activationRequired);
  const recoveryRequired = Boolean(authState.recoveryRequired);
  const inviteConfirmationRequired = Boolean(authState.inviteConfirmationRequired);
  const invitePending = Boolean(authState.invitePending);
  const activationPending = Boolean(authState.activationPending);
  const recoveryPending = Boolean(authState.recoveryPending);
  const authRetryAvailable = Boolean(authState.authRetryAvailable);
  const authLinkInFlight = Boolean(authState.authLinkInFlight);
  const passwordSetupRequired = activationRequired || recoveryRequired;
  const authFlowPending = invitePending || activationPending || recoveryPending;
  const authLinkFailure = authFlowPending
    && !inviteConfirmationRequired
    && !passwordSetupRequired;
  const signedIn = Boolean(cloudUser);
  els.signInForm.classList.toggle("hidden", signedIn || passwordSetupRequired || authFlowPending);
  els.inviteConfirmation.classList.toggle("hidden", !inviteConfirmationRequired);
  els.activationForm.classList.toggle("hidden", !activationRequired);
  els.recoveryForm.classList.toggle("hidden", !recoveryRequired);
  els.authLinkFailure.classList.toggle("hidden", !authLinkFailure);
  els.retryAuthLink.classList.toggle("hidden", !authRetryAvailable);
  els.retryAuthLink.disabled = authLinkInFlight;
  els.acceptInvite.disabled = authLinkInFlight;
  els.signedInActions.classList.toggle("hidden", !signedIn || passwordSetupRequired || authFlowPending);
  els.accountHeading.textContent = inviteConfirmationRequired
    ? "Accept invitation"
    : invitePending
      ? "Invitation problem"
      : activationRequired
        ? "Activate account"
        : activationPending
          ? (authLinkInFlight ? "Verifying invitation" : "Invitation problem")
          : recoveryRequired
            ? "Reset password"
            : recoveryPending
              ? (authLinkInFlight ? "Verifying password reset" : "Password reset problem")
              : signedIn
                ? "Your account"
                : "Sign in";
  els.accountCopy.textContent = inviteConfirmationRequired
    ? "Confirm that you want to accept this invite. The one-time invitation is used only after you continue."
    : invitePending
      ? "This invitation cannot be opened. Ask the person who invited you for a new link."
      : activationRequired
        ? "Create a password to finish activating this invite-only account."
        : activationPending
          ? "Overrun could not finish verifying this invitation."
          : recoveryRequired
            ? "Choose a new password for your Overrun account."
            : recoveryPending
              ? "Overrun could not finish verifying this password reset link."
              : signedIn
                ? "Your planner is connected to your account and can sync across devices."
                : cloudCapabilities.authEnabled
                  ? "Accounts are invite-only during the beta. You can keep using this browser locally without signing in."
                  : "Cloud accounts are not configured on this deployment. Your planner remains local to this browser.";
  els.accountEmailStatus.textContent = signedIn ? cloudUser.email || "" : "";
  els.openAccount.textContent = signedIn ? cloudUser.email || "Account" : "Sign in";
  els.openAccount.disabled = !cloudCapabilities.authEnabled;
  els.openAccount.classList.toggle("hidden", !cloudCapabilities.authEnabled && !signedIn);
  if (authState.authError) {
    setAccountStatus(authState.authError, true);
    openDrawer(els.accountPanel);
  } else if (authFlowPending || passwordSetupRequired) {
    setAccountStatus(authLinkInFlight ? "Verifying link..." : "");
  }
  if (authFlowPending || passwordSetupRequired) openDrawer(els.accountPanel);
  updateAIAvailability();
}

function setAccountStatus(message, isError = false) {
  els.accountStatus.textContent = message;
  els.accountStatus.classList.toggle("error", isError);
}

function setSyncStatus(status) {
  els.syncStatus.textContent = status;
}

function renderAIUsage(nextUsage) {
  cloudUsage = nextUsage;
  if (!cloudUser) {
    els.aiUsage.textContent = "";
  } else if (nextUsage) {
    els.aiUsage.textContent = `${nextUsage.used} / ${nextUsage.limit} AI actions today`;
  } else if (!cloudCapabilities.hostedAvailable) {
    els.aiUsage.textContent = "Hosted AI unavailable";
  } else {
    els.aiUsage.textContent = "AI usage unavailable";
  }
  els.aiUsage.classList.toggle(
    "custom-provider",
    state.aiSettings.providerMode === "local"
  );
  if (state.aiSettings.providerMode === "local" && cloudUser) {
    const base = els.aiUsage.textContent;
    els.aiUsage.textContent = base ? `Using custom settings · ${base}` : "Using custom settings";
  }
  updateAIAvailability();
}

function updateAIAvailability() {
  const useLocal = state.aiSettings.providerMode === "local";
  const limitReached = Boolean(cloudUsage && cloudUsage.remaining <= 0);
  const hostedDisabled = !cloudUser || !cloudCapabilities.hostedAvailable || limitReached;
  const disabled = !useLocal && hostedDisabled;
  const reason = !cloudUser
    ? "Sign in to use hosted AI."
    : !cloudCapabilities.hostedAvailable
      ? "Hosted AI is unavailable on this deployment."
      : limitReached
        ? "Daily hosted AI allowance used."
        : "";
  [els.analyzeDump, els.contextOrganize, els.reanalyzeDump, els.detailBreakdownAI]
    .forEach((button) => {
      button.disabled = disabled;
      button.title = disabled ? reason : "";
    });
  if (!hasAnsweredClarification(state.reviewDraft)) {
    els.reanalyzeDump.disabled = true;
  }
  renderAIUsageLabelOnly();
}

function renderAIUsageLabelOnly() {
  els.aiUsage.classList.toggle(
    "custom-provider",
    state.aiSettings.providerMode === "local"
  );
}

function showSyncConflict() {
  openDrawer(els.syncConflictPanel);
}

function formatDuration(minutes) {
  const safeMinutes = Math.max(0, Math.round(Number(minutes) || 0));
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  return `${hours}h ${mins}m`;
}

function createId(prefix = "task") {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return `${prefix}-${window.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function clampNumber(value, min, max, fallback) {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeTask(task) {
  const source = task && typeof task === "object" ? task : {};
  const title = String(source.name || source.title || "Untitled").trim() || "Untitled";
  const minutes = clampNumber(source.minutes, MIN_MINUTES, 480, DEFAULT_MINUTES);
  const elapsedMinutes = clampNumber(source.elapsedMinutes, 0, minutes, 0);
  return {
    id: String(source.id || createId()),
    name: title,
    minutes,
    type: source.type === "meeting" ? "meeting" : "task",
    startMinutes: clampNumber(source.startMinutes, 0, DAY_MINUTES - MIN_MINUTES, 0),
    hasExplicitStart: source.startMinutes !== undefined && source.startMinutes !== null,
    elapsedMinutes,
    completed: Boolean(source.completed),
    completedAt: isValidDateString(source.completedAt) ? source.completedAt : null,
    priorityScore: clampNumber(source.priorityScore, 1, 100, 50),
    priorityReason: String(source.priorityReason || "").trim(),
    urgency: clampNumber(source.urgency, 1, 5, 3),
    impact: clampNumber(source.impact, 1, 5, 3),
    sourceDumpId: source.sourceDumpId ? String(source.sourceDumpId) : null,
    sourceProvider: source.sourceProvider ? String(source.sourceProvider) : null,
    sourceCalendarId: source.sourceCalendarId ? String(source.sourceCalendarId) : null,
    sourceEventId: source.sourceEventId ? String(source.sourceEventId) : null,
    sourceEventICalUID: source.sourceEventICalUID ? String(source.sourceEventICalUID) : null,
    sourceUpdated: source.sourceUpdated ? String(source.sourceUpdated) : null,
    sourceImportId: source.sourceImportId ? String(source.sourceImportId) : null,
    sourceSnapshotId: source.sourceSnapshotId ? String(source.sourceSnapshotId) : null,
    parentId: source.parentId ? String(source.parentId) : null,
    splitGroupId: source.splitGroupId || source.parentId ? String(source.splitGroupId || source.parentId) : null,
    splitPartIndex: source.splitPartIndex ? clampNumber(source.splitPartIndex, 1, 99, 1) : null,
    splitPartCount: source.splitPartCount ? clampNumber(source.splitPartCount, 1, 99, 1) : null,
    subtasks: Array.isArray(source.subtasks)
      ? source.subtasks.map(normalizeSubtask).filter(Boolean)
      : [],
  };
}

function isValidDateString(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  return Number.isFinite(Date.parse(value));
}

function normalizeSubtask(item) {
  const title = String(item && (item.title || item.name || "")).trim();
  if (!title) return null;
  return {
    id: String(item.id || createId("subtask")),
    title,
    minutes: clampNumber(item.minutes, 5, 240, 25),
    completed: Boolean(item.completed),
  };
}

function createTask(name, minutes = DEFAULT_MINUTES, type = "task", overrides = {}) {
  return normalizeTask({
    id: createId(),
    name,
    minutes,
    type,
    startMinutes: findNextTaskStart(minutes),
    hasExplicitStart: true,
    elapsedMinutes: 0,
    completed: false,
    ...overrides,
  });
}

function assignSequentialStartsWhenMissing(tasks) {
  let cursor = 0;
  tasks.forEach((task) => {
    if (!task.hasExplicitStart) {
      task.startMinutes = clampStartMinutes(cursor, task.minutes);
      task.hasExplicitStart = true;
    }
    cursor = Math.max(cursor, task.startMinutes + task.minutes);
  });
}

function findNextTaskStart(minutes) {
  const latestEnd = state.tasks.reduce(
    (max, task) => Math.max(max, task.startMinutes + task.minutes),
    0
  );
  return clampStartMinutes(latestEnd, minutes);
}

function clampStartMinutes(value, duration = MIN_MINUTES) {
  return clampNumber(value, 0, Math.max(0, DAY_MINUTES - Math.min(duration, DAY_MINUTES)), 0);
}

function splitTask(id) {
  const taskIndex = state.tasks.findIndex((item) => item.id === id);
  if (taskIndex === -1) return;
  const task = state.tasks[taskIndex];
  const totalBlocks = Math.ceil(task.minutes / SEGMENT_BLOCK);
  const segmentCount = Number(
    prompt("How many segments?", String(Math.min(2, totalBlocks)))
  );
  if (!segmentCount || segmentCount < 2) return;

  const totalRounded = totalBlocks * SEGMENT_BLOCK;
  const segmentMinutes =
    Math.ceil(totalRounded / segmentCount / SEGMENT_BLOCK) * SEGMENT_BLOCK;
  const splitGroupId = task.splitGroupId || task.parentId || task.id;
  const splitTasks = Array.from({ length: segmentCount }, (_, index) =>
    createTask(`${task.name} (part ${index + 1})`, segmentMinutes, task.type, {
      priorityScore: task.priorityScore,
      priorityReason: task.priorityReason,
      urgency: task.urgency,
      impact: task.impact,
      sourceDumpId: task.sourceDumpId,
      parentId: splitGroupId,
      splitGroupId,
      splitPartIndex: index + 1,
      splitPartCount: segmentCount,
      startMinutes: clampStartMinutes(task.startMinutes + index * segmentMinutes, segmentMinutes),
      hasExplicitStart: true,
    })
  );
  state.tasks.splice(taskIndex, 1, ...splitTasks);
  resetTaskEditorState();
  saveState();
  render();
  closeDrawer(els.taskDetailsPanel);
  return splitTasks;
}

function pushToBacklog(id) {
  const taskIndex = state.tasks.findIndex((item) => item.id === id);
  if (taskIndex === -1) return;
  const [task] = state.tasks.splice(taskIndex, 1);
  state.backlog.unshift(task);
  if (state.selectedTaskId === id) {
    resetTaskEditorState();
    closeDrawer(els.taskDetailsPanel);
  }
  sortBacklogByPriority();
  saveState();
  render();
}

function pickFromBacklog(id) {
  const taskIndex = state.backlog.findIndex((item) => item.id === id);
  if (taskIndex === -1) return;
  if (state.backlog[taskIndex].completed) return;
  const [task] = state.backlog.splice(taskIndex, 1);
  state.tasks.push(task);
  if (state.selectedTaskId === id) {
    resetTaskEditorState();
    closeDrawer(els.taskDetailsPanel);
  }
  saveState();
  render();
}

function archiveCompletedTask(id) {
  const taskIndex = state.tasks.findIndex((item) => item.id === id);
  if (taskIndex === -1) return;
  const [task] = state.tasks.splice(taskIndex, 1);
  task.completed = true;
  task.completedAt = new Date().toISOString();
  task.elapsedMinutes = task.minutes;
  if (timerState.activeId === id) {
    pauseTimer();
  }
  const firstDoneIndex = state.backlog.findIndex((item) => item.completed);
  state.backlog.splice(firstDoneIndex === -1 ? state.backlog.length : firstDoneIndex, 0, task);
  sortBacklogByPriority();
  if (state.selectedTaskId === id) {
    resetTaskEditorState();
    closeDrawer(els.taskDetailsPanel);
  }
  saveState();
  render();
}

function restoreCompletedTask(id) {
  const task = state.backlog.find((item) => item.id === id && item.completed);
  if (!task) return;
  task.completed = false;
  task.completedAt = null;
  task.elapsedMinutes = 0;
  sortBacklogByPriority();
  saveState();
  renderBacklog();
}

function setElapsedMinutes(id, minutes) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  const next = Math.max(0, Math.min(task.minutes, minutes));
  if (next >= task.minutes) {
    archiveCompletedTask(id);
    return;
  }
  task.elapsedMinutes = next;
  task.completed = false;
  task.completedAt = null;
  saveState();
  renderCalendar();
}

function setElapsedFromRatio(id, ratio) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  const snapped =
    Math.round((ratio * task.minutes) / RESIZE_STEP_MINUTES) *
    RESIZE_STEP_MINUTES;
  setElapsedMinutes(id, snapped);
}

function formatTimer(seconds) {
  const safeSeconds = Math.max(0, seconds);
  const hours = Math.floor(safeSeconds / 3600);
  const mins = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function formatClockTime(startMinutes) {
  const totalMinutes = DAY_START_HOUR * 60 + clampNumber(startMinutes, 0, DAY_MINUTES, 0);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

function parseClockTime(value, fallback = 0) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return fallback;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return fallback;
  return (hours - DAY_START_HOUR) * 60 + mins;
}

function getLiveRemainingSeconds(task) {
  const baseSeconds = Math.max(0, task.minutes * 60 - task.elapsedMinutes * 60);
  if (timerState.activeId !== task.id || !timerState.intervalId) {
    return baseSeconds;
  }
  const extraSeconds = Math.floor(timerState.remainderMs / 1000);
  return Math.max(0, baseSeconds - extraSeconds);
}

function startTimer(id) {
  if (timerState.activeId && timerState.activeId !== id) {
    pauseTimer();
  }
  timerState.activeId = id;
  timerState.lastTick = Date.now();
  if (timerState.intervalId) {
    clearInterval(timerState.intervalId);
  }
  timerState.intervalId = setInterval(tickTimer, 1000);
  renderCalendar();
}

function pauseTimer() {
  if (timerState.intervalId) {
    clearInterval(timerState.intervalId);
  }
  timerState.intervalId = null;
  timerState.activeId = null;
  timerState.remainderMs = 0;
  renderCalendar();
}

function tickTimer() {
  if (!timerState.activeId) return;
  const task = state.tasks.find((item) => item.id === timerState.activeId);
  if (!task) return;
  const now = Date.now();
  const delta = now - timerState.lastTick;
  timerState.lastTick = now;
  timerState.remainderMs += delta;
  const minutesToAdd = Math.floor(timerState.remainderMs / 60000);
  renderCalendar();
  if (!minutesToAdd) return;
  timerState.remainderMs -= minutesToAdd * 60000;
  task.elapsedMinutes = Math.min(task.minutes, task.elapsedMinutes + minutesToAdd);
  if (task.elapsedMinutes >= task.minutes) {
    archiveCompletedTask(task.id);
    return;
  }
  saveState();
  renderCalendar();
}

function updateDayTimerDisplay() {
  els.dayTimer.textContent = formatTimer(dayTimer.remainingSeconds);
  els.toggleDay.textContent = dayTimer.intervalId ? "Pause day" : "Start day";
}

function tickDayTimer() {
  const now = Date.now();
  const delta = now - dayTimer.lastTick;
  dayTimer.lastTick = now;
  dayTimer.remainingSeconds = Math.max(
    0,
    dayTimer.remainingSeconds - Math.floor(delta / 1000)
  );
  updateDayTimerDisplay();
  if (dayTimer.remainingSeconds === 0) {
    stopDayTimer();
  }
}

function startDayTimer() {
  if (dayTimer.intervalId) return;
  dayTimer.lastTick = Date.now();
  dayTimer.intervalId = setInterval(tickDayTimer, 1000);
  updateDayTimerDisplay();
}

function stopDayTimer() {
  if (dayTimer.intervalId) {
    clearInterval(dayTimer.intervalId);
  }
  dayTimer.intervalId = null;
  updateDayTimerDisplay();
}

function toggleDayTimer() {
  if (dayTimer.intervalId) {
    stopDayTimer();
  } else {
    startDayTimer();
  }
}

function scoreToLabel(score) {
  if (score >= 76) return "CRITICAL";
  if (score >= 51) return "HIGH";
  if (score >= 26) return "MEDIUM";
  return "LOW";
}

function labelToScore(label) {
  switch (label) {
    case "CRITICAL": return 88;
    case "HIGH": return 63;
    case "MEDIUM": return 38;
    default: return 13;
  }
}

function updateDumpCharCount() {
  const len = els.brainDump.value.length;
  els.dumpCharCount.textContent = `${len} / 1800`;
  els.dumpCharCount.classList.toggle("char-count-near-limit", len >= 1600);
}

function priorityLabel(task) {
  return `${scoreToLabel(task.priorityScore)} | Impact ${task.impact}/5 | Urgency ${task.urgency}/5`;
}

function getSubtaskProgress(task) {
  const total = Array.isArray(task.subtasks) ? task.subtasks.length : 0;
  const completed = total
    ? task.subtasks.filter((subtask) => subtask.completed).length
    : 0;
  return { completed, total };
}

function formatSubtaskProgress(task, compact = false) {
  const { completed, total } = getSubtaskProgress(task);
  if (!total) return "";
  return compact ? `Sub ${completed}/${total}` : `Subtasks ${completed}/${total}`;
}

function taskOverlaps(a, b) {
  return a.startMinutes < getTaskVisualEndMinutes(b) && b.startMinutes < getTaskVisualEndMinutes(a);
}

function getOverlapMinutes(a, b) {
  if (!taskOverlaps(a, b)) return 0;
  return Math.min(getTaskVisualEndMinutes(a), getTaskVisualEndMinutes(b)) -
    Math.max(a.startMinutes, b.startMinutes);
}

function getTaskVisualEndMinutes(task) {
  const visualMinutes = Math.max(
    task.minutes,
    CALENDAR_BLOCK_MIN_HEIGHT / getPixelsPerMinute()
  );
  return task.startMinutes + visualMinutes;
}

function buildCalendarLayout(tasks = state.tasks) {
  const taskOrder = new Map(tasks.map((task, index) => [task.id, index]));
  const sorted = [...tasks].sort((a, b) => {
    if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
    if (b.minutes !== a.minutes) return b.minutes - a.minutes;
    return taskOrder.get(a.id) - taskOrder.get(b.id);
  });
  const layout = new Map();
  const cluster = [];
  let clusterEnd = -1;

  function flushCluster() {
    if (!cluster.length) return;
    assignClusterLanes(cluster, layout);
    cluster.length = 0;
    clusterEnd = -1;
  }

  sorted.forEach((task) => {
    if (!cluster.length || task.startMinutes < clusterEnd) {
      cluster.push(task);
      clusterEnd = Math.max(clusterEnd, getTaskVisualEndMinutes(task));
      return;
    }
    flushCluster();
    cluster.push(task);
    clusterEnd = getTaskVisualEndMinutes(task);
  });
  flushCluster();
  return layout;
}

function getOverlapClusterIds(taskId, tasks = state.tasks) {
  const ids = new Set([taskId]);
  let changed = true;
  while (changed) {
    changed = false;
    tasks.forEach((task) => {
      if (ids.has(task.id)) return;
      const overlapsCluster = tasks.some((other) =>
        ids.has(other.id) && taskOverlaps(task, other)
      );
      if (!overlapsCluster) return;
      ids.add(task.id);
      changed = true;
    });
  }
  return ids;
}

function assignClusterLanes(cluster, layout) {
  const maxOverlapMinutes = cluster.reduce((max, task, index) => {
    const taskMax = cluster.slice(index + 1).reduce(
      (pairMax, other) => Math.max(pairMax, getOverlapMinutes(task, other)),
      0
    );
    return Math.max(max, taskMax);
  }, 0);
  const useCompactOverlap = cluster.length > 1 && maxOverlapMinutes <= COLUMN_OVERLAP_MINUTES;
  if (useCompactOverlap) {
    cluster.forEach((task, index) => {
      const hasConflict = cluster.some((other) => other.id !== task.id && taskOverlaps(task, other));
      layout.set(task.id, {
        compactOffset: hasConflict ? Math.min(index, 3) * COMPACT_OVERLAP_OFFSET_PX : 0,
        hasConflict,
        laneCount: 1,
        laneIndex: 0,
        zIndex: 1 + index,
      });
    });
    return;
  }

  const lanes = [];
  cluster.forEach((task) => {
    let laneIndex = lanes.findIndex((laneEnd) => laneEnd <= task.startMinutes);
    if (laneIndex === -1) {
      laneIndex = lanes.length;
      lanes.push(0);
    }
    lanes[laneIndex] = getTaskVisualEndMinutes(task);
    layout.set(task.id, {
      hasConflict: cluster.length > 1,
      laneCount: cluster.length > 1 ? lanes.length : 1,
      laneIndex,
    });
  });

  const laneCount = lanes.length;
  cluster.forEach((task) => {
    const item = layout.get(task.id);
    item.laneCount = laneCount;
    item.hasConflict = cluster.some((other) => other.id !== task.id && taskOverlaps(task, other));
  });
}

function getMaxCalendarLaneCount(tasks = state.tasks) {
  return Math.max(
    1,
    ...Array.from(buildCalendarLayout(tasks).values()).map((item) => item.laneCount || 1)
  );
}

function canMoveTaskToStart(taskId, nextStartMinutes) {
  const tasks = state.tasks.map((task) =>
    task.id === taskId
      ? { ...task, startMinutes: nextStartMinutes }
      : task
  );
  return getMaxCalendarLaneCount(tasks) <= 3;
}

function captureStableDragLanes(task) {
  const layout = buildCalendarLayout();
  const taskLayout = layout.get(task.id);
  if (!taskLayout || taskLayout.compactOffset || taskLayout.laneCount <= 1) {
    dragState.stableLaneCount = 0;
    dragState.stableLaneMap = null;
    dragState.stableTaskIds = null;
    return;
  }

  const clusterIds = getOverlapClusterIds(task.id);
  const laneMap = new Map();
  clusterIds.forEach((id) => {
    const item = layout.get(id);
    if (item && !item.compactOffset && item.laneCount === taskLayout.laneCount) {
      laneMap.set(id, item.laneIndex);
    }
  });

  dragState.stableLaneCount = taskLayout.laneCount;
  dragState.stableLaneMap = laneMap;
  dragState.stableTaskIds = clusterIds;
}

function applyStableDragLanes(layout) {
  if (
    !dragState.moveId ||
    !dragState.stableLaneMap ||
    !dragState.stableTaskIds ||
    dragState.stableLaneCount <= 1
  ) return;

  const movingTask = state.tasks.find((task) => task.id === dragState.moveId);
  if (!movingTask) return;
  const stillOverlapsStableCluster = state.tasks.some((task) =>
    task.id !== movingTask.id &&
    dragState.stableTaskIds.has(task.id) &&
    taskOverlaps(movingTask, task)
  );
  if (!stillOverlapsStableCluster) return;

  dragState.stableLaneMap.forEach((laneIndex, id) => {
    const item = layout.get(id);
    if (!item) return;
    item.compactOffset = 0;
    item.hasConflict = true;
    item.laneCount = dragState.stableLaneCount;
    item.laneIndex = laneIndex;
  });
}

function renderBacklog() {
  els.backlogList.innerHTML = "";
  const openTasks = state.backlog.filter((task) => !task.completed);
  const doneTasks = state.backlog
    .map((task, index) => ({ task, index }))
    .filter(({ task }) => task.completed)
    .sort((a, b) => {
      if (a.task.completedAt && b.task.completedAt) {
        return Date.parse(b.task.completedAt) - Date.parse(a.task.completedAt);
      }
      if (a.task.completedAt) return -1;
      if (b.task.completedAt) return 1;
      return a.index - b.index;
    })
    .map(({ task }) => task);

  openTasks.forEach((task) => {
    els.backlogList.appendChild(createBacklogCard(task, "pick"));
  });

  if (!openTasks.length) {
    els.backlogList.textContent = "Backlog is empty.";
  }

  els.doneBacklogCount.textContent = String(doneTasks.length);
  els.doneBacklogList.innerHTML = "";
  doneTasks.forEach((task) => {
    els.doneBacklogList.appendChild(createBacklogCard(task, "restore"));
  });
  if (!doneTasks.length) {
    els.doneBacklogList.textContent = "No completed tasks yet.";
  }
}

function createBacklogCard(task, action) {
    const node = els.backlogTemplate.content.cloneNode(true);
    const card = node.querySelector(".task-card");
    const isDone = action === "restore";
    card.dataset.testid = isDone ? "done-backlog-item" : "backlog-item";
    card.dataset.taskId = task.id;
    card.classList.toggle("done", isDone);
    node.querySelector(".task-title").textContent = task.name;
    node.querySelector(".task-time").textContent = isDone
      ? `${formatDuration(task.minutes)} completed`
      : `${formatDuration(task.minutes)} planned`;
    const subtaskSummary = formatSubtaskProgress(task);
    const metaParts = [
      priorityLabel(task),
      subtaskSummary,
      task.priorityReason,
    ].filter(Boolean);
    node.querySelector(".task-meta").textContent = task.priorityReason
      ? metaParts.join(" - ")
      : metaParts.join(" | ");
    const subtaskList = node.querySelector(".task-subtasks");
    task.subtasks.forEach((subtask) => {
      const item = document.createElement("li");
      item.textContent = `${subtask.title} (${formatDuration(subtask.minutes)})`;
      subtaskList.appendChild(item);
    });
    const editButton = node.querySelector('[data-action="edit"]');
    editButton.hidden = isDone;
    editButton.dataset.testid = "edit-backlog-item";
    editButton.addEventListener("click", () => {
      openTaskDetails(task.id, "backlog");
    });
    const button = node.querySelector('[data-action="pick"]');
    button.textContent = isDone ? "Restore" : "Pick up";
    button.addEventListener("click", () => {
      if (isDone) restoreCompletedTask(task.id);
      else pickFromBacklog(task.id);
    });
    return node;
}

function renderCalendar(options = {}) {
  els.calendarBlocks.innerHTML = "";
  const totalMinutes = state.tasks.reduce((sum, task) => sum + task.minutes, 0);
  const doneMinutes = state.tasks
    .filter((task) => task.completed)
    .reduce((sum, task) => sum + task.minutes, 0);
  els.totalTime.textContent = `${formatDuration(totalMinutes)} planned`;
  els.doneTime.textContent = `${formatDuration(doneMinutes)} done`;

  const groupInfo = buildSplitGroupInfo();
  const calendarLayout = buildCalendarLayout();
  applyStableDragLanes(calendarLayout);

  state.tasks.forEach((task) => {
    const block = document.createElement("div");
    block.className = "calendar-block";
    block.dataset.testid = "calendar-block";
    const group = groupInfo.get(task.id);
    const layout = calendarLayout.get(task.id) || { compactOffset: 0, hasConflict: false, laneCount: 1, laneIndex: 0, zIndex: 1 };
    if (task.type === "meeting") block.classList.add("meeting");
    if (task.completed) block.classList.add("completed");
    if (!task.completed && task.elapsedMinutes >= task.minutes) block.classList.add("overdue");
    if (timerState.activeId === task.id) block.classList.add("timer-active");
    if (group) block.classList.add("split-grouped");
    if (layout.hasConflict) block.classList.add("overlap-conflict");
    if (state.selectedTaskId === task.id) block.classList.add("selected");
    block.dataset.id = task.id;
    block.draggable = false;
    const visualHeight = Math.max(CALENDAR_BLOCK_MIN_HEIGHT, task.minutes * getPixelsPerMinute());
    if (visualHeight <= 68) block.classList.add("short");

    // Subtask progress tint
    const { completed: stCompleted, total: stTotal } = getSubtaskProgress(task);
    if (stTotal > 0 && !task.completed && stCompleted > 0) {
      block.style.setProperty("--subtask-ratio", String((stCompleted / stTotal) * 0.55));
    }

    const laneWidth = 100 / layout.laneCount;
    block.style.top = `${task.startMinutes * getPixelsPerMinute()}px`;
    if (layout.compactOffset) {
      block.style.left = `${layout.compactOffset}px`;
      block.style.width = `calc(100% - ${layout.compactOffset}px)`;
    } else {
      block.style.left = `${layout.laneIndex * laneWidth}%`;
      block.style.width = `${laneWidth}%`;
    }
    block.style.height = `${visualHeight}px`;
    block.style.zIndex = String(layout.zIndex || 1);

    const content = document.createElement("div");
    content.className = "calendar-block-content";

    const topLine = document.createElement("div");
    topLine.className = "calendar-block-topline";

    const titleWrap = document.createElement("div");
    titleWrap.className = "calendar-title-wrap";

    const title = document.createElement("span");
    title.className = "calendar-block-title";
    title.dataset.testid = "calendar-block-title";
    title.textContent = task.name;
    title.title = task.name;
    titleWrap.appendChild(title);

    if (group) {
      const part = document.createElement("span");
      part.className = "split-part-label";
      part.textContent = `Part ${group.index}/${group.count}`;
      titleWrap.appendChild(part);
    }

    const remainingMinutes = Math.max(0, task.minutes - task.elapsedMinutes);
    const remainingSeconds = getLiveRemainingSeconds(task);
    const time = document.createElement("span");
    time.className = "calendar-block-time";
    time.textContent = timerState.activeId === task.id
      ? `${formatTimer(remainingSeconds)} left`
      : `${formatDuration(remainingMinutes)} left`;

    const priorityChip = document.createElement("span");
    priorityChip.className = "priority-chip";
    priorityChip.textContent = scoreToLabel(task.priorityScore);

    const topMeta = document.createElement("div");
    topMeta.className = "calendar-top-meta";
    topMeta.append(time);
    const subtaskSummary = formatSubtaskProgress(task, true);
    if (subtaskSummary) {
      const subtaskChip = document.createElement("span");
      subtaskChip.className = "subtask-chip";
      subtaskChip.dataset.testid = "subtask-chip";
      subtaskChip.textContent = subtaskSummary;
      subtaskChip.title = formatSubtaskProgress(task);
      topMeta.append(subtaskChip);
    }
    topMeta.append(priorityChip);

    const meta = document.createElement("span");
    meta.className = "calendar-block-meta";
    meta.textContent = `${formatClockTime(task.startMinutes)} | Impact ${task.impact}/5 | Urgency ${task.urgency}/5 | ${formatDuration(task.minutes)}`;

    topLine.append(titleWrap, topMeta);

    const progress = document.createElement("div");
    progress.className = "calendar-progress";
    progress.dataset.testid = "calendar-progress";
    const progressFill = document.createElement("div");
    progressFill.className = "calendar-progress-fill";
    const percent = task.minutes
      ? Math.round((task.elapsedMinutes / task.minutes) * 100)
      : 0;
    progressFill.style.width = `${Math.min(100, percent)}%`;
    progress.append(progressFill);
    progress.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      const rect = progress.getBoundingClientRect();
      dragState.progressId = task.id;
      dragState.progressRect = rect;
      const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      setElapsedFromRatio(task.id, ratio);
      progress.setPointerCapture(event.pointerId);
    });
    progress.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    const resizeHandle = document.createElement("span");
    resizeHandle.className = "resize-handle";
    resizeHandle.dataset.testid = "resize-handle";
    resizeHandle.title = "Drag to resize";
    resizeHandle.setAttribute("aria-label", `Resize ${task.name}`);
    content.append(topLine, meta, progress);
    block.append(content, resizeHandle);
    block.addEventListener("click", (event) => {
      if (event.target === resizeHandle || dragState.isResizing || dragState.pointerMoved) return;
      openTaskDetails(task.id);
    });
    block.addEventListener("pointerdown", (event) => {
      if (event.target === resizeHandle) return;
      dragState.moveId = task.id;
      dragState.isMoving = true;
      dragState.pointerMoved = false;
      dragState.startY = event.clientY;
      dragState.startTopMinutes = task.startMinutes;
      captureStableDragLanes(task);
      block.setPointerCapture(event.pointerId);
    });
    block.addEventListener("pointerup", () => {
      dragState.moveId = null;
      dragState.isMoving = false;
      dragState.stableLaneCount = 0;
      dragState.stableLaneMap = null;
      dragState.stableTaskIds = null;
    });
    resizeHandle.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      dragState.resizeId = task.id;
      dragState.isResizing = true;
      dragState.startY = event.clientY;
      dragState.startMinutes = task.minutes;
      resizeHandle.setPointerCapture(event.pointerId);
    });
    resizeHandle.addEventListener("pointerup", () => {
      dragState.resizeId = null;
      dragState.isResizing = false;
    });
    els.calendarBlocks.appendChild(block);
  });

  if (!options.skipDetails && !taskEditorState.draft) {
    renderTaskDetails();
  }
}

function makeButton(text, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = text;
  button.addEventListener("click", onClick);
  return button;
}

function buildSplitGroupInfo() {
  const groups = new Map();
  state.tasks.forEach((task) => {
    const groupId = task.splitGroupId || task.parentId;
    if (!groupId) return;
    if (!groups.has(groupId)) groups.set(groupId, []);
    groups.get(groupId).push(task.id);
  });

  const info = new Map();
  groups.forEach((ids) => {
    if (ids.length < 2) return;
    ids.forEach((id, index) => {
      const task = state.tasks.find((item) => item.id === id);
      info.set(id, {
        groupId: task.splitGroupId || task.parentId,
        index: task.splitPartIndex || index + 1,
        count: task.splitPartCount || ids.length,
      });
    });
  });
  return info;
}

function cloneTask(task) {
  return {
    ...task,
    subtasks: task.subtasks.map((subtask) => ({ ...subtask })),
  };
}

function getTaskCollection(location) {
  return location === "backlog" ? state.backlog : state.tasks;
}

function resetTaskEditorState() {
  state.selectedTaskId = null;
  state.selectedTaskLocation = null;
  taskEditorState.mode = null;
  taskEditorState.location = null;
  taskEditorState.draft = null;
}

function prepareTaskEditorDrawer() {
  els.detailAdvanced.open = false;
  els.detailAISection.open = false;
  els.detailBreakdownInstructions.value = "";
  els.detailBreakdownGranularity.value = "medium";
  els.detailBreakdownApplyMode.value = "append";
  els.detailTaskTitle.setCustomValidity("");
  openDrawer(els.taskDetailsPanel);
  renderTaskDetails();
  window.requestAnimationFrame(() => els.detailTaskTitle.focus());
}

function openNewTaskEditor(type = "task") {
  const draft = createTask("Untitled", DEFAULT_MINUTES, type);
  draft.name = "";
  state.selectedTaskId = draft.id;
  state.selectedTaskLocation = "tasks";
  taskEditorState.mode = "create";
  taskEditorState.location = "tasks";
  taskEditorState.draft = draft;
  prepareTaskEditorDrawer();
}

function openTaskDetails(id, location = "tasks") {
  const task = getTaskCollection(location).find((item) => item.id === id);
  if (!task || (location === "backlog" && task.completed)) return;
  state.selectedTaskId = id;
  state.selectedTaskLocation = location;
  taskEditorState.mode = "edit";
  taskEditorState.location = location;
  taskEditorState.draft = cloneTask(task);
  prepareTaskEditorDrawer();
  renderCalendar({ skipDetails: true });
}

function closeTaskDetails() {
  resetTaskEditorState();
  closeDrawer(els.taskDetailsPanel);
  renderCalendar({ skipDetails: true });
}

function renderTaskDetails() {
  const task = taskEditorState.draft;
  if (!task || !taskEditorState.mode) {
    els.taskDetailsPanel.setAttribute("aria-hidden", "true");
    return;
  }

  const isCreate = taskEditorState.mode === "create";
  const isBacklog = taskEditorState.location === "backlog";
  const kind = task.type === "meeting" ? "meeting" : "task";
  els.detailEyebrow.textContent = isCreate ? "New planner item" : isBacklog ? "Backlog item" : "Day item";
  els.detailHeading.textContent = `${isCreate ? "Create" : "Edit"} ${kind}`;
  els.detailTaskTitle.placeholder = kind === "meeting" ? "Meeting title" : "What needs doing?";
  els.detailTaskTitle.value = task.name;
  els.detailTaskStart.value = formatClockTime(task.startMinutes);
  els.detailTaskStartField.hidden = isBacklog;
  els.detailTaskDuration.value = String(task.minutes);
  els.detailTaskProgress.max = String(task.minutes);
  els.detailTaskProgress.value = String(task.elapsedMinutes);
  els.detailPriorityScore.value = scoreToLabel(task.priorityScore);
  els.detailImpact.value = String(task.impact);
  els.detailUrgency.value = String(task.urgency);
  els.detailPriorityReason.value = task.priorityReason;
  els.detailAdvancedSummary.textContent = `${scoreToLabel(task.priorityScore)} · ${formatDuration(task.elapsedMinutes)} done`;
  els.detailTaskActions.hidden = isCreate;
  els.detailAISection.hidden = isCreate;
  els.detailToggleTimer.hidden = isBacklog;
  els.detailToggleDone.hidden = isBacklog;
  els.detailSplit.hidden = isBacklog;
  els.detailToggleTimer.textContent = timerState.activeId === task.id ? "Pause" : "Start";
  els.detailToggleDone.textContent = "Done";
  els.detailBacklog.textContent = isBacklog ? "Pick up" : "Move to backlog";
  els.saveTaskEditor.textContent = isCreate ? `Create ${kind}` : "Save changes";
  renderDetailSubtasks(task);
}

function createVisuallyHiddenLabel(text) {
  const span = document.createElement("span");
  span.className = "visually-hidden";
  span.textContent = text;
  return span;
}

function renderDetailSubtasks(task) {
  els.detailSubtasks.innerHTML = "";
  if (!task.subtasks.length) {
    const empty = document.createElement("p");
    empty.className = "helper detail-subtask-empty";
    empty.textContent = "No subtasks yet.";
    els.detailSubtasks.appendChild(empty);
    return;
  }

  task.subtasks.forEach((subtask, index) => {
    const row = document.createElement("div");
    row.className = "detail-subtask-row";
    row.dataset.testid = "detail-subtask-row";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = subtask.completed;
    checkbox.dataset.testid = "detail-subtask-completed";
    checkbox.setAttribute("aria-label", `Mark ${subtask.title || "new subtask"} complete`);
    checkbox.addEventListener("change", () => {
      subtask.completed = checkbox.checked;
    });

    const titleLabel = document.createElement("label");
    titleLabel.className = "detail-subtask-title-field";
    titleLabel.appendChild(createVisuallyHiddenLabel("Subtask title"));
    const title = document.createElement("input");
    title.type = "text";
    title.maxLength = 180;
    title.placeholder = "Subtask title";
    title.value = subtask.title;
    title.dataset.testid = "detail-subtask-title";
    title.addEventListener("input", () => {
      subtask.title = title.value;
      checkbox.setAttribute("aria-label", `Mark ${title.value.trim() || "new subtask"} complete`);
    });
    titleLabel.appendChild(title);

    const minutesLabel = document.createElement("label");
    minutesLabel.className = "detail-subtask-minutes-field";
    minutesLabel.appendChild(createVisuallyHiddenLabel("Subtask minutes"));
    const minutes = document.createElement("input");
    minutes.type = "number";
    minutes.min = "5";
    minutes.max = "240";
    minutes.step = "5";
    minutes.value = String(subtask.minutes);
    minutes.dataset.testid = "detail-subtask-minutes";
    minutes.addEventListener("input", () => {
      subtask.minutes = clampNumber(minutes.value, 5, 240, subtask.minutes);
    });
    minutesLabel.appendChild(minutes);

    const remove = makeButton("Remove", () => {
      task.subtasks.splice(index, 1);
      renderDetailSubtasks(task);
    });
    remove.className = "ghost detail-subtask-remove";
    remove.dataset.testid = "detail-remove-subtask";
    remove.setAttribute("aria-label", `Remove ${subtask.title || "new subtask"}`);
    row.append(checkbox, titleLabel, minutesLabel, remove);
    els.detailSubtasks.appendChild(row);
  });
}

function syncTaskEditorDraftFromFields({ validate = false } = {}) {
  const task = taskEditorState.draft;
  if (!task) return null;
  const title = els.detailTaskTitle.value.trim();
  els.detailTaskTitle.setCustomValidity(title ? "" : "Enter a title.");
  if (validate && !els.taskEditorForm.reportValidity()) return null;

  task.name = title;
  task.minutes = clampNumber(els.detailTaskDuration.value, MIN_MINUTES, 480, task.minutes);
  task.elapsedMinutes = clampNumber(els.detailTaskProgress.value, 0, task.minutes, task.elapsedMinutes);
  task.startMinutes = clampStartMinutes(
    parseClockTime(els.detailTaskStart.value, task.startMinutes),
    task.minutes
  );
  task.hasExplicitStart = true;
  task.priorityScore = labelToScore(els.detailPriorityScore.value);
  task.impact = clampNumber(els.detailImpact.value, 1, 5, task.impact);
  task.urgency = clampNumber(els.detailUrgency.value, 1, 5, task.urgency);
  task.priorityReason = els.detailPriorityReason.value.trim();
  task.subtasks = task.subtasks
    .filter((subtask) => String(subtask.title || "").trim())
    .map((subtask) => normalizeSubtask(subtask))
    .filter(Boolean);
  return normalizeTask(task);
}

function commitTaskEditor({ closeAfter = true, silent = false } = {}) {
  const nextTask = syncTaskEditorDraftFromFields({ validate: true });
  if (!nextTask) return null;
  const mode = taskEditorState.mode;
  const location = taskEditorState.location;

  if (mode === "create") {
    state.tasks.push(nextTask);
  } else {
    const collection = getTaskCollection(location);
    const index = collection.findIndex((task) => task.id === nextTask.id);
    if (index === -1) return null;
    collection[index] = nextTask;
    if (location === "backlog") sortBacklogByPriority();
  }

  if (location === "tasks" && mode === "edit" && nextTask.elapsedMinutes >= nextTask.minutes) {
    archiveCompletedTask(nextTask.id);
    return null;
  }

  saveState();
  if (!silent) {
    setStatus(mode === "create" ? `${nextTask.type === "meeting" ? "Meeting" : "Task"} created.` : "Task changes saved.");
  }
  if (closeAfter) {
    resetTaskEditorState();
    closeDrawer(els.taskDetailsPanel);
  } else {
    taskEditorState.mode = "edit";
    taskEditorState.draft = cloneTask(nextTask);
  }
  renderBacklog();
  renderCalendar({ skipDetails: true });
  return nextTask;
}

function addEditorSubtask() {
  const task = taskEditorState.draft;
  if (!task) return;
  task.subtasks.push({
    id: createId("subtask"),
    title: "",
    minutes: 25,
    completed: false,
  });
  renderDetailSubtasks(task);
  window.requestAnimationFrame(() => {
    const inputs = els.detailSubtasks.querySelectorAll('[data-testid="detail-subtask-title"]');
    const last = inputs[inputs.length - 1];
    if (last) last.focus();
  });
}

function removeSelectedTask() {
  if (taskEditorState.mode !== "edit" || !state.selectedTaskId) return;
  const collection = getTaskCollection(taskEditorState.location);
  const index = collection.findIndex((task) => task.id === state.selectedTaskId);
  if (index === -1) return;
  const itemKind = collection[index].type === "meeting" ? "meeting" : "task";
  if (!confirm(`Delete this ${itemKind}? This action cannot be undone.`)) return;
  const [removed] = collection.splice(index, 1);
  if (timerState.activeId === removed.id) pauseTimer();
  resetTaskEditorState();
  closeDrawer(els.taskDetailsPanel);
  saveState();
  render();
}

function renderSettings() {
  els.providerMode.value = state.aiSettings.providerMode;
  els.localBaseUrl.value = state.aiSettings.localBaseUrl;
  els.localModel.value = state.aiSettings.localModel;
  els.localApiKey.value = state.aiSettings.localApiKey;
}

function renderReview() {
  const draft = state.reviewDraft;
  const hasDraft = Boolean(draft);
  els.reviewPanel.setAttribute("aria-hidden", hasDraft ? "false" : "true");
  if (!draft) return;

  const isBreakdownDraft = draft.type === "task_breakdown";
  const isContextDraft = draft.type === "context_organize";
  const hasQuestions = Array.isArray(draft.questions) && draft.questions.length > 0;
  els.reviewHeading.textContent = isBreakdownDraft
    ? "Review task breakdown"
    : isContextDraft
      ? "Review context organize"
      : "Review before applying";
  els.applyReview.textContent = isBreakdownDraft
    ? "Apply subtasks"
    : isContextDraft
      ? "Apply accepted changes"
      : "Apply accepted tasks";
  els.reanalyzeDump.hidden = isBreakdownDraft || !hasQuestions;
  els.reviewSummary.textContent = draft.summary || "Review the AI proposal before applying it.";
  els.reviewWarnings.innerHTML = "";
  (draft.warnings || []).forEach((warning) => {
    const item = document.createElement("p");
    item.className = "notice";
    item.textContent = warning;
    els.reviewWarnings.appendChild(item);
  });

  renderReviewQuestions(draft);
  if (isBreakdownDraft) {
    renderReviewSubtasks(draft);
  } else {
    renderReviewTasks(draft);
    if (isContextDraft) renderReviewMergeSuggestions(draft);
  }
}

function renderReviewQuestions(draft) {
  els.reviewQuestions.innerHTML = "";
  if (!draft.answers) draft.answers = {};
  const questions = Array.isArray(draft.questions) ? draft.questions : [];
  els.reviewQuestions.hidden = questions.length === 0;
  if (!questions.length) return;

  const heading = document.createElement("h3");
  heading.textContent = "Optional clarifications";
  els.reviewQuestions.appendChild(heading);

  questions.forEach((question) => {
    const row = document.createElement("label");
    row.className = "question-row";
    row.textContent = question.question;
    const hint = document.createElement("span");
    hint.textContent = question.reason;
    const input = document.createElement("textarea");
    input.rows = 2;
    input.placeholder = "Optional answer";
    input.value = draft.answers[question.id] || "";
    input.addEventListener("input", () => {
      draft.answers[question.id] = input.value;
      saveReviewDraft();
      updateAIAvailability();
    });
    row.append(hint, input);
    els.reviewQuestions.appendChild(row);
  });
}

function renderReviewTasks(draft) {
  els.reviewTasks.innerHTML = "";
  const proposedTasks = Array.isArray(draft.proposedTasks) ? draft.proposedTasks : [];
  const heading = document.createElement("h3");
  heading.textContent = "Proposed tasks";
  els.reviewTasks.appendChild(heading);
  if (!proposedTasks.length) {
    const empty = document.createElement("p");
    empty.className = "helper";
    empty.textContent = "No tasks were extracted yet.";
    els.reviewTasks.appendChild(empty);
  }

  proposedTasks.forEach((task, index) => {
    const card = document.createElement("article");
    card.className = "proposal-card";
    if (!task.accepted) card.classList.add("muted-card");

    const accept = document.createElement("input");
    accept.type = "checkbox";
    accept.checked = task.accepted;
    accept.addEventListener("change", () => {
      task.accepted = accept.checked;
      saveReviewDraft();
      renderReviewTasks(draft);
    });

    const title = document.createElement("input");
    title.type = "text";
    title.value = task.title;
    title.addEventListener("input", () => {
      task.title = title.value;
      saveReviewDraft();
    });

    const minutes = createNumberInput(task.minutes, 10, 480, (value) => {
      task.minutes = value;
      saveReviewDraft();
    });
    const priority = createNumberInput(task.priorityScore, 1, 100, (value) => {
      task.priorityScore = value;
      saveReviewDraft();
    });

    const reason = document.createElement("textarea");
    reason.rows = 2;
    reason.value = task.priorityReason;
    reason.addEventListener("input", () => {
      task.priorityReason = reason.value;
      saveReviewDraft();
    });

    const subtaskList = document.createElement("div");
    subtaskList.className = "proposal-subtasks";
    task.subtasks.forEach((subtask, subtaskIndex) => {
      const subtaskInput = document.createElement("input");
      subtaskInput.type = "text";
      subtaskInput.value = subtask.title;
      subtaskInput.addEventListener("input", () => {
        subtask.title = subtaskInput.value;
        saveReviewDraft();
      });
      const subtaskMinutes = createNumberInput(subtask.minutes, 5, 240, (value) => {
        subtask.minutes = value;
        saveReviewDraft();
      });
      const remove = makeButton("Remove", () => {
        task.subtasks.splice(subtaskIndex, 1);
        saveReviewDraft();
        renderReviewTasks(draft);
      });
      const row = document.createElement("div");
      row.className = "subtask-edit-row";
      row.append(subtaskInput, subtaskMinutes, remove);
      subtaskList.appendChild(row);
    });

    const addSubtask = makeButton("Add subtask", () => {
      task.subtasks.push({ title: "New action", minutes: 25 });
      saveReviewDraft();
      renderReviewTasks(draft);
    });

    const grid = document.createElement("div");
    grid.className = "proposal-grid";
    grid.append(
      makeField("Accept", accept),
      makeField("Task", title),
      makeField("Minutes", minutes),
      makeField("Priority", priority),
      makeField("Reason", reason)
    );

    const removeTaskButton = makeButton("Discard", () => {
      draft.proposedTasks.splice(index, 1);
      saveReviewDraft();
      renderReviewTasks(draft);
    });

    card.append(grid, subtaskList, addSubtask, removeTaskButton);
    els.reviewTasks.appendChild(card);
  });
}

function renderReviewMergeSuggestions(draft) {
  const heading = document.createElement("h3");
  heading.textContent = "Merge suggestions";
  els.reviewTasks.appendChild(heading);
  const suggestions = Array.isArray(draft.mergeSuggestions) ? draft.mergeSuggestions : [];
  if (!suggestions.length) {
    const empty = document.createElement("p");
    empty.className = "helper";
    empty.textContent = "No existing tasks were matched for merging.";
    els.reviewTasks.appendChild(empty);
    return;
  }

  suggestions.forEach((suggestion, index) => {
    const card = document.createElement("article");
    card.className = "proposal-card";
    card.dataset.testid = "merge-suggestion";
    if (!suggestion.accepted) card.classList.add("muted-card");

    const accept = document.createElement("input");
    accept.type = "checkbox";
    accept.checked = suggestion.accepted;
    accept.dataset.testid = "merge-accept";
    accept.addEventListener("change", () => {
      suggestion.accepted = accept.checked;
      saveReviewDraft();
      renderReview();
    });

    const target = document.createElement("input");
    target.type = "text";
    target.value = suggestion.targetTitle || suggestion.taskId;
    target.readOnly = true;
    target.dataset.testid = "merge-target";

    const priority = createNumberInput(suggestion.priorityScore, 1, 100, (value) => {
      suggestion.priorityScore = value;
      saveReviewDraft();
    });
    priority.dataset.testid = "merge-priority";

    const urgency = createNumberInput(suggestion.urgency, 1, 5, (value) => {
      suggestion.urgency = value;
      saveReviewDraft();
    });

    const impact = createNumberInput(suggestion.impact, 1, 5, (value) => {
      suggestion.impact = value;
      saveReviewDraft();
    });

    const reason = document.createElement("textarea");
    reason.rows = 2;
    reason.value = suggestion.priorityReason;
    reason.dataset.testid = "merge-priority-reason";
    reason.addEventListener("input", () => {
      suggestion.priorityReason = reason.value;
      saveReviewDraft();
    });

    const mergeReason = document.createElement("p");
    mergeReason.className = "helper";
    mergeReason.textContent = suggestion.reason;

    const subtaskList = document.createElement("div");
    subtaskList.className = "proposal-subtasks";
    suggestion.subtasks.forEach((subtask, subtaskIndex) => {
      const acceptSubtask = document.createElement("input");
      acceptSubtask.type = "checkbox";
      acceptSubtask.checked = subtask.accepted;
      acceptSubtask.addEventListener("change", () => {
        subtask.accepted = acceptSubtask.checked;
        saveReviewDraft();
      });

      const subtaskInput = document.createElement("input");
      subtaskInput.type = "text";
      subtaskInput.value = subtask.title;
      subtaskInput.dataset.testid = "merge-subtask-title";
      subtaskInput.addEventListener("input", () => {
        subtask.title = subtaskInput.value;
        saveReviewDraft();
      });

      const subtaskMinutes = createNumberInput(subtask.minutes, 5, 240, (value) => {
        subtask.minutes = value;
        saveReviewDraft();
      });

      const remove = makeButton("Remove", () => {
        suggestion.subtasks.splice(subtaskIndex, 1);
        saveReviewDraft();
        renderReview();
      });

      const row = document.createElement("div");
      row.className = "merge-subtask-edit-row";
      row.append(acceptSubtask, subtaskInput, subtaskMinutes, remove);
      subtaskList.appendChild(row);
    });

    const addSubtask = makeButton("Add subtask", () => {
      suggestion.subtasks.push({ title: "New action", minutes: 25, accepted: true });
      saveReviewDraft();
      renderReview();
    });

    const discard = makeButton("Discard", () => {
      draft.mergeSuggestions.splice(index, 1);
      saveReviewDraft();
      renderReview();
    });

    const grid = document.createElement("div");
    grid.className = "proposal-grid merge-grid";
    grid.append(
      makeField("Accept", accept),
      makeField("Existing task", target),
      makeField("Priority", priority),
      makeField("Urgency", urgency),
      makeField("Impact", impact),
      makeField("Priority reason", reason)
    );

    card.append(grid, mergeReason, subtaskList, addSubtask, discard);
    els.reviewTasks.appendChild(card);
  });
}

function renderReviewSubtasks(draft) {
  els.reviewTasks.innerHTML = "";
  const heading = document.createElement("h3");
  heading.textContent = "Proposed subtasks";
  els.reviewTasks.appendChild(heading);
  if (!draft.subtasks.length) {
    const empty = document.createElement("p");
    empty.className = "helper";
    empty.textContent = "No subtasks were proposed yet.";
    els.reviewTasks.appendChild(empty);
    return;
  }

  draft.subtasks.forEach((subtask, index) => {
    const card = document.createElement("article");
    card.className = "proposal-card";
    card.dataset.testid = "breakdown-subtask";
    if (!subtask.accepted) card.classList.add("muted-card");

    const accept = document.createElement("input");
    accept.type = "checkbox";
    accept.checked = subtask.accepted;
    accept.addEventListener("change", () => {
      subtask.accepted = accept.checked;
      saveReviewDraft();
      renderReviewSubtasks(draft);
    });

    const title = document.createElement("input");
    title.type = "text";
    title.value = subtask.title;
    title.dataset.testid = "breakdown-subtask-title";
    title.addEventListener("input", () => {
      subtask.title = title.value;
      saveReviewDraft();
    });

    const minutes = createNumberInput(subtask.minutes, 5, 240, (value) => {
      subtask.minutes = value;
      saveReviewDraft();
    });
    minutes.dataset.testid = "breakdown-subtask-minutes";

    const remove = makeButton("Remove", () => {
      draft.subtasks.splice(index, 1);
      saveReviewDraft();
      renderReviewSubtasks(draft);
    });

    const grid = document.createElement("div");
    grid.className = "proposal-grid breakdown-grid";
    grid.append(
      makeField("Accept", accept),
      makeField("Subtask", title),
      makeField("Minutes", minutes)
    );

    card.append(grid, remove);
    els.reviewTasks.appendChild(card);
  });

  const addSubtask = makeButton("Add subtask", () => {
    draft.subtasks.push({ title: "New action", minutes: 25, accepted: true });
    saveReviewDraft();
    renderReviewSubtasks(draft);
  });
  addSubtask.dataset.testid = "add-breakdown-subtask";
  els.reviewTasks.appendChild(addSubtask);
}

function makeField(labelText, control) {
  const label = document.createElement("label");
  label.textContent = labelText;
  label.appendChild(control);
  return label;
}

function createNumberInput(value, min, max, onChange) {
  const input = document.createElement("input");
  input.type = "number";
  input.min = String(min);
  input.max = String(max);
  input.value = String(value);
  input.addEventListener("input", () => {
    onChange(clampNumber(input.value, min, max, min));
  });
  return input;
}

function render() {
  renderBacklog();
  renderCalendar();
  renderSettings();
  renderReview();
  updateDayTimerDisplay();
  updateAIAvailability();
}

function setStatus(message, isError = false) {
  els.status.textContent = message;
  els.status.classList.toggle("error", isError);
}

function openDrawer(drawer) {
  drawer.setAttribute("aria-hidden", "false");
}

function closeDrawer(drawer) {
  drawer.setAttribute("aria-hidden", "true");
}

function sortBacklogByPriority() {
  const openTasks = state.backlog.filter((task) => !task.completed);
  const doneTasks = state.backlog.filter((task) => task.completed);
  openTasks.sort((a, b) => {
    if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
    if (b.urgency !== a.urgency) return b.urgency - a.urgency;
    return b.impact - a.impact;
  });
  state.backlog = [...openTasks, ...doneTasks];
}

function createPlannerPayload(mode = "brain_dump", options = {}) {
  const refinementDraft = options.refine && state.reviewDraft && state.reviewDraft.type !== "task_breakdown"
    ? state.reviewDraft
    : null;
  return {
    mode,
    input: refinementDraft && refinementDraft.sourceText
      ? refinementDraft.sourceText
      : els.brainDump.value.trim(),
    clarifications: buildClarifications(refinementDraft),
    currentTasks: state.tasks.map(summarizeTaskForAI),
    currentBacklog: state.backlog.filter((task) => !task.completed).map(summarizeTaskForAI),
  };
}

function buildClarifications(draft) {
  if (!draft || !Array.isArray(draft.questions)) return [];
  const answers = draft.answers && typeof draft.answers === "object" ? draft.answers : {};
  return draft.questions
    .map((question) => ({
      id: question.id,
      question: question.question,
      reason: question.reason,
      answer: String(answers[question.id] || "").trim(),
    }))
    .filter((clarification) => clarification.answer)
    .slice(0, 2);
}

function hasAnsweredClarification(draft) {
  return buildClarifications(draft).length > 0;
}

function removeAnsweredQuestions(questions, clarifications) {
  const answeredQuestionText = new Set(
    (clarifications || []).map((item) => normalizeComparableTitle(item.question))
  );
  return (questions || []).filter(
    (question) => !answeredQuestionText.has(normalizeComparableTitle(question.question))
  );
}

function createBreakdownPayload(task) {
  return {
    mode: "task_breakdown",
    task: summarizeTaskForAI(task),
    instructions: els.detailBreakdownInstructions.value.trim(),
    granularity: ["small", "medium", "large"].includes(els.detailBreakdownGranularity.value)
      ? els.detailBreakdownGranularity.value
      : "medium",
    applyMode: els.detailBreakdownApplyMode.value === "replace" ? "replace" : "append",
  };
}

function summarizeTaskForAI(task) {
  return {
    id: task.id,
    title: task.name,
    startTime: formatClockTime(task.startMinutes),
    startMinutes: task.startMinutes,
    minutes: task.minutes,
    completed: task.completed,
    priorityScore: task.priorityScore,
    urgency: task.urgency,
    impact: task.impact,
    priorityReason: task.priorityReason,
    sourceProvider: task.sourceProvider,
    sourceCalendarId: task.sourceCalendarId,
    sourceEventId: task.sourceEventId,
    sourceEventICalUID: task.sourceEventICalUID,
    sourceUpdated: task.sourceUpdated,
    subtasks: task.subtasks.map((subtask) => ({
      title: subtask.title,
      minutes: subtask.minutes,
      completed: subtask.completed,
    })),
  };
}

function normalizeComparableTitle(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function filterExistingTaskProposals(proposedTasks, payload) {
  const existingIds = new Set();
  const existingTitles = new Set();
  [...(payload.currentTasks || []), ...(payload.currentBacklog || [])].forEach((task) => {
    if (task.id) existingIds.add(String(task.id));
    const title = normalizeComparableTitle(task.title || task.name);
    if (title) existingTitles.add(title);
  });

  let skipped = 0;
  const filtered = proposedTasks.filter((task) => {
    const id = task.id ? String(task.id) : "";
    const title = normalizeComparableTitle(task.title || task.name);
    const isExisting = (id && existingIds.has(id)) || (title && existingTitles.has(title));
    if (isExisting) skipped += 1;
    return !isExisting;
  });

  return { filtered, skipped };
}

function findTaskById(taskId) {
  return [...state.tasks, ...state.backlog].find((item) => item.id === taskId);
}

function normalizeMergeSuggestionsForReview(mergeSuggestions) {
  let skipped = 0;
  const normalized = [];
  mergeSuggestions.forEach((suggestion) => {
    const target = findTaskById(suggestion.taskId);
    if (!target) {
      skipped += 1;
      return;
    }
    normalized.push({
      ...suggestion,
      targetTitle: target.name,
      accepted: true,
      subtasks: suggestion.subtasks.map((subtask) => ({
        ...subtask,
        accepted: true,
      })),
    });
  });
  return { normalized, skipped };
}

async function analyzeDump(options = {}) {
  const mode = options.mode === "context_organize" ? "context_organize" : "brain_dump";
  const payload = createPlannerPayload(mode, { refine: options.refine === true });
  if (!payload.input) {
    setStatus("Add a brain dump before analyzing.", true);
    return;
  }

  setStatus(mode === "context_organize" ? "Organizing with context..." : "Analyzing...");
  els.analyzeDump.disabled = true;
  els.contextOrganize.disabled = true;
  els.reanalyzeDump.disabled = true;
  els.thinkingOverlay.setAttribute("aria-hidden", "false");
  try {
    const result = await requestAIPlan(payload);
    const normalized = mode === "context_organize"
      ? ai.normalizeContextOrganizeResponse(result, payload)
      : ai.normalizePlannerResponse(result);
    const questions = removeAnsweredQuestions(normalized.questions, payload.clarifications);
    const { filtered, skipped } = filterExistingTaskProposals(normalized.proposedTasks, payload);
    const warnings = [...normalized.warnings];
    if (skipped) {
      warnings.push(`${skipped} existing task${skipped === 1 ? " was" : "s were"} returned by AI and skipped.`);
    }
    const mergeReview = mode === "context_organize"
      ? normalizeMergeSuggestionsForReview(normalized.mergeSuggestions)
      : { normalized: [], skipped: 0 };
    if (mergeReview.skipped) {
      warnings.push(`${mergeReview.skipped} merge suggestion${mergeReview.skipped === 1 ? " referenced" : "s referenced"} missing tasks and skipped.`);
    }
    state.reviewDraft = {
      type: mode,
      id: createId("dump"),
      sourceText: payload.input,
      summary: normalized.summary,
      warnings,
      questions,
      priorityUpdates: normalized.priorityUpdates,
      answers: {},
      proposedTasks: filtered.map((task) => ({
        ...task,
        accepted: true,
      })),
      mergeSuggestions: mergeReview.normalized,
    };
    saveReviewDraft();
    setStatus(mode === "context_organize" ? "Context draft ready for review." : "Draft ready for review.");
    openDrawer(els.reviewPanel);
    render();
  } catch (err) {
    setStatus(readableAIError(err), true);
  } finally {
    updateAIAvailability();
    els.thinkingOverlay.setAttribute("aria-hidden", "true");
  }
}

async function analyzeTaskBreakdown() {
  const task = commitTaskEditor({ closeAfter: false, silent: true });
  if (!task) {
    setStatus("Select a task before requesting a breakdown.", true);
    return;
  }

  const payload = createBreakdownPayload(task);
  setStatus("Breaking down task...");
  els.detailBreakdownAI.disabled = true;
  els.thinkingOverlay.setAttribute("aria-hidden", "false");
  try {
    const result = await requestAIPlan(payload);
    const normalized = ai.normalizeBreakdownResponse(result);
    state.reviewDraft = {
      type: "task_breakdown",
      id: createId("breakdown"),
      taskId: task.id,
      taskTitle: task.name,
      applyMode: payload.applyMode,
      summary: normalized.summary || `Review proposed subtasks for ${task.name}.`,
      warnings: normalized.warnings,
      questions: normalized.questions,
      subtasks: normalized.subtasks.map((subtask) => ({
        ...subtask,
        accepted: true,
      })),
    };
    saveReviewDraft();
    setStatus("Breakdown ready for review.");
    closeTaskDetails();
    openDrawer(els.reviewPanel);
    renderReview();
  } catch (err) {
    setStatus(readableAIError(err), true);
  } finally {
    updateAIAvailability();
    els.thinkingOverlay.setAttribute("aria-hidden", "true");
  }
}

async function requestAIPlan(payload) {
  if (state.aiSettings.providerMode === "local") {
    return requestLocalAI(payload);
  }
  return requestVercelAI(payload);
}

async function requestVercelAI(payload) {
  const accessToken = cloud ? cloud.getAccessToken() : "";
  if (!accessToken) {
    throw new Error("Sign in to use hosted AI.");
  }
  const response = await fetch("/api/plan", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (json.usage) renderAIUsage(json.usage);
    const error = new Error(json.error || "Vercel AI endpoint failed.");
    error.code = json.code || "request_failed";
    throw error;
  }
  if (cloud) void cloud.refreshUsage();
  return json;
}

async function requestLocalAI(payload) {
  const baseUrl = state.aiSettings.localBaseUrl.trim().replace(/\/+$/, "");
  const model = state.aiSettings.localModel.trim();
  if (!baseUrl || !model) {
    throw new Error("Set a local base URL and model in Settings.");
  }
  const messages = ai.buildPlannerMessages(payload);
  const content = await postLocalChatCompletion(baseUrl, model, messages, true).catch(async (err) => {
    if (!err.canRetryWithoutSchema) throw err;
    return postLocalChatCompletion(baseUrl, model, messages, false);
  });
  const parsed = ai.extractJson(content);
  if (payload.mode === "task_breakdown") return ai.normalizeBreakdownResponse(parsed);
  if (payload.mode === "context_organize") return ai.normalizeContextOrganizeResponse(parsed, payload);
  return ai.normalizePlannerResponse(parsed);
}

async function postLocalChatCompletion(baseUrl, model, messages, useSchema) {
  const isBreakdown = messages.some((message) =>
    String(message.content || "").includes('"mode": "task_breakdown"')
  );
  const isContextOrganize = messages.some((message) =>
    String(message.content || "").includes('"mode": "context_organize"')
  );
  const schema = isBreakdown
    ? ai.breakdownResponseSchema
    : isContextOrganize
      ? ai.contextOrganizeResponseSchema
      : ai.plannerResponseSchema;
  const schemaName = isBreakdown
    ? "overrun_breakdown_response"
    : isContextOrganize
      ? "overrun_context_organize_response"
      : "overrun_planner_response";
  const body = {
    model,
    messages,
    temperature: 0.2,
    max_tokens: 1800,
    response_format: useSchema
      ? {
          type: "json_schema",
          json_schema: {
            name: schemaName,
            strict: true,
            schema,
          },
        }
      : { type: "json_object" },
  };

  const headers = { "Content-Type": "application/json" };
  if (state.aiSettings.localApiKey.trim()) {
    headers.Authorization = `Bearer ${state.aiSettings.localApiKey.trim()}`;
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = json.error && json.error.message
      ? json.error.message
      : "Local AI request failed.";
    const err = new Error(message);
    err.canRetryWithoutSchema = useSchema && /response_format|json_schema|schema/i.test(message);
    throw err;
  }
  return json.choices && json.choices[0] && json.choices[0].message
    ? json.choices[0].message.content
    : "";
}

function readableAIError(err) {
  const message = err && err.message ? err.message : "AI request failed.";
  if (/Failed to fetch|NetworkError|Load failed/i.test(message)) {
    return "AI request failed. In local mode, check the base URL and CORS settings.";
  }
  return message;
}

function applyPriorityUpdates(updates) {
  (updates || []).forEach((update) => {
    const task = [...state.tasks, ...state.backlog].find((item) => item.id === update.taskId);
    if (!task) return;
    task.priorityScore = update.priorityScore;
    task.priorityReason = update.priorityReason;
  });
  if (updates && updates.length) sortBacklogByPriority();
}

function applyReviewDraft() {
  const draft = state.reviewDraft;
  if (!draft) return;
  if (draft.type === "task_breakdown") {
    applyBreakdownReviewDraft(draft);
    return;
  }
  const accepted = (draft.proposedTasks || []).filter((task) => task.accepted && task.title.trim());
  accepted.forEach((proposal) => {
    const parent = createTask(proposal.title.trim(), proposal.minutes, "task", {
      priorityScore: proposal.priorityScore,
      priorityReason: proposal.priorityReason,
      urgency: proposal.urgency,
      impact: proposal.impact,
      sourceDumpId: draft.id,
      subtasks: proposal.subtasks.map((subtask) => ({
        title: subtask.title,
        minutes: subtask.minutes,
      })),
    });
    state.backlog.push(parent);
  });
  if (draft.type === "context_organize") {
    applyMergeSuggestions(draft);
  } else {
    applyPriorityUpdates(draft.priorityUpdates || []);
  }
  sortBacklogByPriority();
  state.reviewDraft = null;
  saveState();
  saveReviewDraft();
  const mergeCount = draft.type === "context_organize"
    ? (draft.mergeSuggestions || []).filter((suggestion) => suggestion.accepted).length
    : 0;
  const taskLabel = `${accepted.length} task${accepted.length === 1 ? "" : "s"} added`;
  const mergeLabel = mergeCount
    ? `, ${mergeCount} merge${mergeCount === 1 ? "" : "s"} applied`
    : "";
  setStatus(`${taskLabel}${mergeLabel}.`);
  closeDrawer(els.reviewPanel);
  render();
}

function applyMergeSuggestions(draft) {
  (draft.mergeSuggestions || []).forEach((suggestion) => {
    if (!suggestion.accepted) return;
    const task = findTaskById(suggestion.taskId);
    if (!task) return;
    task.priorityScore = clampNumber(suggestion.priorityScore, 1, 100, task.priorityScore);
    task.priorityReason = String(suggestion.priorityReason || task.priorityReason).trim();
    task.urgency = clampNumber(suggestion.urgency, 1, 5, task.urgency);
    task.impact = clampNumber(suggestion.impact, 1, 5, task.impact);

    const existingSubtasks = new Set(task.subtasks.map((subtask) => normalizeComparableTitle(subtask.title)));
    (suggestion.subtasks || [])
      .filter((subtask) => subtask.accepted !== false && String(subtask.title || "").trim())
      .forEach((subtask) => {
        const normalizedTitle = normalizeComparableTitle(subtask.title);
        if (existingSubtasks.has(normalizedTitle)) return;
        const nextSubtask = normalizeSubtask({
          id: createId("subtask"),
          title: subtask.title,
          minutes: subtask.minutes,
          completed: false,
        });
        if (!nextSubtask) return;
        task.subtasks.push(nextSubtask);
        existingSubtasks.add(normalizedTitle);
      });
  });
}

function applyBreakdownReviewDraft(draft) {
  const task = [...state.tasks, ...state.backlog].find((item) => item.id === draft.taskId);
  if (!task) {
    setStatus("The task for this breakdown no longer exists.", true);
    return;
  }

  const accepted = draft.subtasks.filter((subtask) => subtask.accepted && subtask.title.trim());
  const nextSubtasks = accepted.map((subtask) => normalizeSubtask({
    id: createId("subtask"),
    title: subtask.title.trim(),
    minutes: subtask.minutes,
    completed: false,
  })).filter(Boolean);

  task.subtasks = draft.applyMode === "replace"
    ? nextSubtasks
    : task.subtasks.concat(nextSubtasks);
  state.reviewDraft = null;
  saveState();
  saveReviewDraft();
  setStatus(`${accepted.length} subtask${accepted.length === 1 ? "" : "s"} applied.`);
  closeDrawer(els.reviewPanel);
  render();
}

function discardReviewDraft() {
  state.reviewDraft = null;
  saveReviewDraft();
  setStatus("AI draft discarded.");
  closeDrawer(els.reviewPanel);
  render();
}

function buildAgentPrompt(task) {
  const status = task.completed
    ? "done"
    : task.elapsedMinutes > 0
      ? "in progress"
      : "open";
  const subtasks = task.subtasks.length
    ? task.subtasks
        .map((subtask) => `- [${subtask.completed ? "x" : " "}] ${subtask.title} (${formatDuration(subtask.minutes)})`)
        .join("\n")
    : "- No subtasks recorded.";

  return [
    "You are helping me complete a task from Overrun Lite.",
    "",
    "## Task",
    task.name,
    "",
    "## Current Planner Context",
    `- Status: ${status}`,
    `- Planned duration: ${formatDuration(task.minutes)}`,
    `- Done so far: ${formatDuration(task.elapsedMinutes)}`,
    `- Priority: ${scoreToLabel(task.priorityScore)} (${task.priorityScore}/100)`,
    `- Impact: ${task.impact}/5`,
    `- Urgency: ${task.urgency}/5`,
    `- Scheduled start: ${formatClockTime(task.startMinutes)}`,
    task.priorityReason ? `- Planner note: ${task.priorityReason}` : "- Planner note: none",
    "",
    "## Subtasks",
    subtasks,
    "",
    "## Request",
    "Help me make concrete progress on this task. Start by briefly restating the goal, then propose or perform the next useful steps based on the available context.",
    "",
    "## Constraints",
    "- Ask clarifying questions if the task is ambiguous or missing required context.",
    "- Do not mark the task complete unless I explicitly say the work is done.",
    "- Preserve user control: propose changes before making broad or destructive edits.",
    "- Keep the output actionable and focused on this task.",
    "",
    "## Expected Output",
    "- A concise summary of what you did or recommend.",
    "- Any files, commands, links, or artifacts I should review.",
    "- Clear next steps if the task cannot be completed in one pass.",
  ].join("\n");
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  els.agentExportPrompt.focus();
  els.agentExportPrompt.select();
  document.execCommand("copy");
}

async function exportSelectedTaskToAgent() {
  const task = commitTaskEditor({ closeAfter: false, silent: true });
  if (!task) {
    setStatus("Select a task before exporting an agent prompt.", true);
    return;
  }
  const prompt = buildAgentPrompt(task);
  els.agentExportPrompt.value = prompt;
  els.agentExportStatus.textContent = "Prompt generated. It is safe to review before using in an agentic tool.";
  openDrawer(els.agentExportPanel);
  try {
    await copyTextToClipboard(prompt);
    els.agentExportStatus.textContent = "Prompt generated and copied to clipboard.";
  } catch (err) {
    els.agentExportStatus.textContent = "Prompt generated. Copy it from the field below.";
  }
}

function openClearBacklogPanel() {
  els.confirmClearBacklog.checked = false;
  els.confirmClearBacklogAction.disabled = true;
  openDrawer(els.clearBacklogPanel);
}

function closeClearBacklogPanel() {
  els.confirmClearBacklog.checked = false;
  els.confirmClearBacklogAction.disabled = true;
  closeDrawer(els.clearBacklogPanel);
}

function clearBacklogConfirmed() {
  if (!els.confirmClearBacklog.checked) return;
  const count = state.backlog.filter((task) => !task.completed).length;
  state.backlog = state.backlog.filter((task) => task.completed);
  saveState();
  closeClearBacklogPanel();
  closeDrawer(els.settingsPanel);
  render();
  setStatus(`${count} open backlog item${count === 1 ? "" : "s"} cleared.`);
}

function reorderTasks(dragId, targetId) {
  if (dragId === targetId) return;
  const dragIndex = state.tasks.findIndex((task) => task.id === dragId);
  const targetIndex = state.tasks.findIndex((task) => task.id === targetId);
  if (dragIndex === -1 || targetIndex === -1) return;
  const [task] = state.tasks.splice(dragIndex, 1);
  state.tasks.splice(targetIndex, 0, task);
  saveState();
  render();
}

function setupDragAndResize() {
  document.addEventListener("pointermove", (event) => {
    if (dragState.progressId && dragState.progressRect) {
      const rect = dragState.progressRect;
      const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      setElapsedFromRatio(dragState.progressId, ratio);
    }
    if (dragState.moveId) {
      const task = state.tasks.find((item) => item.id === dragState.moveId);
      if (!task) return;
      const deltaY = event.clientY - dragState.startY;
      if (Math.abs(deltaY) > 3) dragState.pointerMoved = true;
      const pixelsPerMinute = getPixelsPerMinute();
      const deltaMinutes =
        Math.round(deltaY / (pixelsPerMinute * MOVE_STEP_MINUTES)) *
        MOVE_STEP_MINUTES;
      const nextStartMinutes = clampStartMinutes(
        dragState.startTopMinutes + deltaMinutes,
        task.minutes
      );
      if (!canMoveTaskToStart(task.id, nextStartMinutes)) return;
      task.startMinutes = nextStartMinutes;
      task.hasExplicitStart = true;
      saveState();
      renderCalendar({ skipDetails: true });
      renderBacklog();
      return;
    }
    if (!dragState.resizeId) return;
    const task = state.tasks.find((item) => item.id === dragState.resizeId);
    if (!task) return;
    const deltaY = event.clientY - dragState.startY;
    const pixelsPerMinute = getPixelsPerMinute();
    const deltaMinutes =
      Math.round(deltaY / (pixelsPerMinute * RESIZE_STEP_MINUTES)) *
      RESIZE_STEP_MINUTES;
    const nextMinutes = Math.max(
      MIN_MINUTES,
      dragState.startMinutes + deltaMinutes
    );
    task.minutes = nextMinutes;
    task.elapsedMinutes = Math.min(task.elapsedMinutes, task.minutes);
    saveState();
    renderCalendar();
  });

  document.addEventListener("pointerup", () => {
    dragState.resizeId = null;
    dragState.isResizing = false;
    dragState.moveId = null;
    dragState.isMoving = false;
    dragState.progressId = null;
    dragState.progressRect = null;
    dragState.stableLaneCount = 0;
    dragState.stableLaneMap = null;
    dragState.stableTaskIds = null;
  });
}

function setupEvents() {
  els.addTask.addEventListener("click", () => openNewTaskEditor("task"));
  els.addMeeting.addEventListener("click", () => openNewTaskEditor("meeting"));
  els.analyzeDump.addEventListener("click", analyzeDump);
  els.contextOrganize.addEventListener("click", () => analyzeDump({ mode: "context_organize" }));
  els.reanalyzeDump.addEventListener("click", () => {
    analyzeDump({
      mode: state.reviewDraft && state.reviewDraft.type === "context_organize" ? "context_organize" : "brain_dump",
      refine: true,
    });
  });
  els.clearDump.addEventListener("click", () => {
    els.brainDump.value = "";
    updateDumpCharCount();
    setStatus("");
  });
  els.brainDump.addEventListener("input", updateDumpCharCount);
  els.themeToggle.addEventListener("click", toggleTheme);
  els.toggleDay.addEventListener("click", toggleDayTimer);
  els.openAccount.addEventListener("click", () => {
    setAccountStatus("");
    openDrawer(els.accountPanel);
  });
  els.closeAccount.addEventListener("click", () => closeDrawer(els.accountPanel));
  els.acceptInvite.addEventListener("click", () => {
    els.acceptInvite.disabled = true;
    setAccountStatus("Opening invitation...");
    try {
      cloud.acceptInvite();
    } catch (err) {
      els.acceptInvite.disabled = false;
      setAccountStatus(err.message || "Could not open the invitation.", true);
    }
  });
  els.retryAuthLink.addEventListener("click", async () => {
    els.retryAuthLink.disabled = true;
    setAccountStatus("Verifying link...");
    try {
      await cloud.retryAuthLink();
    } catch (err) {
      setAccountStatus(err.message || "Could not verify the link.", true);
    } finally {
      els.retryAuthLink.disabled = false;
    }
  });
  els.openSettings.addEventListener("click", () => openDrawer(els.settingsPanel));
  els.closeSettings.addEventListener("click", () => closeDrawer(els.settingsPanel));
  els.closeAgentExport.addEventListener("click", () => closeDrawer(els.agentExportPanel));
  els.clearLocalStorage.addEventListener("click", clearLocalStorageState);
  els.signInForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setAccountStatus("Signing in...");
    try {
      await cloud.signIn(els.accountEmail.value, els.accountPassword.value);
      els.accountPassword.value = "";
      setAccountStatus("");
      closeDrawer(els.accountPanel);
    } catch (err) {
      setAccountStatus(err.message || "Could not sign in.", true);
    }
  });
  els.forgotPassword.addEventListener("click", async () => {
    if (!els.accountEmail.reportValidity()) return;
    els.forgotPassword.disabled = true;
    setAccountStatus("Sending reset email...");
    try {
      await cloud.requestPasswordReset(els.accountEmail.value);
      setAccountStatus("If that account exists, a password reset email is on its way.");
    } catch (err) {
      setAccountStatus(err.message || "Could not send a password reset email.", true);
    } finally {
      els.forgotPassword.disabled = false;
    }
  });
  els.activationForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (els.activationPassword.value !== els.activationPasswordConfirm.value) {
      setAccountStatus("Passwords do not match.", true);
      return;
    }
    setAccountStatus("Activating...");
    try {
      await cloud.setPassword(els.activationPassword.value);
      els.activationPassword.value = "";
      els.activationPasswordConfirm.value = "";
      setAccountStatus("Account activated.");
      renderAccount(cloud.getSnapshot());
      closeDrawer(els.accountPanel);
    } catch (err) {
      setAccountStatus(err.message || "Could not activate the account.", true);
    }
  });
  els.recoveryForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (els.recoveryPassword.value !== els.recoveryPasswordConfirm.value) {
      setAccountStatus("Passwords do not match.", true);
      return;
    }
    setAccountStatus("Resetting password...");
    try {
      await cloud.setPassword(els.recoveryPassword.value);
      els.recoveryPassword.value = "";
      els.recoveryPasswordConfirm.value = "";
      setAccountStatus("Password reset complete.");
      renderAccount(cloud.getSnapshot());
      closeDrawer(els.accountPanel);
    } catch (err) {
      setAccountStatus(err.message || "Could not reset the password.", true);
    }
  });
  els.signOut.addEventListener("click", async () => {
    setAccountStatus("Signing out...");
    try {
      await cloud.signOut();
      setAccountStatus("");
      closeDrawer(els.accountPanel);
    } catch (err) {
      setAccountStatus(err.message || "Could not sign out.", true);
    }
  });
  els.initialSyncLocal.addEventListener("click", () => finishInitialSyncChoice("local"));
  els.initialSyncCloud.addEventListener("click", () => finishInitialSyncChoice("cloud"));
  els.conflictUseCloud.addEventListener("click", async () => {
    const resolved = await cloud.resolveConflict("cloud");
    if (resolved) closeDrawer(els.syncConflictPanel);
  });
  els.conflictUseLocal.addEventListener("click", async () => {
    els.conflictUseLocal.disabled = true;
    try {
      const resolved = await cloud.resolveConflict("local");
      if (resolved) closeDrawer(els.syncConflictPanel);
    } catch (err) {
      setStatus("Could not resolve the sync conflict. Your local work is still safe.", true);
    } finally {
      els.conflictUseLocal.disabled = false;
    }
  });
  els.closeReview.addEventListener("click", () => closeDrawer(els.reviewPanel));
  els.closeTaskDetails.addEventListener("click", closeTaskDetails);
  els.cancelTaskEditor.addEventListener("click", closeTaskDetails);
  els.detailAddSubtask.addEventListener("click", addEditorSubtask);
  els.taskEditorForm.addEventListener("submit", (event) => {
    event.preventDefault();
    commitTaskEditor();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || els.taskDetailsPanel.getAttribute("aria-hidden") === "true") return;
    if (els.reviewPanel.getAttribute("aria-hidden") === "false" || els.agentExportPanel.getAttribute("aria-hidden") === "false") return;
    closeTaskDetails();
  });
  els.applyReview.addEventListener("click", applyReviewDraft);
  els.discardReview.addEventListener("click", discardReviewDraft);
  els.detailTaskDuration.addEventListener("input", () => {
    els.detailTaskProgress.max = String(clampNumber(
      els.detailTaskDuration.value,
      MIN_MINUTES,
      480,
      DEFAULT_MINUTES
    ));
  });
  [els.detailTaskDuration, els.detailTaskProgress].forEach((input) => {
    input.addEventListener("input", () => {
      const minutes = clampNumber(els.detailTaskProgress.value, 0, 480, 0);
      els.detailAdvancedSummary.textContent = `${els.detailPriorityScore.value} · ${formatDuration(minutes)} done`;
    });
  });
  els.detailPriorityScore.addEventListener("change", () => {
    const minutes = clampNumber(els.detailTaskProgress.value, 0, 480, 0);
    els.detailAdvancedSummary.textContent = `${els.detailPriorityScore.value} · ${formatDuration(minutes)} done`;
  });
  els.detailToggleTimer.addEventListener("click", () => {
    const task = commitTaskEditor({ closeAfter: false, silent: true });
    if (!task) return;
    if (timerState.activeId === task.id) {
      pauseTimer();
      closeTaskDetails();
    } else {
      startTimer(task.id);
      closeTaskDetails();
    }
  });
  els.detailToggleDone.addEventListener("click", () => {
    const task = commitTaskEditor({ closeAfter: false, silent: true });
    if (!task) return;
    archiveCompletedTask(task.id);
  });
  els.detailSplit.addEventListener("click", () => {
    const task = commitTaskEditor({ closeAfter: false, silent: true });
    if (!task) return;
    splitTask(task.id);
  });
  els.detailExportAgent.addEventListener("click", exportSelectedTaskToAgent);
  els.copyAgentExport.addEventListener("click", async () => {
    try {
      await copyTextToClipboard(els.agentExportPrompt.value);
      els.agentExportStatus.textContent = "Prompt copied to clipboard.";
    } catch (err) {
      els.agentExportStatus.textContent = "Could not copy automatically. Select the prompt and copy it manually.";
    }
  });
  els.detailBreakdownAI.addEventListener("click", analyzeTaskBreakdown);
  els.detailBacklog.addEventListener("click", () => {
    const location = taskEditorState.location;
    const task = commitTaskEditor({ closeAfter: false, silent: true });
    if (!task) return;
    if (location === "backlog") pickFromBacklog(task.id);
    else pushToBacklog(task.id);
  });
  els.detailDelete.addEventListener("click", removeSelectedTask);
  els.sortBacklog.addEventListener("click", () => {
    sortBacklogByPriority();
    saveState();
    renderBacklog();
  });
  els.saveSettings.addEventListener("click", () => {
    state.aiSettings = {
      providerMode: els.providerMode.value,
      localBaseUrl: els.localBaseUrl.value.trim() || "http://localhost:11434/v1",
      localModel: els.localModel.value.trim(),
      localApiKey: els.localApiKey.value,
    };
    saveSettings();
    renderAIUsage(cloudUsage);
    setStatus("AI settings saved.");
    closeDrawer(els.settingsPanel);
  });

  els.saveDay.addEventListener("click", () => {
    exportCompletedDay();
    closeDrawer(els.settingsPanel);
  });
  els.dayReport.addEventListener("click", () => {
    exportDayReport();
    closeDrawer(els.settingsPanel);
  });
  els.exportBacklog.addEventListener("click", () => {
    exportBacklog();
    closeDrawer(els.settingsPanel);
  });
  els.importBacklog.addEventListener("click", () => {
    els.backlogFile.value = "";
    els.backlogFile.click();
  });
  els.backlogFile.addEventListener("change", (event) => {
    importBacklog(event);
    closeDrawer(els.settingsPanel);
  });
  els.clearBacklog.addEventListener("click", openClearBacklogPanel);
  els.cancelClearBacklog.addEventListener("click", closeClearBacklogPanel);
  els.cancelClearBacklogSecondary.addEventListener("click", closeClearBacklogPanel);
  els.confirmClearBacklog.addEventListener("change", () => {
    els.confirmClearBacklogAction.disabled = !els.confirmClearBacklog.checked;
  });
  els.confirmClearBacklogAction.addEventListener("click", clearBacklogConfirmed);
}

function serializeTask(task) {
  return {
    id: task.id,
    name: task.name,
    title: task.name,
    minutes: task.minutes,
    type: task.type,
    startMinutes: task.startMinutes,
    startTime: formatClockTime(task.startMinutes),
    hasExplicitStart: task.hasExplicitStart,
    elapsedMinutes: task.elapsedMinutes,
    completed: task.completed,
    completedAt: task.completedAt,
    priorityScore: task.priorityScore,
    priorityReason: task.priorityReason,
    urgency: task.urgency,
    impact: task.impact,
    sourceDumpId: task.sourceDumpId,
    sourceProvider: task.sourceProvider,
    sourceCalendarId: task.sourceCalendarId,
    sourceEventId: task.sourceEventId,
    sourceEventICalUID: task.sourceEventICalUID,
    sourceUpdated: task.sourceUpdated,
    sourceImportId: task.sourceImportId,
    sourceSnapshotId: task.sourceSnapshotId,
    parentId: task.parentId,
    splitGroupId: task.splitGroupId,
    splitPartIndex: task.splitPartIndex,
    splitPartCount: task.splitPartCount,
    subtasks: task.subtasks.map((subtask) => ({
      id: subtask.id,
      title: subtask.title,
      minutes: subtask.minutes,
      completed: subtask.completed,
    })),
  };
}

function buildDaySummary(tasks = state.tasks) {
  const plannedMinutes = tasks.reduce((sum, task) => sum + task.minutes, 0);
  const doneMinutes = tasks.reduce((sum, task) => sum + task.elapsedMinutes, 0);
  const completedTasks = tasks.filter((task) => task.completed).length;
  return {
    plannedMinutes,
    doneMinutes,
    taskCount: tasks.length,
    completedTasks,
    inProgressTasks: tasks.filter((task) => !task.completed && task.elapsedMinutes > 0).length,
    openTasks: tasks.filter((task) => !task.completed).length,
  };
}

function buildDaySnapshot() {
  const exportedAt = new Date().toISOString();
  return {
    type: "overrun_day_snapshot",
    version: 1,
    exportedAt,
    date: exportedAt.slice(0, 10),
    tasks: state.tasks.map(serializeTask),
    backlog: state.backlog.map(serializeTask),
    summary: buildDaySummary(),
  };
}

function exportCompletedDay() {
  downloadJson(buildDaySnapshot(), "overrun_day.json");
}

function exportBacklog() {
  downloadJson({
    type: "overrun_backlog_export",
    version: 1,
    exportedAt: new Date().toISOString(),
    backlog: state.backlog.map(serializeTask),
  }, "overrun_backlog.json");
}

function downloadJson(payload, filename) {
  downloadText(JSON.stringify(payload, null, 2), filename, "application/json");
}

function downloadText(content, filename, type = "text/plain") {
  const blob = new Blob([content], { type });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function importBacklog(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const candidates = getImportCandidates(parsed);
      if (!candidates) {
        setStatus("Backlog file must contain a backlog export, day snapshot, or task array.", true);
        return;
      }
      const { imported, skipped } = importTasksToBacklog(candidates.tasks, candidates.sourceId);
      state.backlog = imported.concat(state.backlog);
      sortBacklogByPriority();
      saveState();
      render();
      setStatus(`${imported.length} backlog item${imported.length === 1 ? "" : "s"} imported. ${skipped} duplicate${skipped === 1 ? "" : "s"} skipped.`);
    } catch (err) {
      setStatus("Invalid backlog JSON file.", true);
      console.warn("Invalid backlog file", err);
    }
  };
  reader.readAsText(file);
}

function getImportCandidates(parsed) {
  if (Array.isArray(parsed)) {
    return { sourceId: "legacy-array", tasks: parsed };
  }
  if (!parsed || typeof parsed !== "object") return null;
  if (parsed.type === "overrun_backlog_export" && Array.isArray(parsed.backlog)) {
    return {
      sourceId: parsed.exportedAt || "backlog-export",
      tasks: parsed.backlog,
    };
  }
  if (parsed.type === "overrun_day_snapshot" && (Array.isArray(parsed.tasks) || Array.isArray(parsed.backlog))) {
    return {
      sourceId: parsed.exportedAt || parsed.date || "day-snapshot",
      tasks: [...(Array.isArray(parsed.tasks) ? parsed.tasks : []), ...(Array.isArray(parsed.backlog) ? parsed.backlog : [])],
    };
  }
  return null;
}

function importTasksToBacklog(items, sourceId) {
  const existingKeys = buildExistingImportKeys();
  const imported = [];
  let skipped = 0;
  items.forEach((item) => {
    const source = item && typeof item === "object" ? item : {};
    const normalized = normalizeTask({
      ...source,
      id: createId(),
      name: source.name || source.title || "Imported task",
      sourceImportId: source.sourceImportId || source.id || source.sourceEventId || source.sourceEventICalUID,
      sourceSnapshotId: source.sourceSnapshotId || sourceId,
    });
    const keys = getTaskImportKeys(normalized);
    if (keys.some((key) => existingKeys.has(key))) {
      skipped += 1;
      return;
    }
    keys.forEach((key) => existingKeys.add(key));
    imported.push(normalized);
  });
  return { imported, skipped };
}

function buildExistingImportKeys() {
  const keys = new Set();
  [...state.tasks, ...state.backlog].forEach((task) => {
    getTaskImportKeys(task).forEach((key) => keys.add(key));
  });
  return keys;
}

function getTaskImportKeys(task) {
  return [
    `title:${normalizeComparableTitle(task.name || task.title)}`,
    task.sourceImportId ? `import:${task.sourceImportId}` : "",
    task.sourceSnapshotId && task.sourceImportId ? `snapshot:${task.sourceSnapshotId}:${task.sourceImportId}` : "",
    task.sourceProvider && task.sourceEventId ? `source-event:${task.sourceProvider}:${task.sourceEventId}` : "",
    task.sourceProvider && task.sourceEventICalUID ? `source-ical:${task.sourceProvider}:${task.sourceEventICalUID}` : "",
  ].filter(Boolean);
}

function exportDayReport() {
  downloadText(buildDayReport(), "overrun_day_report.txt", "text/plain");
}

function buildDayReport() {
  const tasks = [...state.tasks].sort((a, b) => a.startMinutes - b.startMinutes || a.name.localeCompare(b.name));
  const summary = buildDaySummary(tasks);
  const lines = [
    `Overrun Lite day report - ${new Date().toLocaleDateString()}`,
    "",
    "Totals",
    `Planned: ${formatDuration(summary.plannedMinutes)}`,
    `Done: ${formatDuration(summary.doneMinutes)}`,
    `Tasks: ${summary.completedTasks} completed, ${summary.inProgressTasks} in progress, ${summary.openTasks} open`,
    "",
    "Hour by hour",
  ];

  if (!tasks.length) {
    lines.push("No day tasks planned.");
    return lines.join("\n");
  }

  tasks.forEach((task) => {
    const endMinutes = task.startMinutes + task.minutes;
    const status = task.completed ? "done" : task.elapsedMinutes > 0 ? "in progress" : "open";
    lines.push(`${formatClockTime(task.startMinutes)}-${formatClockTime(endMinutes)} | ${task.name}`);
    lines.push(`  ${status}; planned ${formatDuration(task.minutes)}; done ${formatDuration(task.elapsedMinutes)}`);
    const completedSubtasks = task.subtasks.filter((subtask) => subtask.completed);
    if (completedSubtasks.length) {
      lines.push(`  completed subtasks: ${completedSubtasks.map((subtask) => subtask.title).join(", ")}`);
    }
    if (task.priorityReason) {
      lines.push(`  note: ${task.priorityReason}`);
    }
  });

  return lines.join("\n");
}

async function boot() {
  setupTheme();
  loadState();
  setupEvents();
  render();
  setupDragAndResize();
  if (!cloud) return;
  await cloud.init({
    getPlannerState,
    chooseInitialSync,
    onAccount: activateAccount,
    onGuest: activateGuest,
    onCapabilities(capabilities) {
      cloudCapabilities = capabilities;
      renderAccount(cloud.getSnapshot());
    },
    onAuth: renderAccount,
    onConflict: showSyncConflict,
    onSyncStatus: setSyncStatus,
    onUsage: renderAIUsage,
  });
}

boot().catch((err) => {
  console.warn("Cloud initialization failed", err);
  setSyncStatus("Local only");
  updateAIAvailability();
});
