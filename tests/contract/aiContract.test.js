const assert = require("node:assert/strict");
const test = require("node:test");

const ai = require("../../aiContract");

test("planner normalization accepts existing task aliases", () => {
  const normalized = ai.normalizePlannerResponse({
    tasks: [
      {
        task: "Prepare weekly update",
        timeEstimate: 45,
        priority: 82,
        description: "Leadership needs the summary.",
        subtasks: [{ task: "Draft bullets", duration: 15 }],
      },
    ],
  });

  assert.equal(normalized.proposedTasks.length, 1);
  assert.equal(normalized.proposedTasks[0].title, "Prepare weekly update");
  assert.equal(normalized.proposedTasks[0].minutes, 45);
  assert.equal(normalized.proposedTasks[0].priorityScore, 82);
  assert.equal(normalized.proposedTasks[0].subtasks[0].title, "Draft bullets");
});

test("context organize normalization accepts new tasks and merge suggestions", () => {
  const normalized = ai.normalizeContextOrganizeResponse({
    summary: "Organized with context.",
    proposedTasks: [
      {
        title: "Buy cake ingredients",
        minutes: 35,
        priorityScore: 44,
        priorityReason: "Needed before baking.",
        urgency: 3,
        impact: 2,
        subtasks: [],
      },
    ],
    mergeSuggestions: [
      {
        taskId: "task-1",
        reason: "The dump adds recipe details.",
        priorityScore: 88,
        priorityReason: "Cake is due soon.",
        urgency: 5,
        impact: 4,
        subtasks: [{ title: "Choose a recipe", minutes: 20 }],
      },
    ],
    questions: [],
    warnings: [],
  }, {
    currentTasks: [{ id: "task-1", title: "Make cake" }],
    currentBacklog: [],
  });

  assert.equal(normalized.proposedTasks[0].title, "Buy cake ingredients");
  assert.equal(normalized.mergeSuggestions.length, 1);
  assert.equal(normalized.mergeSuggestions[0].taskId, "task-1");
  assert.equal(normalized.mergeSuggestions[0].subtasks[0].title, "Choose a recipe");
});

test("context organize normalization drops unknown merge task ids", () => {
  const normalized = ai.normalizeContextOrganizeResponse({
    mergeSuggestions: [
      {
        taskId: "missing-task",
        reason: "No target.",
        priorityScore: 90,
        priorityReason: "Invalid.",
        urgency: 5,
        impact: 5,
        subtasks: [],
      },
    ],
  }, {
    currentTasks: [{ id: "task-1" }],
    currentBacklog: [],
  });

  assert.equal(normalized.mergeSuggestions.length, 0);
});

test("context organize merge fields are clamped", () => {
  const normalized = ai.normalizeContextOrganizeResponse({
    mergeSuggestions: [
      {
        taskId: "task-1",
        reason: "Clamp values.",
        priorityScore: 900,
        priorityReason: "Updated.",
        urgency: 12,
        impact: 0,
        subtasks: [
          { title: "Too small", minutes: 1 },
          { title: "Too large", minutes: 999 },
        ],
      },
    ],
  }, {
    currentTasks: [{ id: "task-1" }],
    currentBacklog: [],
  });

  const merge = normalized.mergeSuggestions[0];
  assert.equal(merge.priorityScore, 100);
  assert.equal(merge.urgency, 5);
  assert.equal(merge.impact, 1);
  assert.equal(merge.subtasks[0].minutes, 5);
  assert.equal(merge.subtasks[1].minutes, 240);
});

test("breakdown normalization accepts subtasks", () => {
  const normalized = ai.normalizeBreakdownResponse({
    summary: "Breakdown ready.",
    subtasks: [
      { title: "Inspect current AI flow", minutes: 20 },
      { title: "Add review UI", minutes: 40 },
    ],
  });

  assert.equal(normalized.summary, "Breakdown ready.");
  assert.deepEqual(
    normalized.subtasks.map((item) => item.title),
    ["Inspect current AI flow", "Add review UI"]
  );
});

test("breakdown normalization accepts steps and item aliases", () => {
  const fromSteps = ai.normalizeBreakdownResponse({
    steps: [{ name: "Create schema", timeEstimate: 10 }],
  });
  const fromItems = ai.normalizeBreakdownResponse({
    items: [{ task: "Write tests", duration: 35 }],
  });

  assert.equal(fromSteps.subtasks[0].title, "Create schema");
  assert.equal(fromSteps.subtasks[0].minutes, 10);
  assert.equal(fromItems.subtasks[0].title, "Write tests");
  assert.equal(fromItems.subtasks[0].minutes, 35);
});

test("extractJson accepts markdown wrapped JSON", () => {
  const parsed = ai.extractJson('```json\n{"summary":"ok","subtasks":[]}\n```');

  assert.deepEqual(parsed, { summary: "ok", subtasks: [] });
});

test("breakdown normalization drops invalid subtasks", () => {
  const normalized = ai.normalizeBreakdownResponse({
    checklist: [
      { title: "", minutes: 20 },
      null,
      { title: "Keep this one", minutes: 20 },
    ],
  });

  assert.equal(normalized.subtasks.length, 1);
  assert.equal(normalized.subtasks[0].title, "Keep this one");
});

test("breakdown minutes are clamped", () => {
  const normalized = ai.normalizeBreakdownResponse({
    subtasks: [
      { title: "Too small", minutes: 1 },
      { title: "Too large", minutes: 999 },
      { title: "Fallback", minutes: "unknown" },
    ],
  });

  assert.equal(normalized.subtasks[0].minutes, 5);
  assert.equal(normalized.subtasks[1].minutes, 240);
  assert.equal(normalized.subtasks[2].minutes, 25);
});

test("malformed non-json throws", () => {
  assert.throws(() => ai.extractJson("not json at all"), SyntaxError);
});
