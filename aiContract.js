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

  const systemPrompt = [
    "You are Overrun Lite, an AI planning assistant.",
    "Turn messy brain dumps into concrete tasks for a local-first planner.",
    "Optimize backlog ranking for impact plus urgency.",
    "Ask follow-up questions when a task is ambiguous, blocked, missing a deadline, or too vague to act on.",
    "Break large work into actionable subtasks while preserving the parent task.",
    "Never claim a task is complete. Never directly schedule the user's day.",
    "Return only valid JSON matching the requested schema.",
  ].join(" ");

  function buildPlannerMessages(payload) {
    return [
      {
        role: "system",
        content: systemPrompt,
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
    const source = value && typeof value === "object" ? value : {};
    return {
      summary: String(source.summary || ""),
      proposedTasks: Array.isArray(source.proposedTasks)
        ? source.proposedTasks.map(normalizeTaskProposal).filter(Boolean)
        : [],
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

  function normalizeTaskProposal(item) {
    if (!item || typeof item !== "object") return null;
    const title = String(item.title || "").trim();
    if (!title) return null;
    const minutes = clampInt(item.minutes, 10, 480, 60);
    return {
      title,
      minutes,
      priorityScore: clampInt(item.priorityScore, 1, 100, 50),
      priorityReason: String(item.priorityReason || "Impact and urgency estimate.").trim(),
      urgency: clampInt(item.urgency, 1, 5, 3),
      impact: clampInt(item.impact, 1, 5, 3),
      subtasks: Array.isArray(item.subtasks)
        ? item.subtasks.map(normalizeSubtask).filter(Boolean)
        : [],
    };
  }

  function normalizeSubtask(item) {
    if (!item || typeof item !== "object") return null;
    const title = String(item.title || "").trim();
    if (!title) return null;
    return {
      title,
      minutes: clampInt(item.minutes, 5, 240, 25),
    };
  }

  function normalizeQuestion(item, index) {
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
    createEmptyPlannerResponse,
    normalizePlannerResponse,
    extractJson,
  };
});
