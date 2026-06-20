const STORAGE_KEY = "overrun_lite_state";
const ID_COUNTER_KEY = "overrun_lite_id_counter";
const SETTINGS_KEY = "overrun_lite_ai_settings";
const REVIEW_KEY = "overrun_lite_review_draft";
const memoryStore = {};
const DEFAULT_MINUTES = 60;
const MIN_MINUTES = 10;
const SEGMENT_BLOCK = 30;
const RESIZE_STEP_MINUTES = 5;
const CALENDAR_BLOCK_MIN_HEIGHT = 56;

const ai = window.OverrunAI;

const state = {
  tasks: [],
  backlog: [],
  selectedTaskId: null,
  reviewDraft: null,
  aiSettings: {
    providerMode: "vercel",
    localBaseUrl: "http://localhost:11434/v1",
    localModel: "",
    localApiKey: "",
  },
};

const els = {
  addTask: document.getElementById("add-task"),
  addMeeting: document.getElementById("add-meeting"),
  analyzeDump: document.getElementById("analyze-dump"),
  applyReview: document.getElementById("apply-review"),
  backlogFile: document.getElementById("backlog-file"),
  backlogList: document.getElementById("backlog-list"),
  backlogTemplate: document.getElementById("backlog-template"),
  brainDump: document.getElementById("brain-dump"),
  calendarBlocks: document.getElementById("calendar-blocks"),
  clearDump: document.getElementById("clear-dump"),
  closeReview: document.getElementById("close-review"),
  closeSettings: document.getElementById("close-settings"),
  closeTaskDetails: document.getElementById("close-task-details"),
  dayTimer: document.getElementById("day-timer"),
  detailBacklog: document.getElementById("detail-backlog"),
  detailDelete: document.getElementById("detail-delete"),
  detailHeading: document.getElementById("detail-heading"),
  detailImpact: document.getElementById("detail-impact"),
  detailPriorityReason: document.getElementById("detail-priority-reason"),
  detailPriorityScore: document.getElementById("detail-priority-score"),
  detailSplit: document.getElementById("detail-split"),
  detailSubtasks: document.getElementById("detail-subtasks"),
  detailTaskDuration: document.getElementById("detail-task-duration"),
  detailTaskProgress: document.getElementById("detail-task-progress"),
  detailTaskTitle: document.getElementById("detail-task-title"),
  detailToggleDone: document.getElementById("detail-toggle-done"),
  detailToggleTimer: document.getElementById("detail-toggle-timer"),
  detailUrgency: document.getElementById("detail-urgency"),
  discardReview: document.getElementById("discard-review"),
  doneTime: document.getElementById("done-time"),
  exportBacklog: document.getElementById("export-backlog"),
  importBacklog: document.getElementById("import-backlog"),
  localApiKey: document.getElementById("local-api-key"),
  localBaseUrl: document.getElementById("local-base-url"),
  localModel: document.getElementById("local-model"),
  openSettings: document.getElementById("open-settings"),
  providerMode: document.getElementById("provider-mode"),
  reanalyzeDump: document.getElementById("reanalyze-dump"),
  reviewPanel: document.getElementById("review-panel"),
  reviewQuestions: document.getElementById("review-questions"),
  reviewSummary: document.getElementById("review-summary"),
  reviewTasks: document.getElementById("review-tasks"),
  reviewWarnings: document.getElementById("review-warnings"),
  saveDay: document.getElementById("save-day"),
  saveSettings: document.getElementById("save-settings"),
  settingsPanel: document.getElementById("settings-panel"),
  sortBacklog: document.getElementById("sort-backlog"),
  status: document.getElementById("ai-status"),
  taskDetailsPanel: document.getElementById("task-details-panel"),
  toggleDay: document.getElementById("toggle-day"),
  totalTime: document.getElementById("total-time"),
};

