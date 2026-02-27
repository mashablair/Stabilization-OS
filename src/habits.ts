export type HabitType = "CHECK" | "COUNT" | "TIME";
export type HabitScheduleType = "DAILY" | "WEEKDAYS" | "EVERY_N_DAYS" | "TIMES_PER_WEEK";
export type HabitLogStatus = "DONE" | "PARTIAL" | "SKIP" | "NONE";
export type HabitRange = "WEEK" | "MONTH" | "THREE_MONTHS";

export interface Habit {
  id: string;
  name: string;
  type: HabitType;
  scheduleType: HabitScheduleType;
  weekdays?: number[];
  everyNDays?: number;
  timesPerWeek?: number;
  goalTarget?: number;
  unit?: string;
  startDate: string;
  showInToday: boolean;
  allowPartial: boolean;
  allowSkip: boolean;
  color?: string;
  icon?: string;
  archivedAt?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface HabitLog {
  id: string;
  habitId: string;
  date: string;
  status: HabitLogStatus;
  value?: number;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface HabitRangeStats {
  consistencyPct: number;
  numerator: number;
  denominator: number;
  skips: number;
}

function parseDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00`);
}

function fmtDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function startOfWeekMonday(dateStr: string): string {
  const d = parseDate(dateStr);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return fmtDate(d);
}

export function getRangeDates(range: HabitRange, anchorDate: string): string[] {
  if (range === "WEEK") {
    const start = parseDate(startOfWeekMonday(anchorDate));
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return fmtDate(d);
    });
  }

  if (range === "MONTH") {
    const anchor = parseDate(anchorDate);
    const year = anchor.getFullYear();
    const month = anchor.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return Array.from({ length: daysInMonth }, (_, i) => {
      const d = new Date(year, month, i + 1);
      return fmtDate(d);
    });
  }

  const end = parseDate(anchorDate);
  const dates: string[] = [];
  for (let i = 89; i >= 0; i -= 1) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    dates.push(fmtDate(d));
  }
  return dates;
}

export function isHabitScheduledOnDate(habit: Habit, dateStr: string): boolean {
  if (dateStr < habit.startDate) return false;

  if (habit.scheduleType === "DAILY") return true;

  if (habit.scheduleType === "WEEKDAYS") {
    const days = habit.weekdays ?? [];
    return days.includes(parseDate(dateStr).getDay());
  }

  if (habit.scheduleType === "EVERY_N_DAYS") {
    const n = Math.max(1, habit.everyNDays ?? 1);
    const diffMs = parseDate(dateStr).getTime() - parseDate(habit.startDate).getTime();
    const diffDays = Math.floor(diffMs / 86_400_000);
    return diffDays % n === 0;
  }

  return true;
}

function doneEquivalentForLog(habit: Habit, log: HabitLog | undefined): number {
  if (!log) return 0;
  if (log.status === "DONE") return 1;
  if (log.status === "PARTIAL" && habit.allowPartial) return 1;
  if (habit.type !== "CHECK" && typeof log.value === "number" && (habit.goalTarget ?? 0) > 0) {
    return Math.min(1, log.value / (habit.goalTarget ?? 1));
  }
  return 0;
}

export function getConsistencyStats(
  habit: Habit,
  logsByDate: Map<string, HabitLog>,
  rangeDates: string[]
): HabitRangeStats {
  if (habit.scheduleType === "TIMES_PER_WEEK") {
    const weekToDates = new Map<string, string[]>();
    for (const date of rangeDates) {
      if (!isHabitScheduledOnDate(habit, date)) continue;
      const week = startOfWeekMonday(date);
      const existing = weekToDates.get(week) ?? [];
      existing.push(date);
      weekToDates.set(week, existing);
    }

    let numerator = 0;
    let denominator = 0;
    let skips = 0;
    const target = Math.max(1, habit.timesPerWeek ?? 1);
    for (const dates of weekToDates.values()) {
      let doneCount = 0;
      for (const date of dates) {
        const log = logsByDate.get(date);
        if (log?.status === "SKIP") skips += 1;
        if (doneEquivalentForLog(habit, log) >= 1) doneCount += 1;
      }
      denominator += target;
      numerator += Math.min(target, doneCount);
    }
    const consistencyPct = denominator === 0 ? 0 : Math.round((numerator / denominator) * 100);
    return { consistencyPct, numerator, denominator, skips };
  }

  let numerator = 0;
  let denominator = 0;
  let skips = 0;
  for (const date of rangeDates) {
    if (!isHabitScheduledOnDate(habit, date)) continue;
    const log = logsByDate.get(date);
    if (log?.status === "SKIP") {
      skips += 1;
      continue;
    }
    denominator += 1;
    if (doneEquivalentForLog(habit, log) >= 1) {
      numerator += 1;
    }
  }
  const consistencyPct = denominator === 0 ? 0 : Math.round((numerator / denominator) * 100);
  return { consistencyPct, numerator, denominator, skips };
}

export function getCurrentStreak(
  habit: Habit,
  logsByDate: Map<string, HabitLog>,
  today: string,
  lookbackDays = 365
): number {
  if (habit.scheduleType === "TIMES_PER_WEEK") {
    let streak = 0;
    let cursor = parseDate(startOfWeekMonday(today));
    for (let i = 0; i < 52; i += 1) {
      const dates = Array.from({ length: 7 }, (_, idx) => {
        const d = new Date(cursor);
        d.setDate(cursor.getDate() + idx);
        return fmtDate(d);
      }).filter((d) => d >= habit.startDate && d <= today);
      if (dates.length === 0) break;
      const target = Math.max(1, habit.timesPerWeek ?? 1);
      const doneCount = dates.filter((d) => doneEquivalentForLog(habit, logsByDate.get(d)) >= 1).length;
      if (doneCount >= target) {
        streak += 1;
      } else {
        break;
      }
      cursor.setDate(cursor.getDate() - 7);
    }
    return streak;
  }

  let streak = 0;
  for (let i = 0; i < lookbackDays; i += 1) {
    const d = parseDate(today);
    d.setDate(d.getDate() - i);
    const date = fmtDate(d);
    if (date < habit.startDate) break;
    if (!isHabitScheduledOnDate(habit, date)) continue;
    const log = logsByDate.get(date);
    if (log?.status === "SKIP") continue;
    if (doneEquivalentForLog(habit, log) >= 1) {
      streak += 1;
      continue;
    }
    break;
  }
  return streak;
}
