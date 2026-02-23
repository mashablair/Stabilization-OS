import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import {
  db,
  generateId,
  nowISO,
  markTaskDone,
  markTaskArchived,
  unmarkTaskDone,
  type Task,
} from "../db";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: generateId(),
    categoryId: "cat-legal",
    domain: "LIFE_ADMIN",
    title: "Test task",
    status: "BACKLOG",
    priority: 2,
    estimateMinutes: 30,
    actualSecondsTotal: 0,
    contextCard: { why: "", nextMicroStep: "", reframe: "" },
    createdAt: nowISO(),
    updatedAt: nowISO(),
    subtasks: [],
    ...overrides,
  };
}

beforeEach(async () => {
  await db.tasks.clear();
});

describe("markTaskDone", () => {
  it("sets status to DONE and adds completedAt timestamp", async () => {
    const task = makeTask();
    await db.tasks.add(task);

    await markTaskDone(task.id);

    const updated = await db.tasks.get(task.id);
    expect(updated!.status).toBe("DONE");
    expect(updated!.completedAt).toBeDefined();
    expect(new Date(updated!.completedAt!).getTime()).toBeGreaterThan(0);
  });

  it("updates updatedAt", async () => {
    const task = makeTask({ updatedAt: "2020-01-01T00:00:00.000Z" });
    await db.tasks.add(task);

    await markTaskDone(task.id);

    const updated = await db.tasks.get(task.id);
    expect(new Date(updated!.updatedAt).getTime()).toBeGreaterThan(
      new Date("2020-01-01").getTime()
    );
  });
});

describe("markTaskArchived", () => {
  it("sets status to ARCHIVED", async () => {
    const task = makeTask({ status: "DONE", completedAt: nowISO() });
    await db.tasks.add(task);

    await markTaskArchived(task.id);

    const updated = await db.tasks.get(task.id);
    expect(updated!.status).toBe("ARCHIVED");
  });

  it("preserves existing completedAt when archiving a DONE task", async () => {
    const completedAt = "2026-02-20T12:00:00.000Z";
    const task = makeTask({ status: "DONE", completedAt });
    await db.tasks.add(task);

    await markTaskArchived(task.id);

    const updated = await db.tasks.get(task.id);
    expect(updated!.completedAt).toBe(completedAt);
  });

  it("sets completedAt if not already present", async () => {
    const task = makeTask({ status: "BACKLOG" });
    await db.tasks.add(task);

    await markTaskArchived(task.id);

    const updated = await db.tasks.get(task.id);
    expect(updated!.completedAt).toBeDefined();
  });
});

describe("unmarkTaskDone", () => {
  it("sets status back to BACKLOG", async () => {
    const task = makeTask({ status: "DONE", completedAt: nowISO() });
    await db.tasks.add(task);

    await unmarkTaskDone(task.id);

    const updated = await db.tasks.get(task.id);
    expect(updated!.status).toBe("BACKLOG");
  });

  it("clears completedAt", async () => {
    const task = makeTask({ status: "DONE", completedAt: nowISO() });
    await db.tasks.add(task);

    await unmarkTaskDone(task.id);

    const updated = await db.tasks.get(task.id);
    expect(updated!.completedAt).toBeUndefined();
  });

  it("undoing an ARCHIVED task also goes to BACKLOG", async () => {
    const task = makeTask({ status: "ARCHIVED", completedAt: nowISO() });
    await db.tasks.add(task);

    await unmarkTaskDone(task.id);

    const updated = await db.tasks.get(task.id);
    expect(updated!.status).toBe("BACKLOG");
    expect(updated!.completedAt).toBeUndefined();
  });
});

describe("full lifecycle: BACKLOG → DONE → ARCHIVED → BACKLOG", () => {
  it("round-trips through the complete lifecycle", async () => {
    const task = makeTask();
    await db.tasks.add(task);

    await markTaskDone(task.id);
    let updated = await db.tasks.get(task.id);
    expect(updated!.status).toBe("DONE");
    expect(updated!.completedAt).toBeDefined();
    const originalCompletedAt = updated!.completedAt;

    await markTaskArchived(task.id);
    updated = await db.tasks.get(task.id);
    expect(updated!.status).toBe("ARCHIVED");
    expect(updated!.completedAt).toBe(originalCompletedAt);

    await unmarkTaskDone(task.id);
    updated = await db.tasks.get(task.id);
    expect(updated!.status).toBe("BACKLOG");
    expect(updated!.completedAt).toBeUndefined();
  });
});