const dragState = {
  resizeId: null,
  progressId: null,
  progressRect: null,
  startY: 0,
  startMinutes: 0,
  isResizing: false,
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

function loadState() {
  const parsed = readJson(STORAGE_KEY, {});
  state.tasks = Array.isArray(parsed.tasks) ? parsed.tasks.map(normalizeTask) : [];
  state.backlog = Array.isArray(parsed.backlog) ? parsed.backlog.map(normalizeTask) : [];
  state.aiSettings = {
    ...state.aiSettings,
    ...readJson(SETTINGS_KEY, {}),
  };
  state.reviewDraft = readJson(REVIEW_KEY, null);
}

function saveState() {
  safeSet(
    STORAGE_KEY,
    JSON.stringify({ tasks: state.tasks, backlog: state.backlog })
  );
}

function saveSettings() {
  safeSet(SETTINGS_KEY, JSON.stringify(state.aiSettings));
}

function saveReviewDraft() {
  if (state.reviewDraft) {
    safeSet(REVIEW_KEY, JSON.stringify(state.reviewDraft));
  } else {
    safeRemove(REVIEW_KEY);
  }
}

function formatDuration(minutes) {
  const safeMinutes = Math.max(0, Math.round(Number(minutes) || 0));
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  return `${hours}h ${mins}m`;
}

function createId(prefix = "task") {
  const current = Number(safeGet(ID_COUNTER_KEY) || "0") + 1;
  safeSet(ID_COUNTER_KEY, String(current));
  return `${prefix}-${current}`;
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
    elapsedMinutes,
    completed: Boolean(source.completed),
    priorityScore: clampNumber(source.priorityScore, 1, 100, 50),
    priorityReason: String(source.priorityReason || "").trim(),
    urgency: clampNumber(source.urgency, 1, 5, 3),
    impact: clampNumber(source.impact, 1, 5, 3),
    sourceDumpId: source.sourceDumpId ? String(source.sourceDumpId) : null,
    parentId: source.parentId ? String(source.parentId) : null,
    splitGroupId: source.splitGroupId || source.parentId ? String(source.splitGroupId || source.parentId) : null,
    splitPartIndex: source.splitPartIndex ? clampNumber(source.splitPartIndex, 1, 99, 1) : null,
    splitPartCount: source.splitPartCount ? clampNumber(source.splitPartCount, 1, 99, 1) : null,
    subtasks: Array.isArray(source.subtasks)
      ? source.subtasks.map(normalizeSubtask).filter(Boolean)
      : [],
  };
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
    elapsedMinutes: 0,
    completed: false,
    ...overrides,
  });
}

function addTask(name, type = "task") {
  if (!name.trim()) return;
  state.tasks.push(createTask(name.trim(), DEFAULT_MINUTES, type));
  saveState();
  render();
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
    })
  );
  state.tasks.splice(taskIndex, 1, ...splitTasks);
  state.selectedTaskId = splitTasks[0].id;
  saveState();
  render();
  openTaskDetails(splitTasks[0].id);
  return splitTasks;
}

function pushToBacklog(id) {
  const taskIndex = state.tasks.findIndex((item) => item.id === id);
  if (taskIndex === -1) return;
  const [task] = state.tasks.splice(taskIndex, 1);
  state.backlog.unshift(task);
  if (state.selectedTaskId === id) {
    state.selectedTaskId = null;
    closeDrawer(els.taskDetailsPanel);
  }
  sortBacklogByPriority();
  saveState();
  render();
}

function pickFromBacklog(id) {
  const taskIndex = state.backlog.findIndex((item) => item.id === id);
  if (taskIndex === -1) return;
  const [task] = state.backlog.splice(taskIndex, 1);
  state.tasks.push(task);
  saveState();
  render();
}

function removeTask(id) {
  const taskIndex = state.tasks.findIndex((item) => item.id === id);
  if (taskIndex === -1) return;
  state.tasks.splice(taskIndex, 1);
  if (state.selectedTaskId === id) {
    state.selectedTaskId = null;
    closeDrawer(els.taskDetailsPanel);
  }
  saveState();
  render();
}

function markTaskDone(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  task.completed = !task.completed;
  task.elapsedMinutes = task.completed ? task.minutes : Math.min(task.elapsedMinutes, task.minutes);
  saveState();
  render();
}

function setElapsedMinutes(id, minutes) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  const next = Math.max(0, Math.min(task.minutes, minutes));
  task.elapsedMinutes = next;
  task.completed = task.elapsedMinutes >= task.minutes;
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
    task.elapsedMinutes = task.minutes;
    task.completed = true;
    pauseTimer();
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

function priorityLabel(task) {
  return `P${task.priorityScore} | Impact ${task.impact}/5 | Urgency ${task.urgency}/5`;
}

