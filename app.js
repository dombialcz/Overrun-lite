const STORAGE_KEY = "overrun_lite_state";
const ID_COUNTER_KEY = "overrun_lite_id_counter";
const memoryStore = {};
const DEFAULT_MINUTES = 60;
const MIN_MINUTES = 10;
const SEGMENT_BLOCK = 30;
const RESIZE_STEP_MINUTES = 5;

const state = {
  tasks: [],
  backlog: [],
};

const els = {
  addTask: document.getElementById("add-task"),
  addMeeting: document.getElementById("add-meeting"),
  backlogList: document.getElementById("backlog-list"),
  totalTime: document.getElementById("total-time"),
  doneTime: document.getElementById("done-time"),
  dayTimer: document.getElementById("day-timer"),
  toggleDay: document.getElementById("toggle-day"),
  saveDay: document.getElementById("save-day"),
  exportBacklog: document.getElementById("export-backlog"),
  importBacklog: document.getElementById("import-backlog"),
  backlogFile: document.getElementById("backlog-file"),
  calendarBlocks: document.getElementById("calendar-blocks"),
  backlogTemplate: document.getElementById("backlog-template"),
};

const dragState = {
  activeId: null,
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

function loadState() {
  const raw = safeGet(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    state.tasks = parsed.tasks || [];
    state.backlog = parsed.backlog || [];
  } catch (err) {
    console.warn("Failed to load state", err);
  }
}

function saveState() {
  safeSet(STORAGE_KEY, JSON.stringify({ tasks: state.tasks, backlog: state.backlog }));
}

function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

function createId() {
  const current = Number(safeGet(ID_COUNTER_KEY) || "0") + 1;
  safeSet(ID_COUNTER_KEY, String(current));
  return `task-${current}`;
}

function createTask(name, minutes = DEFAULT_MINUTES, type = "task") {
  return {
    id: createId(),
    name,
    minutes,
    type,
    elapsedMinutes: 0,
    completed: false,
  };
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
  const splitTasks = Array.from({ length: segmentCount }, (_, index) =>
    createTask(`${task.name} (part ${index + 1})`, segmentMinutes, task.type)
  );
  state.tasks.splice(taskIndex, 1, ...splitTasks);
  saveState();
  render();
}

function pushToBacklog(id) {
  const taskIndex = state.tasks.findIndex((item) => item.id === id);
  if (taskIndex === -1) return;
  const [task] = state.tasks.splice(taskIndex, 1);
  state.backlog.unshift(task);
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

function renderBacklog() {
  els.backlogList.innerHTML = "";
  state.backlog.forEach((task) => {
    const node = els.backlogTemplate.content.cloneNode(true);
    node.querySelector(".task-title").textContent = task.name;
    node.querySelector(".task-time").textContent = formatDuration(task.minutes);
    node.querySelector("button").addEventListener("click", () => {
      pickFromBacklog(task.id);
    });
    els.backlogList.appendChild(node);
  });

  if (!state.backlog.length) {
    els.backlogList.textContent = "Backlog is empty.";
  }
}

function removeTask(id) {
  const taskIndex = state.tasks.findIndex((item) => item.id === id);
  if (taskIndex === -1) return;
  state.tasks.splice(taskIndex, 1);
  saveState();
  render();
}

function markTaskDone(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  task.completed = !task.completed;
  saveState();
  render();
}

function setElapsedMinutes(id, minutes) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  const next = Math.max(0, Math.min(task.minutes, minutes));
  task.elapsedMinutes = next;
  if (task.elapsedMinutes >= task.minutes) {
    task.completed = true;
  } else {
    task.completed = false;
  }
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

function renderCalendar() {
  els.calendarBlocks.innerHTML = "";
  const totalMinutes = state.tasks.reduce((sum, task) => sum + task.minutes, 0);
  const doneMinutes = state.tasks
    .filter((task) => task.completed)
    .reduce((sum, task) => sum + task.minutes, 0);
  els.totalTime.textContent = `${formatDuration(totalMinutes)} planned`;
  els.doneTime.textContent = `${formatDuration(doneMinutes)} done`;

  state.tasks.forEach((task) => {
    const block = document.createElement("div");
    block.className = "calendar-block";
    if (task.type === "meeting") {
      block.classList.add("meeting");
    }
    if (task.completed) {
      block.classList.add("completed");
    }
    if (!task.completed && task.elapsedMinutes >= task.minutes) {
      block.classList.add("overdue");
    }
    block.dataset.id = task.id;
    block.draggable = true;
    const pixelsPerMinute = getPixelsPerMinute();
    block.style.height = `${task.minutes * pixelsPerMinute}px`;
    const title = document.createElement("span");
    title.className = "calendar-block-title";
    title.textContent = task.name;
    title.setAttribute("contenteditable", "true");
    title.addEventListener("focus", () => {
      block.draggable = false;
    });
    title.addEventListener("blur", () => {
      const nextName = title.textContent.trim() || "Untitled";
      task.name = nextName;
      block.draggable = true;
      saveState();
      renderCalendar();
      renderBacklog();
    });
    title.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        title.blur();
      }
    });

    const remainingMinutes = Math.max(0, task.minutes - task.elapsedMinutes);
    const remainingSeconds = getLiveRemainingSeconds(task);
    const time = document.createElement("span");
    time.className = "calendar-block-time";
    if (timerState.activeId === task.id) {
      time.textContent = `${formatTimer(remainingSeconds)} left`;
    } else {
      time.textContent = `${formatDuration(remainingMinutes)} left`;
    }

    const topActions = document.createElement("div");
    topActions.className = "calendar-block-top-actions";
    const timerButton = document.createElement("button");
    timerButton.type = "button";
    timerButton.textContent =
      timerState.activeId === task.id ? "Pause" : "Start";
    timerButton.addEventListener("click", () => {
      if (timerState.activeId === task.id) {
        pauseTimer();
      } else {
        startTimer(task.id);
      }
    });
    const doneButton = document.createElement("button");
    doneButton.type = "button";
    doneButton.textContent = task.completed ? "unDone" : "Done";
    doneButton.addEventListener("click", () => markTaskDone(task.id));
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "X";
    deleteButton.addEventListener("click", () => removeTask(task.id));
    topActions.append(timerButton, doneButton, deleteButton);

    const actions = document.createElement("div");
    actions.className = "calendar-block-actions";
    const splitButton = document.createElement("button");
    splitButton.type = "button";
    splitButton.textContent = "Split";
    splitButton.addEventListener("click", () => splitTask(task.id));
    const backlogButton = document.createElement("button");
    backlogButton.type = "button";
    backlogButton.textContent = "Backlog";
    backlogButton.addEventListener("click", () => pushToBacklog(task.id));
    actions.append(splitButton, backlogButton);

    const progress = document.createElement("div");
    progress.className = "calendar-progress";
    const progressFill = document.createElement("div");
    progressFill.className = "calendar-progress-fill";
    const percent = task.minutes
      ? Math.round((task.elapsedMinutes / task.minutes) * 100)
      : 0;
    progressFill.style.width = `${Math.min(100, percent)}%`;
    progress.append(progressFill);
    progress.addEventListener("pointerdown", (event) => {
      const rect = progress.getBoundingClientRect();
      dragState.progressId = task.id;
      dragState.progressRect = rect;
      const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      setElapsedFromRatio(task.id, ratio);
      progress.setPointerCapture(event.pointerId);
    });

    const resizeHandle = document.createElement("span");
    resizeHandle.className = "resize-handle";
    resizeHandle.title = "Drag to resize";
    block.append(topActions, title, time, progress, actions, resizeHandle);
    block.addEventListener("dragstart", (event) => {
      if (dragState.isResizing) {
        event.preventDefault();
        return;
      }
      event.dataTransfer.setData("text/plain", task.id);
    });
    resizeHandle.addEventListener("pointerdown", (event) => {
      event.preventDefault();
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
}

function render() {
  renderBacklog();
  renderCalendar();
  updateDayTimerDisplay();
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

els.addTask.addEventListener("click", () => {
  addTask("New task", "task");
});

els.addMeeting.addEventListener("click", () => {
  addTask("Meeting", "meeting");
});

els.toggleDay.addEventListener("click", () => {
  toggleDayTimer();
});

els.saveDay.addEventListener("click", () => {
  const payload = state.tasks
    .filter((task) => task.completed)
    .map((task) => ({
      id: task.id,
      name: task.name,
      minutes: task.minutes,
      elapsedMinutes: task.elapsedMinutes,
      type: task.type,
      completed: task.completed,
    }));
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "overrun_day.json";
  link.click();
});

els.exportBacklog.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state.backlog, null, 2)], {
    type: "application/json",
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "overrun_backlog.json";
  link.click();
});

els.importBacklog.addEventListener("click", () => {
  els.backlogFile.value = "";
  els.backlogFile.click();
});

els.backlogFile.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!Array.isArray(parsed)) return;
      const imported = parsed.map((item) => ({
        id: createId(),
        name: item.name || "Imported task",
        minutes: Math.max(MIN_MINUTES, Number(item.minutes) || DEFAULT_MINUTES),
        elapsedMinutes: Math.max(0, Number(item.elapsedMinutes) || 0),
        type: item.type === "meeting" ? "meeting" : "task",
        completed: Boolean(item.completed),
      }));
      state.backlog = imported.concat(state.backlog);
      saveState();
      render();
    } catch (err) {
      console.warn("Invalid backlog file", err);
    }
  };
  reader.readAsText(file);
});

loadState();
render();
setupDragAndResize();
