import { describe, it, expect } from "vitest";
import {
  scoreTask,
  buildStabilizerStack,
  isWaiting,
  isActionable,
  getWaitingTasks,
  type Task,
  type Category,
  type CategoryKind,
} from "../db";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: crypto.randomUUID(),
    categoryId: "cat-legal",
    domain: "LIFE_ADMIN",
    title: "Test task",
    status: "BACKLOG",
    priority: 2,
    estimateMinutes: 30,
    actualSecondsTotal: 0,
    contextCard: { why: "", nextMicroStep: "", reframe: "" },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    subtasks: [],
    ...overrides,
  };
}

function makeCategory(kind: CategoryKind, id: string): Category {
  return {
    id,
    name: kind,
    kind,
    contextCard: { why: "", winCondition: "", script: "" },
  };
}

const categories: Category[] = [
  makeCategory("LEGAL", "cat-legal"),
  makeCategory("MONEY", "cat-money"),
  makeCategory("MAINTENANCE", "cat-maint"),
  makeCategory("CAREGIVER", "cat-care"),
];

const FUTURE = new Date(Date.now() + 7 * 86_400_000).toISOString();
const PAST = new Date(Date.now() - 1 * 86_400_000).toISOString();

// ── No overlap between tabs ──────────────────────────────────────────

describe("tab separation: no overlap between Stabilizer and Builder", () => {
  it("Stabilizer stack only contains LIFE_ADMIN tasks", () => {
    const tasks = [
      makeTask({ domain: "LIFE_ADMIN", title: "Legal thing" }),
      makeTask({ domain: "BUSINESS", title: "Ship feature" }),
      makeTask({ domain: "LIFE_ADMIN", title: "Taxes" }),
      makeTask({ domain: "BUSINESS", title: "Client call" }),
    ];
    const stack = buildStabilizerStack(tasks, categories, 120);
    for (const t of stack) {
      expect(t.domain).toBe("LIFE_ADMIN");
    }
  });

  it("Builder filter only contains BUSINESS tasks", () => {
    const tasks = [
      makeTask({ domain: "LIFE_ADMIN", title: "Legal thing" }),
      makeTask({ domain: "BUSINESS", title: "Ship feature" }),
      makeTask({ domain: "LIFE_ADMIN", title: "Taxes" }),
      makeTask({ domain: "BUSINESS", title: "Client call" }),
    ];
    const builderTasks = tasks.filter(
      (t) => t.domain === "BUSINESS" && isActionable(t)
    );
    for (const t of builderTasks) {
      expect(t.domain).toBe("BUSINESS");
    }
    expect(builderTasks).toHaveLength(2);
  });

  it("zero tasks appear in both tabs", () => {
    const tasks = [
      makeTask({ domain: "LIFE_ADMIN", title: "A" }),
      makeTask({ domain: "BUSINESS", title: "B" }),
      makeTask({ domain: "LIFE_ADMIN", title: "C" }),
    ];
    const stabIds = new Set(
      buildStabilizerStack(tasks, categories, 120).map((t) => t.id)
    );
    const builderIds = new Set(
      tasks.filter((t) => t.domain === "BUSINESS" && isActionable(t)).map((t) => t.id)
    );
    const overlap = [...stabIds].filter((id) => builderIds.has(id));
    expect(overlap).toHaveLength(0);
  });
});

// ── Builder empty state ──────────────────────────────────────────────

describe("builder empty state", () => {
  it("returns empty array when no BUSINESS tasks exist", () => {
    const tasks = [makeTask({ domain: "LIFE_ADMIN" }), makeTask({ domain: "LIFE_ADMIN" })];
    const builderTasks = tasks.filter((t) => t.domain === "BUSINESS" && isActionable(t));
    expect(builderTasks).toHaveLength(0);
  });

  it("excludes DONE BUSINESS tasks", () => {
    const tasks = [
      makeTask({ domain: "BUSINESS", status: "DONE" }),
      makeTask({ domain: "BUSINESS", status: "BACKLOG" }),
    ];
    const builderTasks = tasks.filter((t) => t.domain === "BUSINESS" && isActionable(t));
    expect(builderTasks).toHaveLength(1);
  });
});

// ── Stabilizer scoring ───────────────────────────────────────────────