function renderBacklog() {
  els.backlogList.innerHTML = "";
  state.backlog.forEach((task) => {
    const node = els.backlogTemplate.content.cloneNode(true);
    const card = node.querySelector(".task-card");
    card.dataset.testid = "backlog-item";
    card.dataset.taskId = task.id;
    node.querySelector(".task-title").textContent = task.name;
    node.querySelector(".task-time").textContent = `${formatDuration(task.minutes)} planned`;
    node.querySelector(".task-meta").textContent = task.priorityReason
      ? `${priorityLabel(task)} - ${task.priorityReason}`
      : priorityLabel(task);
    const subtaskList = node.querySelector(".task-subtasks");
    task.subtasks.forEach((subtask) => {
      const item = document.createElement("li");
      item.textContent = `${subtask.title} (${formatDuration(subtask.minutes)})`;
      subtaskList.appendChild(item);
    });
    node.querySelector("button").addEventListener("click", () => {
      pickFromBacklog(task.id);
    });
    els.backlogList.appendChild(node);
  });

  if (!state.backlog.length) {
    els.backlogList.textContent = "Backlog is empty.";
  }
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

  state.tasks.forEach((task) => {
    const block = document.createElement("div");
    block.className = "calendar-block";
    block.dataset.testid = "calendar-block";
    const group = groupInfo.get(task.id);
    if (task.type === "meeting") block.classList.add("meeting");
    if (task.completed) block.classList.add("completed");
    if (!task.completed && task.elapsedMinutes >= task.minutes) block.classList.add("overdue");
    if (group) block.classList.add("split-grouped");
    if (state.selectedTaskId === task.id) block.classList.add("selected");
    block.dataset.id = task.id;
    block.draggable = true;
    const visualHeight = Math.max(CALENDAR_BLOCK_MIN_HEIGHT, task.minutes * getPixelsPerMinute());
    if (visualHeight <= 68) block.classList.add("short");
    block.style.height = `${visualHeight}px`;

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
    priorityChip.textContent = `P${task.priorityScore}`;

    const topMeta = document.createElement("div");
    topMeta.className = "calendar-top-meta";
    topMeta.append(time, priorityChip);

    const meta = document.createElement("span");
    meta.className = "calendar-block-meta";
    meta.textContent = `Impact ${task.impact}/5 | Urgency ${task.urgency}/5 | ${formatDuration(task.minutes)}`;

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
      if (event.target === resizeHandle || dragState.isResizing) return;
      openTaskDetails(task.id);
    });
    block.addEventListener("dragstart", (event) => {
      if (dragState.isResizing) {
        event.preventDefault();
        return;
      }
      event.dataTransfer.setData("text/plain", task.id);
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

  if (!options.skipDetails) {
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

function getSelectedTask() {
  if (!state.selectedTaskId) return null;
  return state.tasks.find((task) => task.id === state.selectedTaskId) || null;
}

function openTaskDetails(id) {
  state.selectedTaskId = id;
  openDrawer(els.taskDetailsPanel);
  renderCalendar();
  renderTaskDetails();
}

function closeTaskDetails() {
  state.selectedTaskId = null;
  closeDrawer(els.taskDetailsPanel);
  renderCalendar();
}

function renderTaskDetails() {
  const task = getSelectedTask();
  const hasTask = Boolean(task);
  if (!hasTask) {
    els.taskDetailsPanel.setAttribute("aria-hidden", "true");
    return;
  }

  els.detailHeading.textContent = task.name;
  els.detailTaskTitle.value = task.name;
  els.detailTaskDuration.value = String(task.minutes);
  els.detailTaskProgress.max = String(task.minutes);
  els.detailTaskProgress.value = String(task.elapsedMinutes);
  els.detailPriorityScore.value = String(task.priorityScore);
  els.detailImpact.value = String(task.impact);
  els.detailUrgency.value = String(task.urgency);
  els.detailPriorityReason.value = task.priorityReason;
  els.detailToggleTimer.textContent = timerState.activeId === task.id ? "Pause" : "Start";
  els.detailToggleDone.textContent = task.completed ? "Undo done" : "Done";
  renderDetailSubtasks(task);
}

function renderDetailSubtasks(task) {
  els.detailSubtasks.innerHTML = "";
  if (!task.subtasks.length) {
    const empty = document.createElement("p");
    empty.className = "helper";
    empty.textContent = "No subtasks for this task.";
    els.detailSubtasks.appendChild(empty);
    return;
  }

  task.subtasks.forEach((subtask) => {
    const label = document.createElement("label");
    label.className = "detail-subtask-row";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = subtask.completed;
    checkbox.addEventListener("change", () => {
      subtask.completed = checkbox.checked;
      saveState();
    });
    const text = document.createElement("span");
    text.textContent = `${subtask.title} (${formatDuration(subtask.minutes)})`;
    label.append(checkbox, text);
    els.detailSubtasks.appendChild(label);
  });
}

function updateSelectedTask(mutator, options = {}) {
  const task = getSelectedTask();
  if (!task) return;
  mutator(task);
  task.elapsedMinutes = Math.min(task.elapsedMinutes, task.minutes);
  task.completed = task.elapsedMinutes >= task.minutes ? true : task.completed;
  saveState();
  if (options.render === "calendar") {
    renderCalendar({ skipDetails: true });
    renderBacklog();
  } else if (options.render !== false) {
    render();
  }
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

  els.reviewSummary.textContent = draft.summary || "Review the AI proposal before applying it.";
  els.reviewWarnings.innerHTML = "";
  draft.warnings.forEach((warning) => {
    const item = document.createElement("p");
    item.className = "notice";
    item.textContent = warning;
    els.reviewWarnings.appendChild(item);
  });

  renderReviewQuestions(draft);
  renderReviewTasks(draft);
}

function renderReviewQuestions(draft) {
  els.reviewQuestions.innerHTML = "";
  const heading = document.createElement("h3");
  heading.textContent = "Follow-up questions";
  els.reviewQuestions.appendChild(heading);
  if (!draft.questions.length) {
    const empty = document.createElement("p");
    empty.className = "helper";
    empty.textContent = "No follow-up questions for this dump.";
    els.reviewQuestions.appendChild(empty);
    return;
  }

  draft.questions.forEach((question) => {
    const row = document.createElement("label");
    row.className = "question-row";
    row.textContent = question.question;
    const hint = document.createElement("span");
    hint.textContent = question.reason;
    const input = document.createElement("textarea");
    input.rows = 2;
    input.value = draft.answers[question.id] || "";
    input.addEventListener("input", () => {
      draft.answers[question.id] = input.value;
      saveReviewDraft();
    });
    row.append(hint, input);
    els.reviewQuestions.appendChild(row);
  });
}

function renderReviewTasks(draft) {
  els.reviewTasks.innerHTML = "";
  const heading = document.createElement("h3");
  heading.textContent = "Proposed tasks";
  els.reviewTasks.appendChild(heading);
  if (!draft.proposedTasks.length) {
    const empty = document.createElement("p");
    empty.className = "helper";
    empty.textContent = "No tasks were extracted yet.";
    els.reviewTasks.appendChild(empty);
    return;
  }

  draft.proposedTasks.forEach((task, index) => {
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
  state.backlog.sort((a, b) => {
    if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
    if (b.urgency !== a.urgency) return b.urgency - a.urgency;
    return b.impact - a.impact;
  });
}

function createPlannerPayload() {
  return {
    mode: "brain_dump",
    input: els.brainDump.value.trim(),
    answers: state.reviewDraft ? state.reviewDraft.answers : {},
    currentTasks: state.tasks.map(summarizeTaskForAI),
    currentBacklog: state.backlog.map(summarizeTaskForAI),
  };
}

function summarizeTaskForAI(task) {
  return {
    id: task.id,
    title: task.name,
    minutes: task.minutes,
    completed: task.completed,
    priorityScore: task.priorityScore,
    urgency: task.urgency,
    impact: task.impact,
    priorityReason: task.priorityReason,
    subtasks: task.subtasks.map((subtask) => ({
      title: subtask.title,
      minutes: subtask.minutes,
      completed: subtask.completed,
    })),
  };
}

async function analyzeDump() {
  const payload = createPlannerPayload();
  if (!payload.input) {
    setStatus("Add a brain dump before analyzing.", true);
    return;
  }

  setStatus("Analyzing...");
  els.analyzeDump.disabled = true;
  els.reanalyzeDump.disabled = true;
  try {
    const result = await requestAIPlan(payload);
    const normalized = ai.normalizePlannerResponse(result);
    state.reviewDraft = {
      id: createId("dump"),
      sourceText: payload.input,
      summary: normalized.summary,
      warnings: normalized.warnings,
      questions: normalized.questions,
      priorityUpdates: normalized.priorityUpdates,
      answers: payload.answers || {},
      proposedTasks: normalized.proposedTasks.map((task) => ({
        ...task,
        accepted: true,
      })),
    };
    applyPriorityUpdates(normalized.priorityUpdates);
    saveState();
    saveReviewDraft();
    setStatus("Draft ready for review.");
    openDrawer(els.reviewPanel);
    render();
  } catch (err) {
    setStatus(readableAIError(err), true);
  } finally {
    els.analyzeDump.disabled = false;
    els.reanalyzeDump.disabled = false;
  }
}

async function requestAIPlan(payload) {
  if (state.aiSettings.providerMode === "local") {
    return requestLocalAI(payload);
  }
  return requestVercelAI(payload);
}

async function requestVercelAI(payload) {
  const response = await fetch("/api/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json.error || "Vercel AI endpoint failed.");
  }
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
  return ai.normalizePlannerResponse(ai.extractJson(content));
}

async function postLocalChatCompletion(baseUrl, model, messages, useSchema) {
  const body = {
    model,
    messages,
    temperature: 0.2,
    response_format: useSchema
      ? {
          type: "json_schema",
          json_schema: {
            name: "overrun_planner_response",
            strict: true,
            schema: ai.plannerResponseSchema,
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
  updates.forEach((update) => {
    const task = [...state.tasks, ...state.backlog].find((item) => item.id === update.taskId);
    if (!task) return;
    task.priorityScore = update.priorityScore;
    task.priorityReason = update.priorityReason;
  });
  if (updates.length) sortBacklogByPriority();
}

function applyReviewDraft() {
  const draft = state.reviewDraft;
  if (!draft) return;
  const accepted = draft.proposedTasks.filter((task) => task.accepted && task.title.trim());
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
  sortBacklogByPriority();
  state.reviewDraft = null;
  saveState();
  saveReviewDraft();
  setStatus(`${accepted.length} task${accepted.length === 1 ? "" : "s"} added to backlog.`);
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
  els.calendarBlocks.addEventListener("dragover", (event) => {
    event.preventDefault();
  });

  els.calendarBlocks.addEventListener("drop", (event) => {
    event.preventDefault();
    const dragId = event.dataTransfer.getData("text/plain");
    const targetBlock = event.target.closest(".calendar-block");
    if (!targetBlock) return;
    reorderTasks(dragId, targetBlock.dataset.id);
  });

  document.addEventListener("pointermove", (event) => {
    if (dragState.progressId && dragState.progressRect) {
      const rect = dragState.progressRect;
      const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      setElapsedFromRatio(dragState.progressId, ratio);
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
    dragState.progressId = null;
    dragState.progressRect = null;
  });
}

function setupEvents() {
  els.addTask.addEventListener("click", () => addTask("New task", "task"));
  els.addMeeting.addEventListener("click", () => addTask("Meeting", "meeting"));
  els.analyzeDump.addEventListener("click", analyzeDump);
  els.reanalyzeDump.addEventListener("click", analyzeDump);
  els.clearDump.addEventListener("click", () => {
    els.brainDump.value = "";
    setStatus("");
  });
  els.toggleDay.addEventListener("click", toggleDayTimer);
  els.openSettings.addEventListener("click", () => openDrawer(els.settingsPanel));
  els.closeSettings.addEventListener("click", () => closeDrawer(els.settingsPanel));
  els.closeReview.addEventListener("click", () => closeDrawer(els.reviewPanel));
  els.closeTaskDetails.addEventListener("click", closeTaskDetails);
  els.applyReview.addEventListener("click", applyReviewDraft);
  els.discardReview.addEventListener("click", discardReviewDraft);
  els.detailTaskTitle.addEventListener("input", () => {
    updateSelectedTask((task) => {
      task.name = els.detailTaskTitle.value.trim() || "Untitled";
      els.detailHeading.textContent = task.name;
    }, { render: "calendar" });
  });
  els.detailTaskDuration.addEventListener("input", () => {
    updateSelectedTask((task) => {
      task.minutes = clampNumber(els.detailTaskDuration.value, MIN_MINUTES, 480, task.minutes);
      els.detailTaskProgress.max = String(task.minutes);
    }, { render: "calendar" });
  });
  els.detailTaskProgress.addEventListener("input", () => {
    updateSelectedTask((task) => {
      task.elapsedMinutes = clampNumber(els.detailTaskProgress.value, 0, task.minutes, task.elapsedMinutes);
      task.completed = task.elapsedMinutes >= task.minutes;
    }, { render: "calendar" });
  });
  els.detailPriorityScore.addEventListener("input", () => {
    updateSelectedTask((task) => {
      task.priorityScore = clampNumber(els.detailPriorityScore.value, 1, 100, task.priorityScore);
    }, { render: "calendar" });
  });
  els.detailImpact.addEventListener("input", () => {
    updateSelectedTask((task) => {
      task.impact = clampNumber(els.detailImpact.value, 1, 5, task.impact);
    }, { render: "calendar" });
  });
  els.detailUrgency.addEventListener("input", () => {
    updateSelectedTask((task) => {
      task.urgency = clampNumber(els.detailUrgency.value, 1, 5, task.urgency);
    }, { render: "calendar" });
  });
  els.detailPriorityReason.addEventListener("input", () => {
    updateSelectedTask((task) => {
      task.priorityReason = els.detailPriorityReason.value.trim();
    }, { render: false });
  });
  els.detailToggleTimer.addEventListener("click", () => {
    const task = getSelectedTask();
    if (!task) return;
    if (timerState.activeId === task.id) pauseTimer();
    else startTimer(task.id);
    renderTaskDetails();
  });
  els.detailToggleDone.addEventListener("click", () => {
    const task = getSelectedTask();
    if (!task) return;
    markTaskDone(task.id);
  });
  els.detailSplit.addEventListener("click", () => {
    const task = getSelectedTask();
    if (!task) return;
    splitTask(task.id);
  });
  els.detailBacklog.addEventListener("click", () => {
    const task = getSelectedTask();
    if (!task) return;
    pushToBacklog(task.id);
  });
  els.detailDelete.addEventListener("click", () => {
    const task = getSelectedTask();
    if (!task) return;
    removeTask(task.id);
  });
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
    setStatus("AI settings saved.");
    closeDrawer(els.settingsPanel);
  });

  els.saveDay.addEventListener("click", exportCompletedDay);
  els.exportBacklog.addEventListener("click", exportBacklog);
  els.importBacklog.addEventListener("click", () => {
    els.backlogFile.value = "";
    els.backlogFile.click();
  });
  els.backlogFile.addEventListener("change", importBacklog);
}

function exportCompletedDay() {
  const payload = state.tasks
    .filter((task) => task.completed)
    .map((task) => ({
      id: task.id,
      name: task.name,
      minutes: task.minutes,
      elapsedMinutes: task.elapsedMinutes,
      type: task.type,
      completed: task.completed,
      priorityScore: task.priorityScore,
      priorityReason: task.priorityReason,
      urgency: task.urgency,
      impact: task.impact,
      subtasks: task.subtasks,
    }));
  downloadJson(payload, "overrun_day.json");
}

function exportBacklog() {
  downloadJson(state.backlog, "overrun_backlog.json");
}

function downloadJson(payload, filename) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
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
      if (!Array.isArray(parsed)) {
        setStatus("Backlog file must contain an array.", true);
        return;
      }
      const imported = parsed.map((item) => {
        const source = item && typeof item === "object" ? item : {};
        return normalizeTask({
          ...source,
          id: createId(),
          name: source.name || source.title || "Imported task",
        });
      });
      state.backlog = imported.concat(state.backlog);
      sortBacklogByPriority();
      saveState();
      render();
      setStatus(`${imported.length} backlog item${imported.length === 1 ? "" : "s"} imported.`);
    } catch (err) {
      setStatus("Invalid backlog JSON file.", true);
      console.warn("Invalid backlog file", err);
    }
  };
  reader.readAsText(file);
}

loadState();
setupEvents();
render();
setupDragAndResize();
