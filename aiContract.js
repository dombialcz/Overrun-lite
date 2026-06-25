(function (root, factory) {
  const contract = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = contract;
  }
  root.OverrunAI = contract;
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  const plannerResponseSchema = {
    type: "object",
    additionalProperties: false,
    required: ["summary", "proposedTasks", "questions", "priorityUpdates", "warnings"],
    properties: {
      summary: { type: "string" },
      proposedTasks: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "title",
            "minutes",
            "priorityScore",
            "priorityReason",
            "urgency",
            "impact",
            "subtasks",
          ],
          properties: {
            title: { type: "string" },
            minutes: { type: "integer", minimum: 10, maximum: 480 },
            priorityScore: { type: "integer", minimum: 1, maximum: 100 },
            priorityReason: { type: "string" },
            urgency: { type: "integer", minimum: 1, maximum: 5 },
            impact: { type: "integer", minimum: 1, maximum: 5 },
            subtasks: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["title", "minutes"],
                properties: {
                  title: { type: "string" },
                  minutes: { type: "integer", minimum: 5, maximum: 240 },
                },
              },
            },
          },
        },
      },
      questions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "question", "reason"],
          properties: {
            id: { type: "string" },
            question: { type: "string" },
            reason: { type: "string" },
          },
        },
      },
      priorityUpdates: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["taskId", "priorityScore", "priorityReason"],
          properties: {
            taskId: { type: "string" },
            priorityScore: { type: "integer", minimum: 1, maximum: 100 },
            priorityReason: { type: "string" },
          },
        },
      },
      warnings: {
        type: "array",
        items: { type: "string" },
      },
    },
  };

  const breakdownResponseSchema = {
    type: "object",
    additionalProperties: false,
    required: ["summary", "subtasks", "questions", "warnings"],
    properties: {
      summary: { type: "string" },
      subtasks: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "minutes"],
          properties: {
            title: { type: "string" },
            minutes: { type: "integer", minimum: 5, maximum: 240 },
          },
        },
      },
      questions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "question", "reason"],
          properties: {
            id: { type: "string" },
            question: { type: "string" },
            reason: { type: "string" },
          },
        },
      },
      warnings: {
        type: "array",
        items: { type: "string" },
      },
    },
  };

  const plannerSystemPrompt = [
    "You are Overrun Lite, an AI planning assistant.",
    "Turn messy brain dumps into concrete tasks for a local-first planner.",
    "Optimize backlog ranking for impact plus urgency.",
    "Ask follow-up questions when a task is ambiguous, blocked, missing a deadline, or too vague to act on.",
    "Break large work into actionable subtasks while preserving the parent task.",
    "Never claim a task is complete. Never directly schedule the user's day.",
    "Return only valid JSON matching the requested schema.",
  ].join(" ");

  const breakdownSystemPrompt = [
    "You are Overrun Lite, an AI task breakdown assistant.",
    "Break one existing task into concrete, reviewable subtasks for a local-first planner.",
    "Respect the user's instructions, selected granularity, existing subtasks, and time budget.",
    "Do not mark anything complete. Do not schedule the user's day.",
    "Return only valid JSON matching the requested schema.",
  ].join(" ");

  function buildPlannerMessages(payload) {
    if (payload && payload.mode === "task_breakdown") {
      return buildBreakdownMessages(payload);
    }
    return [
      {
        role: "system",
        content: plannerSystemPrompt,
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            mode: payload.mode,
            input: payload.input,
            answers: payload.answers || {},
            currentTasks: payload.currentTasks || [],
            currentBacklog: payload.currentBacklog || [],
            instructions: {
              priorityScale: "1-100, where 100 is highest priority",
              urgencyScale: "1-5, where 5 is most urgent",
              impactScale: "1-5, where 5 is highest impact",
              defaultTaskMinutes: 60,
              minimumTaskMinutes: 10,
            },
          },
          null,
          2
        ),
      },
    ];
  }

  function buildBreakdownMessages(payload) {
    const granularity = ["small", "medium", "large"].includes(payload.granularity)
      ? payload.granularity
      : "medium";
    const applyMode = payload.applyMode === "replace" ? "replace" : "append";
    return [
      {
        role: "system",
        content: breakdownSystemPrompt,
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            mode: "task_breakdown",
            task: payload.task || {},
            instructions: String(payload.instructions || ""),
            granularity,
            applyMode,
            guidance: {
              small: "Prefer 2-4 larger subtasks.",
              medium: "Prefer 4-6 practical subtasks.",
              large: "Prefer 6-8 detailed subtasks.",
              minimumSubtaskMinutes: 5,
              maximumSubtaskMinutes: 240,
              preserveExistingWhenAppending: applyMode === "append",
            },
          },
          null,
          2
        ),
      },
    ];
  }

  function createEmptyPlannerResponse(summary) {
    return {
      summary: summary || "",
      proposedTasks: [],
      questions: [],
      priorityUpdates: [],
      warnings: [],
    };
  }

  function normalizePlannerResponse(value) {
    if (value && value.mode === "task_breakdown") {
      return normalizeBreakdownResponse(value);
    }
    const source = value && typeof value === "object" ? value : {};
    const proposedTasks = collectTaskProposals(source);
    return {
      summary: String(source.summary || ""),
      proposedTasks: proposedTasks.map(normalizeTaskProposal).filter(Boolean),
      questions: Array.isArray(source.questions)
        ? source.questions.map(normalizeQuestion).filter(Boolean)
        : [],
      priorityUpdates: Array.isArray(source.priorityUpdates)
        ? source.priorityUpdates.map(normalizePriorityUpdate).filter(Boolean)
        : [],
      warnings: Array.isArray(source.warnings)
        ? source.warnings.map((item) => String(item || "").trim()).filter(Boolean)
        : [],
    };
  }

  function collectTaskProposals(source) {
    if (Array.isArray(source.proposedTasks)) return source.proposedTasks;
    if (Array.isArray(source.tasks)) return source.tasks;
    if (source.newTask && typeof source.newTask === "object") return [source.newTask];
    return [
      ...(Array.isArray(source.currentTasks) ? source.currentTasks : []),
      ...(Array.isArray(source.currentBacklog) ? source.currentBacklog : []),
      ...(Array.isArray(source.backlog) ? source.backlog : []),
    ];
  }

  function normalizeTaskProposal(item) {
    if (!item || typeof item !== "object") return null;
    const title = String(item.title || item.task || item.name || "").trim();
    if (!title) return null;
    const minutes = clampInt(item.minutes || item.timeEstimate || item.duration, 10, 480, 60);
    return {
      title,
      minutes,
      priorityScore: clampInt(item.priorityScore || item.priority, 1, 100, 50),
      priorityReason: String(item.priorityReason || item.description || "Impact and urgency estimate.").trim(),
      urgency: clampInt(item.urgency, 1, 5, 3),
      impact: clampInt(item.impact, 1, 5, 3),
      subtasks: Array.isArray(item.subtasks)
        ? item.subtasks.map(normalizeSubtask).filter(Boolean)
      : [],
    };
  }

  function normalizeBreakdownResponse(value) {
    const source = value && typeof value === "object" ? value : {};
    const subtasks = collectSubtasks(source);
    return {
      summary: String(source.summary || ""),
      subtasks: subtasks.map(normalizeSubtask).filter(Boolean),
      questions: Array.isArray(source.questions)
        ? source.questions.map(normalizeQuestion).filter(Boolean)
        : [],
      warnings: Array.isArray(source.warnings)
        ? source.warnings.map((item) => String(item || "").trim()).filter(Boolean)
        : [],
    };
  }

  function collectSubtasks(source) {
    if (Array.isArray(source.subtasks)) return source.subtasks;
    if (Array.isArray(source.steps)) return source.steps;
    if (Array.isArray(source.items)) return source.items;
    if (Array.isArray(source.checklist)) return source.checklist;
    if (Array.isArray(source.tasks)) return source.tasks;
    if (source.breakdown && typeof source.breakdown === "object") {
      return collectSubtasks(source.breakdown);
    }
    if (source.newTask && typeof source.newTask === "object") {
      return collectSubtasks(source.newTask);
    }
    return [];
  }

  function normalizeSubtask(item) {
    if (!item || typeof item !== "object") return null;
    const title = String(item.title || item.task || item.name || "").trim();
    if (!title) return null;
    return {
      title,
      minutes: clampInt(item.minutes || item.timeEstimate || item.duration, 5, 240, 25),
    };
  }

  function normalizeQuestion(item, index) {
    if (typeof item === "string") {
      const questionText = item.trim();
      if (!questionText) return null;
      return {
        id: `question-${index + 1}`,
        question: questionText,
        reason: "Clarifies the task before planning.",
      };
    }
    if (!item || typeof item !== "object") return null;
    const question = String(item.question || "").trim();
    if (!question) return null;
    return {
      id: String(item.id || `question-${index + 1}`),
      question,
      reason: String(item.reason || "Clarifies the task before planning.").trim(),
    };
  }

  function normalizePriorityUpdate(item) {
    if (!item || typeof item !== "object") return null;
    const taskId = String(item.taskId || "").trim();
    if (!taskId) return null;
    return {
      taskId,
      priorityScore: clampInt(item.priorityScore, 1, 100, 50),
      priorityReason: String(item.priorityReason || "Updated from latest brain dump.").trim(),
    };
  }

  function clampInt(value, min, max, fallback) {
    const parsed = Math.round(Number(value));
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
  }

  function extractJson(text) {
    if (!text || typeof text !== "string") {
      throw new Error("AI response did not include text content.");
    }
    try {
      return JSON.parse(text);
    } catch (err) {
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw err;
      return JSON.parse(match[0]);
    }
  }

  return {
    plannerResponseSchema,
    buildPlannerMessages,
    breakdownResponseSchema,
    createEmptyPlannerResponse,
    normalizeBreakdownResponse,
    normalizePlannerResponse,
    extractJson,
  };
});