describe("stabilizer scoring respects urgency and category weights", () => {
  it("LEGAL scores higher than MONEY (base weight)", () => {
    const legal = scoreTask(makeTask({ categoryId: "cat-legal" }), "LEGAL", 120);
    const money = scoreTask(makeTask({ categoryId: "cat-money" }), "MONEY", 120);
    expect(legal).toBeGreaterThan(money);
  });

  it("MONEY scores higher than MAINTENANCE", () => {
    const money = scoreTask(makeTask({ categoryId: "cat-money" }), "MONEY", 120);
    const maint = scoreTask(makeTask({ categoryId: "cat-maint" }), "MAINTENANCE", 120);
    expect(money).toBeGreaterThan(maint);
  });

  it("task due within 3 days scores higher than same task due in 10 days", () => {
    const soon = makeTask({ dueDate: new Date(Date.now() + 2 * 86_400_000).toISOString() });
    const later = makeTask({ dueDate: new Date(Date.now() + 10 * 86_400_000).toISOString() });
    expect(scoreTask(soon, "LEGAL", 120)).toBeGreaterThan(scoreTask(later, "LEGAL", 120));
  });

  it("task due within 7 days scores higher than undated task", () => {
    const dated = makeTask({ dueDate: new Date(Date.now() + 5 * 86_400_000).toISOString() });
    const undated = makeTask({});
    expect(scoreTask(dated, "LEGAL", 120)).toBeGreaterThan(scoreTask(undated, "LEGAL", 120));
  });

  it("IN_PROGRESS gets momentum bonus", () => {
    const inProg = makeTask({ status: "IN_PROGRESS" });
    const backlog = makeTask({ status: "BACKLOG" });
    expect(scoreTask(inProg, "LEGAL", 120)).toBeGreaterThan(scoreTask(backlog, "LEGAL", 120));
  });

  it("small tasks (<=15 min) get higher momentum bonus than 30 min", () => {
    const small = makeTask({ estimateMinutes: 10 });
    const medium = makeTask({ estimateMinutes: 30 });
    expect(scoreTask(small, "LEGAL", 120)).toBeGreaterThan(scoreTask(medium, "LEGAL", 120));
  });

  it("blocked tasks return -1", () => {
    const blocked = makeTask({ blockedByTaskIds: ["some-id"] });
    expect(scoreTask(blocked, "LEGAL", 120)).toBe(-1);
  });

  it("over-capacity task returns -1", () => {
    const big = makeTask({ estimateMinutes: 90 });
    expect(scoreTask(big, "LEGAL", 30)).toBe(-1);
  });

  it("moneyImpact adds to score", () => {
    const withMoney = makeTask({ moneyImpact: 400 });
    const without = makeTask({});
    expect(scoreTask(withMoney, "LEGAL", 120)).toBeGreaterThan(scoreTask(without, "LEGAL", 120));
  });
});

// ── Selection rules ──────────────────────────────────────────────────

describe("selection rules", () => {
  it("returns at most 5 tasks", () => {
    const tasks = Array.from({ length: 10 }, (_, i) =>
      makeTask({ title: `Task ${i}`, estimateMinutes: 10 })
    );
    const stack = buildStabilizerStack(tasks, categories, 300);
    expect(stack.length).toBeLessThanOrEqual(5);
  });

  it("respects capacity: does not exceed available minutes", () => {
    const tasks = [
      makeTask({ estimateMinutes: 50, title: "A" }),
      makeTask({ estimateMinutes: 50, title: "B" }),
      makeTask({ estimateMinutes: 50, title: "C" }),
    ];
    const stack = buildStabilizerStack(tasks, categories, 100);
    const total = stack.reduce((s, t) => s + (t.estimateMinutes ?? 0), 0);
    expect(total).toBeLessThanOrEqual(100);
  });

  it("diversity: at most 2 from any one category kind when enough tasks exist", () => {
    const tasks = [
      makeTask({ categoryId: "cat-legal", title: "L1", estimateMinutes: 10 }),
      makeTask({ categoryId: "cat-legal", title: "L2", estimateMinutes: 10 }),
      makeTask({ categoryId: "cat-legal", title: "L3", estimateMinutes: 10 }),
      makeTask({ categoryId: "cat-money", title: "M1", estimateMinutes: 10 }),
      makeTask({ categoryId: "cat-money", title: "M2", estimateMinutes: 10 }),
      makeTask({ categoryId: "cat-money", title: "M3", estimateMinutes: 10 }),
      makeTask({ categoryId: "cat-maint", title: "X1", estimateMinutes: 10 }),
    ];
    const stack = buildStabilizerStack(tasks, categories, 300, 5);
    const kindCounts: Record<string, number> = {};
    for (const t of stack) {
      const cat = categories.find((c) => c.id === t.categoryId);
      kindCounts[cat?.kind ?? ""] = (kindCounts[cat?.kind ?? ""] ?? 0) + 1;
    }
    for (const count of Object.values(kindCounts)) {
      expect(count).toBeLessThanOrEqual(2);
    }
  });

  it("DONE tasks are excluded", () => {
    const tasks = [
      makeTask({ status: "DONE", title: "Done one" }),
      makeTask({ status: "BACKLOG", title: "Active one" }),
    ];
    const stack = buildStabilizerStack(tasks, categories, 120);
    expect(stack.every((t) => t.status !== "DONE")).toBe(true);
  });

  it("only LIFE_ADMIN tasks are included (BUSINESS excluded)", () => {
    const tasks = [
      makeTask({ domain: "BUSINESS", title: "Biz" }),
      makeTask({ domain: "LIFE_ADMIN", title: "Admin" }),
    ];
    const stack = buildStabilizerStack(tasks, categories, 120);
    expect(stack).toHaveLength(1);
    expect(stack[0].title).toBe("Admin");
  });
});

