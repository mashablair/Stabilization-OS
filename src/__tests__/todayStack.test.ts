import { describe, it, expect, vi } from "vitest";
import {
  scoreTask,
  buildStabilizerStack,
  buildStabilizerStackSplit,
  isWaiting,
  isActionable,
  getWaitingTasks,
  getEffectiveMinutes,
  type Task,
  type Category,
  type CategoryKind,
  type AppSettings,
  type DailyCapacity,
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

  it("TODAY status gets priority bonus so explicitly-pinned tasks show in Today Stack", () => {
    const today = makeTask({ status: "TODAY", categoryId: "cat-care", title: "Birthday party" });
    const backlog = makeTask({ status: "BACKLOG", categoryId: "cat-legal", title: "Legal thing" });
    expect(scoreTask(today, "CAREGIVER", 120)).toBeGreaterThan(scoreTask(backlog, "LEGAL", 120));
    const stack = buildStabilizerStack([backlog, today], categories, 120);
    expect(stack.map((t) => t.title)).toContain("Birthday party");
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

  it("ARCHIVED is NOT actionable", () => {
    expect(isActionable(makeTask({ status: "ARCHIVED" }))).toBe(false);
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

describe("buildStabilizerStackSplit", () => {
  it("pinned tasks (TODAY status) appear first, suggested fill remaining slots", () => {
    const pinned = makeTask({
      title: "User pinned this",
      status: "TODAY",
      categoryId: "cat-care",
      estimateMinutes: 10,
    });
    const backlog = makeTask({
      title: "Algorithm suggests",
      status: "BACKLOG",
      categoryId: "cat-legal",
      estimateMinutes: 10,
    });
    const { pinned: outPinned, suggested: outSuggested } = buildStabilizerStackSplit(
      [pinned, backlog],
      categories,
      120,
      5
    );
    expect(outPinned).toHaveLength(1);
    expect(outPinned[0].title).toBe("User pinned this");
    expect(outSuggested).toHaveLength(1);
    expect(outSuggested[0].title).toBe("Algorithm suggests");
  });

  it("buildStabilizerStack returns pinned then suggested", () => {
    const pinned = makeTask({ status: "TODAY", title: "A" });
    const suggested = makeTask({ status: "BACKLOG", title: "B" });
    const stack = buildStabilizerStack([pinned, suggested], categories, 120);
    expect(stack[0].title).toBe("A");
    expect(stack[1].title).toBe("B");
  });

  it("all user-pinned (TODAY) tasks show in Today Stack even when same category kind", () => {
    const caregiver1 = makeTask({
      status: "TODAY",
      title: "Mom's appointment",
      categoryId: "cat-care",
      estimateMinutes: 15,
    });
    const caregiver2 = makeTask({
      status: "TODAY",
      title: "Kids school",
      categoryId: "cat-care",
      estimateMinutes: 20,
    });
    const caregiver3 = makeTask({
      status: "TODAY",
      title: "Take Dad to dentist",
      categoryId: "cat-care",
      estimateMinutes: 25,
    });
    const { pinned: outPinned } = buildStabilizerStackSplit(
      [caregiver1, caregiver2, caregiver3],
      categories,
      120,
      5
    );
    expect(outPinned).toHaveLength(3);
    expect(outPinned.map((t) => t.title)).toContain("Take Dad to dentist");
  });

  it("pinned tasks appear even when their estimate exceeds availableMinutes", () => {
    const pinned = makeTask({
      status: "TODAY",
      title: "Take Dad to dentist",
      categoryId: "cat-care",
      estimateMinutes: 25,
    });
    const { pinned: outPinned } = buildStabilizerStackSplit(
      [pinned],
      categories,
      10,
      5
    );
    expect(outPinned).toHaveLength(1);
    expect(outPinned[0].title).toBe("Take Dad to dentist");
  });

  it("pinned tasks appear even when they have blockedByTaskIds", () => {
    const pinned = makeTask({
      status: "TODAY",
      title: "Blocked but pinned",
      categoryId: "cat-legal",
      blockedByTaskIds: ["some-other-task"],
    });
    const { pinned: outPinned } = buildStabilizerStackSplit(
      [pinned],
      categories,
      120,
      5
    );
    expect(outPinned).toHaveLength(1);
    expect(outPinned[0].title).toBe("Blocked but pinned");
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

// ── ARCHIVED status ──────────────────────────────────────────────────

describe("ARCHIVED status behaviour", () => {
  it("scoreTask returns -1 for ARCHIVED tasks", () => {
    const t = makeTask({ status: "ARCHIVED" });
    expect(scoreTask(t, "LEGAL", 120)).toBe(-1);
  });

  it("ARCHIVED tasks are excluded from stabilizer stack", () => {
    const tasks = [
      makeTask({ status: "ARCHIVED", title: "Archived one" }),
      makeTask({ status: "BACKLOG", title: "Active one" }),
    ];
    const stack = buildStabilizerStack(tasks, categories, 120);
    expect(stack.every((t) => t.status !== "ARCHIVED")).toBe(true);
    expect(stack.map((t) => t.title)).toContain("Active one");
  });

  it("ARCHIVED tasks are excluded from builder filter", () => {
    const tasks = [
      makeTask({ domain: "BUSINESS", status: "ARCHIVED", title: "Archived biz" }),
      makeTask({ domain: "BUSINESS", status: "BACKLOG", title: "Active biz" }),
    ];
    const builderTasks = tasks.filter((t) => t.domain === "BUSINESS" && isActionable(t));
    expect(builderTasks).toHaveLength(1);
    expect(builderTasks[0].title).toBe("Active biz");
  });

  it("ARCHIVED is not waiting", () => {
    const t = makeTask({ status: "ARCHIVED", nextActionAt: FUTURE });
    expect(isWaiting(t)).toBe(false);
  });

  it("ARCHIVED tasks do not appear in getWaitingTasks", () => {
    const tasks = [
      makeTask({ status: "ARCHIVED", domain: "LIFE_ADMIN", nextActionAt: FUTURE }),
      makeTask({ status: "PENDING", domain: "LIFE_ADMIN", nextActionAt: FUTURE }),
    ];
    const waiting = getWaitingTasks(tasks, "LIFE_ADMIN");
    expect(waiting).toHaveLength(1);
    expect(waiting[0].status).toBe("PENDING");
  });
});

// ── completedAt field ────────────────────────────────────────────────

describe("completedAt field", () => {
  it("task interface accepts completedAt as optional string", () => {
    const withDate = makeTask({ completedAt: "2026-02-23T00:00:00.000Z" });
    expect(withDate.completedAt).toBe("2026-02-23T00:00:00.000Z");
  });

  it("task without completedAt defaults to undefined", () => {
    const t = makeTask({});
    expect(t.completedAt).toBeUndefined();
  });

  it("completed tasks can be filtered by completedAt date", () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today.getTime() - 86_400_000);

    const tasks = [
      makeTask({ status: "DONE", completedAt: today.toISOString(), title: "Done today" }),
      makeTask({ status: "DONE", completedAt: yesterday.toISOString(), title: "Done yesterday" }),
      makeTask({ status: "BACKLOG", title: "Not done" }),
    ];

    const doneToday = tasks.filter(
      (t) => t.status === "DONE" && t.completedAt && new Date(t.completedAt).getTime() >= today.getTime()
    );
    expect(doneToday).toHaveLength(1);
    expect(doneToday[0].title).toBe("Done today");
  });
});

// ── Task lifecycle transitions (pure logic) ─────────────────────────

describe("task lifecycle transitions", () => {
  it("DONE → BACKLOG undo always goes to BACKLOG (not TODAY)", () => {
    const task = makeTask({ status: "DONE", completedAt: new Date().toISOString() });
    task.status = "BACKLOG";
    task.completedAt = undefined;
    expect(task.status).toBe("BACKLOG");
    expect(task.completedAt).toBeUndefined();
    expect(isActionable(task)).toBe(true);
  });

  it("DONE → ARCHIVED preserves completedAt", () => {
    const completedAt = "2026-02-20T12:00:00.000Z";
    const task = makeTask({ status: "DONE", completedAt });
    task.status = "ARCHIVED";
    expect(task.completedAt).toBe(completedAt);
    expect(isActionable(task)).toBe(false);
  });

  it("ARCHIVED → BACKLOG undo clears completedAt and becomes actionable", () => {
    const task = makeTask({ status: "ARCHIVED", completedAt: "2026-02-20T12:00:00.000Z" });
    task.status = "BACKLOG";
    task.completedAt = undefined;
    expect(isActionable(task)).toBe(true);
  });

  it("all subtasks done should trigger marking task DONE", () => {
    const subtasks = [
      { id: "s1", title: "Sub 1", done: true },
      { id: "s2", title: "Sub 2", done: true },
      { id: "s3", title: "Sub 3", done: true },
    ];
    const allDone = subtasks.length > 0 && subtasks.every((s) => s.done);
    expect(allDone).toBe(true);
  });

  it("partial subtasks done should NOT trigger marking task DONE", () => {
    const subtasks = [
      { id: "s1", title: "Sub 1", done: true },
      { id: "s2", title: "Sub 2", done: false },
    ];
    const allDone = subtasks.length > 0 && subtasks.every((s) => s.done);
    expect(allDone).toBe(false);
  });

  it("empty subtasks list should NOT trigger auto-complete", () => {
    const subtasks: Array<{ id: string; title: string; done: boolean }> = [];
    const allDone = subtasks.length > 0 && subtasks.every((s) => s.done);
    expect(allDone).toBe(false);
  });
});

// ── getEffectiveMinutes ──────────────────────────────────────────────

describe("getEffectiveMinutes", () => {
  const baseSettings: AppSettings = {
    id: "default",
    role: "Stabilizer",
    availableMinutes: 120,
    builderAvailableMinutes: 90,
    darkMode: false,
  };

  const todayStr = new Date().toISOString().slice(0, 10);

  it("returns stabilizer default when no daily override", () => {
    expect(getEffectiveMinutes(baseSettings, undefined, "LIFE_ADMIN")).toBe(120);
  });

  it("returns builder default when no daily override", () => {
    expect(getEffectiveMinutes(baseSettings, undefined, "BUSINESS")).toBe(90);
  });

  it("returns daily override when date matches today (LIFE_ADMIN)", () => {
    const override: DailyCapacity = { id: "dc1", date: todayStr, domain: "LIFE_ADMIN", minutes: 45 };
    expect(getEffectiveMinutes(baseSettings, override, "LIFE_ADMIN")).toBe(45);
  });

  it("returns daily override when date matches today (BUSINESS)", () => {
    const override: DailyCapacity = { id: "dc2", date: todayStr, domain: "BUSINESS", minutes: 60 };
    expect(getEffectiveMinutes(baseSettings, override, "BUSINESS")).toBe(60);
  });

  it("ignores stale override from a different date", () => {
    const override: DailyCapacity = { id: "dc3", date: "2020-01-01", domain: "LIFE_ADMIN", minutes: 10 };
    expect(getEffectiveMinutes(baseSettings, override, "LIFE_ADMIN")).toBe(120);
  });

  it("falls back to 120 when settings is undefined", () => {
    expect(getEffectiveMinutes(undefined, undefined, "LIFE_ADMIN")).toBe(120);
    expect(getEffectiveMinutes(undefined, undefined, "BUSINESS")).toBe(120);
  });

  it("override of 0 minutes is respected", () => {
    const override: DailyCapacity = { id: "dc4", date: todayStr, domain: "LIFE_ADMIN", minutes: 0 };
    expect(getEffectiveMinutes(baseSettings, override, "LIFE_ADMIN")).toBe(0);
  });
});
