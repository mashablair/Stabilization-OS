import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db, generateId, upsertHabitLog } from "../db";
import {
  getConsistencyStats,
  getCurrentStreak,
  getRangeDates,
  isHabitScheduledOnDate,
  type Habit,
  type HabitLog,
} from "../habits";

function makeHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: generateId(),
    name: "Walk",
    type: "CHECK",
    scheduleType: "DAILY",
    startDate: "2026-02-01",
    showInToday: true,
    allowPartial: false,
    allowSkip: true,
    sortOrder: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function logsMap(entries: HabitLog[]): Map<string, HabitLog> {
  return new Map(entries.map((entry) => [entry.date, entry]));
}

describe("habit scheduling", () => {
  it("supports weekday schedules with monday start conventions", () => {
    const habit = makeHabit({ scheduleType: "WEEKDAYS", weekdays: [1, 3, 5] });
    expect(isHabitScheduledOnDate(habit, "2026-02-23")).toBe(true);
    expect(isHabitScheduledOnDate(habit, "2026-02-24")).toBe(false);
  });

  it("supports every N days schedules", () => {
    const habit = makeHabit({ scheduleType: "EVERY_N_DAYS", startDate: "2026-02-01", everyNDays: 3 });
    expect(isHabitScheduledOnDate(habit, "2026-02-01")).toBe(true);
    expect(isHabitScheduledOnDate(habit, "2026-02-02")).toBe(false);
    expect(isHabitScheduledOnDate(habit, "2026-02-04")).toBe(true);
  });

  it("times per week is eligible daily for logging", () => {
    const habit = makeHabit({ scheduleType: "TIMES_PER_WEEK", timesPerWeek: 3 });
    expect(isHabitScheduledOnDate(habit, "2026-02-20")).toBe(true);
  });
});

describe("habit metrics", () => {
  it("excludes skip from consistency denominator", () => {
    const habit = makeHabit();
    const dates = ["2026-02-20", "2026-02-21", "2026-02-22", "2026-02-23"];
    const stats = getConsistencyStats(
      habit,
      logsMap([
        { id: "1", habitId: habit.id, date: "2026-02-20", status: "DONE", createdAt: "", updatedAt: "" },
        { id: "2", habitId: habit.id, date: "2026-02-21", status: "SKIP", createdAt: "", updatedAt: "" },
      ]),
      dates
    );
    expect(stats.numerator).toBe(1);
    expect(stats.denominator).toBe(3);
    expect(stats.skips).toBe(1);
  });

  it("skip does not break daily streak", () => {
    const habit = makeHabit();
    const streak = getCurrentStreak(
      habit,
      logsMap([
        { id: "1", habitId: habit.id, date: "2026-02-26", status: "DONE", createdAt: "", updatedAt: "" },
        { id: "2", habitId: habit.id, date: "2026-02-25", status: "SKIP", createdAt: "", updatedAt: "" },
        { id: "3", habitId: habit.id, date: "2026-02-24", status: "DONE", createdAt: "", updatedAt: "" },
      ]),
      "2026-02-26"
    );
    expect(streak).toBe(2);
  });

  it("times-per-week consistency uses target as denominator", () => {
    const habit = makeHabit({ scheduleType: "TIMES_PER_WEEK", timesPerWeek: 3 });
    const weekDates = getRangeDates("WEEK", "2026-02-26");
    const stats = getConsistencyStats(
      habit,
      logsMap([
        { id: "1", habitId: habit.id, date: weekDates[0], status: "DONE", createdAt: "", updatedAt: "" },
        { id: "2", habitId: habit.id, date: weekDates[1], status: "DONE", createdAt: "", updatedAt: "" },
      ]),
      weekDates
    );
    expect(stats.denominator).toBe(3);
    expect(stats.numerator).toBe(2);
  });
});

describe("habit logs DB operations", () => {
  beforeEach(async () => {
    await db.habits.clear();
    await db.habitLogs.clear();
  });

  it("upsertHabitLog creates and updates single record per habit/day", async () => {
    const habitId = generateId();
    await db.habits.add(makeHabit({ id: habitId }));

    await upsertHabitLog(habitId, "2026-02-26", { status: "DONE", value: 1 });
    await upsertHabitLog(habitId, "2026-02-26", { status: "PARTIAL", value: 2 });

    const logs = await db.habitLogs.where("[habitId+date]").equals([habitId, "2026-02-26"]).toArray();
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe("PARTIAL");
    expect(logs[0].value).toBe(2);
  });
});