// ── Waiting / PENDING logic ──────────────────────────────────────────

describe("isWaiting", () => {
  it("PENDING + future nextActionAt => waiting", () => {
    const t = makeTask({ status: "PENDING", nextActionAt: FUTURE });
    expect(isWaiting(t)).toBe(true);
  });

  it("PENDING + past nextActionAt => NOT waiting", () => {
    const t = makeTask({ status: "PENDING", nextActionAt: PAST });
    expect(isWaiting(t)).toBe(false);
  });

  it("PENDING + no nextActionAt => NOT waiting", () => {
    const t = makeTask({ status: "PENDING" });
    expect(isWaiting(t)).toBe(false);
  });

  it("BACKLOG task is never waiting", () => {
    const t = makeTask({ status: "BACKLOG", nextActionAt: FUTURE });
    expect(isWaiting(t)).toBe(false);
  });
});

describe("isActionable", () => {
  it("BACKLOG is actionable", () => {
    expect(isActionable(makeTask({ status: "BACKLOG" }))).toBe(true);
  });

  it("IN_PROGRESS is actionable", () => {
    expect(isActionable(makeTask({ status: "IN_PROGRESS" }))).toBe(true);
  });

  it("DONE is NOT actionable", () => {
    expect(isActionable(makeTask({ status: "DONE" }))).toBe(false);
  });

  it("PENDING + future nextActionAt is NOT actionable", () => {
    expect(isActionable(makeTask({ status: "PENDING", nextActionAt: FUTURE }))).toBe(false);
  });

  it("PENDING + past nextActionAt IS actionable", () => {
    expect(isActionable(makeTask({ status: "PENDING", nextActionAt: PAST }))).toBe(true);
  });

  it("PENDING + no nextActionAt IS actionable", () => {
    expect(isActionable(makeTask({ status: "PENDING" }))).toBe(true);
  });
});

describe("waiting tasks do not appear in Today Stack", () => {
  it("PENDING with future date is excluded from stabilizer stack", () => {
    const tasks = [
      makeTask({ title: "Active", status: "BACKLOG" }),
      makeTask({ title: "Waiting", status: "PENDING", nextActionAt: FUTURE }),
    ];
    const stack = buildStabilizerStack(tasks, categories, 120);
    expect(stack.map((t) => t.title)).not.toContain("Waiting");
    expect(stack.map((t) => t.title)).toContain("Active");
  });

  it("PENDING with past date IS included in stabilizer stack", () => {
    const tasks = [
      makeTask({ title: "Now actionable", status: "PENDING", nextActionAt: PAST }),
    ];
    const stack = buildStabilizerStack(tasks, categories, 120);
    expect(stack.map((t) => t.title)).toContain("Now actionable");
  });
});

describe("getWaitingTasks", () => {
  it("returns only PENDING tasks with future nextActionAt for given domain", () => {
    const tasks = [
      makeTask({ domain: "LIFE_ADMIN", status: "PENDING", nextActionAt: FUTURE, title: "W1" }),
      makeTask({ domain: "LIFE_ADMIN", status: "BACKLOG", title: "Active" }),
      makeTask({ domain: "BUSINESS", status: "PENDING", nextActionAt: FUTURE, title: "BizWait" }),
      makeTask({ domain: "LIFE_ADMIN", status: "PENDING", nextActionAt: PAST, title: "PastPending" }),
    ];
    const waiting = getWaitingTasks(tasks, "LIFE_ADMIN");
    expect(waiting).toHaveLength(1);
    expect(waiting[0].title).toBe("W1");
  });
});

describe("Make actionable now", () => {
  it("setting PENDING task to BACKLOG makes it actionable and eligible for stack", () => {
    const task = makeTask({ status: "PENDING", nextActionAt: FUTURE, title: "Was waiting" });
    task.status = "BACKLOG";
    task.nextActionAt = undefined;
    task.pendingReason = undefined;

    expect(isActionable(task)).toBe(true);
    expect(isWaiting(task)).toBe(false);

    const stack = buildStabilizerStack([task], categories, 120);
    expect(stack).toHaveLength(1);
    expect(stack[0].title).toBe("Was waiting");
  });
});

describe("scoreTask excludes waiting PENDING tasks", () => {
  it("PENDING + future nextActionAt returns -1", () => {
    const t = makeTask({ status: "PENDING", nextActionAt: FUTURE });
    expect(scoreTask(t, "LEGAL", 120)).toBe(-1);
  });

  it("PENDING + past nextActionAt is scored normally", () => {
    const t = makeTask({ status: "PENDING", nextActionAt: PAST });
    expect(scoreTask(t, "LEGAL", 120)).toBeGreaterThan(0);
  });
});
