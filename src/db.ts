import { supabase } from "./lib/supabase";
import { queryClient } from "./lib/queryClient";
import {
  rowToCategory,
  rowToTask,
  rowToTimerState,
  rowToAppSettings,
  rowToDailyCapacity,
  rowToHabitLog,
} from "./hooks/useData";
import type { Habit, HabitLog, HabitLogStatus } from "./habits";

export type TaskDomain = "LIFE_ADMIN" | "BUSINESS";
export type LifeAdminCategoryKind = "LEGAL" | "MONEY" | "MAINTENANCE" | "CAREGIVER";
export type BuilderCategoryKind = "LEGAL" | "CONTENT" | "PRODUCT" | "NETWORKING" | "LEARNING" | "OPS";
export type CategoryKind = LifeAdminCategoryKind | BuilderCategoryKind | "CUSTOM";
export type TaskStatus = "BACKLOG" | "TODAY" | "IN_PROGRESS" | "PENDING" | "DONE" | "ARCHIVED";
export type TimeTrackingMode = "TASK" | "PROJECT";

export interface Category {
  id: string;
  name: string;
  kind: CategoryKind;
  domain: TaskDomain;
  contextCard: { why: string; winCondition: string; script: string };
}

export interface Task {
  id: string;
  categoryId: string;
  domain: TaskDomain;
  title: string;
  notes?: string;
  status: TaskStatus;
  priority: 1 | 2 | 3 | 4;
  dueDate?: string;
  softDeadline?: string;
  blockedByTaskIds?: string[];
  estimateMinutes?: number;
  actualSecondsTotal: number;
  moneyImpact?: number;
  frictionNote?: string;
  nextActionAt?: string;
  pendingReason?: string;
  contextCard: { why: string; nextMicroStep: string; reframe: string };
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  timeTrackingMode?: TimeTrackingMode;
  subtasks: Subtask[];
}

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
  estimateMinutes?: number;
  actualSecondsTotal?: number;
  completedAt?: string;
}

export interface TimeEntry {
  id: string;
  taskId: string;
  subtaskId?: string;
  startAt: string;
  endAt?: string;
  seconds: number;
  pauseReason?: string;
}

export type WeeklyReviewStatus = "completed" | "skipped" | "dismissed";

export interface WeeklyReview {
  id: string;
  weekStart: string;
  status: WeeklyReviewStatus;
  answers: {
    friction?: string;
    categoryFocus?: string;
    scariestNextStep?: string;
  };
  createdAt: string;
}

export interface TimerState {
  id: string;
  taskId: string;
  subtaskId?: string;
  timeEntryId: string;
  startedAt: string;
  pausedAt?: string;
  accumulatedSeconds: number;
}

export interface AppSettings {
  id: string;
  role: string;
  availableMinutes: number;
  builderAvailableMinutes: number;
  darkMode: boolean;
  hiddenCategoryIds?: string[];
}

export interface DailyCapacity {
  id: string;
  date: string;
  domain: TaskDomain;
  minutes: number;
}

export type WinTag = "life" | "biz" | "vitality" | "community";

export interface Win {
  id: string;
  text: string;
  date: string;
  tags: WinTag[];
  createdAt: string;
}

// --- Utility ---

async function getUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Not authenticated");
  return data.user.id;
}

function invalidate(...keys: string[]) {
  for (const key of keys) {
    queryClient.invalidateQueries({ queryKey: [key] });
  }
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function todayDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getMondayOfWeek(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

// --- Capacity ---

export function getEffectiveMinutes(
  settings: AppSettings | undefined,
  dailyOverride: DailyCapacity | undefined,
  domain: TaskDomain
): number {
  if (dailyOverride && dailyOverride.date === todayDateStr()) {
    return dailyOverride.minutes;
  }
  if (domain === "BUSINESS") {
    return settings?.builderAvailableMinutes ?? 120;
  }
  return settings?.availableMinutes ?? 120;
}

export async function setDailyCapacity(
  domain: TaskDomain,
  minutes: number
): Promise<void> {
  const userId = await getUserId();
  const date = todayDateStr();
  const { data: existing } = await supabase
    .from("daily_capacity")
    .select("id")
    .eq("date", date)
    .eq("domain", domain)
    .maybeSingle();
  if (existing) {
    await supabase.from("daily_capacity").update({ minutes }).eq("id", existing.id);
  } else {
    await supabase.from("daily_capacity").insert({
      id: generateId(),
      user_id: userId,
      date,
      domain,
      minutes,
    });
  }
  invalidate("dailyCapacity");
}

export async function clearDailyCapacity(domain: TaskDomain): Promise<void> {
  const date = todayDateStr();
  await supabase
    .from("daily_capacity")
    .delete()
    .eq("date", date)
    .eq("domain", domain);
  invalidate("dailyCapacity");
}

// --- Habit log ---

export async function upsertHabitLog(
  habitId: string,
  date: string,
  updates: { status: HabitLogStatus; value?: number; note?: string }
): Promise<void> {
  const userId = await getUserId();
  const now = nowISO();
  const { data: existing } = await supabase
    .from("habit_logs")
    .select("id")
    .eq("habit_id", habitId)
    .eq("date", date)
    .maybeSingle();
  if (existing) {
    await supabase
      .from("habit_logs")
      .update({
        status: updates.status,
        value: updates.value,
        note: updates.note,
        updated_at: now,
      })
      .eq("id", existing.id);
  } else {
    await supabase.from("habit_logs").insert({
      id: generateId(),
      user_id: userId,
      habit_id: habitId,
      date,
      status: updates.status,
      value: updates.value,
      note: updates.note,
      created_at: now,
      updated_at: now,
    });
  }
  invalidate("habitLogs");
}

// --- Waiting / actionable ---

export function isWaiting(task: Task, now = Date.now()): boolean {
  return (
    task.status === "PENDING" &&
    !!task.nextActionAt &&
    new Date(task.nextActionAt).getTime() > now
  );
}

export function isActionable(task: Task, now = Date.now()): boolean {
  if (task.status === "DONE" || task.status === "ARCHIVED") return false;
  if (task.status !== "PENDING") return true;
  return !task.nextActionAt || new Date(task.nextActionAt).getTime() <= now;
}

export async function transitionDuePendingTasks(): Promise<number> {
  const now = nowISO();
  const { data: pending } = await supabase
    .from("tasks")
    .select("id, next_action_at")
    .eq("status", "PENDING");
  let count = 0;
  for (const task of pending ?? []) {
    if (
      task.next_action_at &&
      new Date(task.next_action_at).getTime() <= Date.now()
    ) {
      await supabase
        .from("tasks")
        .update({ status: "BACKLOG", updated_at: now })
        .eq("id", task.id);
      count++;
    }
  }
  if (count > 0) invalidate("tasks");
  return count;
}

// --- Task mutations ---

export async function markTaskDone(taskId: string): Promise<void> {
  const now = nowISO();
  await supabase
    .from("tasks")
    .update({ status: "DONE", completed_at: now, updated_at: now })
    .eq("id", taskId);
  invalidate("tasks");
}

export async function markTaskArchived(taskId: string): Promise<void> {
  const now = nowISO();
  const { data: task } = await supabase
    .from("tasks")
    .select("completed_at")
    .eq("id", taskId)
    .single();
  await supabase
    .from("tasks")
    .update({
      status: "ARCHIVED",
      completed_at: task?.completed_at ?? now,
      updated_at: now,
    })
    .eq("id", taskId);
  invalidate("tasks");
}

export async function unmarkTaskDone(taskId: string): Promise<void> {
  const now = nowISO();
  await supabase
    .from("tasks")
    .update({ status: "BACKLOG", completed_at: null, updated_at: now })
    .eq("id", taskId);
  invalidate("tasks");
}

// --- Scoring ---

const KIND_WEIGHTS: Record<string, number> = {
  LEGAL: 40, MONEY: 30, MAINTENANCE: 10, CAREGIVER: 5,
  CONTENT: 25, PRODUCT: 30, NETWORKING: 20, LEARNING: 15, OPS: 10, CUSTOM: 10,
};

export function scoreTask(
  task: Task,
  categoryKind: CategoryKind | undefined,
  availableMinutesRemaining: number
): number {
  if (!isActionable(task)) return -1;
  if (task.blockedByTaskIds && task.blockedByTaskIds.length > 0) return -1;
  const totalEstimate = getTaskEstimateMinutes(task);
  if (totalEstimate > 0 && totalEstimate > availableMinutesRemaining && availableMinutesRemaining > 0) return -1;

  let score = 0;
  score += KIND_WEIGHTS[categoryKind ?? ""] ?? 0;

  if (task.dueDate) {
    const days = (new Date(task.dueDate).getTime() - Date.now()) / 86_400_000;
    if (days <= 3) score += 35;
    else if (days <= 7) score += 25;
  }
  if (task.softDeadline) {
    const days = (new Date(task.softDeadline).getTime() - Date.now()) / 86_400_000;
    if (days <= 7) score += 15;
  }

  if (task.status === "IN_PROGRESS") score += 20;
  if (task.status === "TODAY") score += 50;
  const est = totalEstimate || 30;
  if (est <= 15) score += 12;
  else if (est <= 30) score += 8;

  if (task.moneyImpact && task.moneyImpact > 0) {
    score += Math.min(20, task.moneyImpact / 20);
  }

  return score;
}

export function buildStabilizerStackSplit(
  tasks: Task[],
  categories: Category[],
  remainingCapacity: number,
  maxTasks = 5
): { pinned: Task[]; suggested: Task[] } {
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const pool = tasks.filter((t) => t.domain === "LIFE_ADMIN" && isActionable(t));

  const pinned = pool.filter((t) => t.status === "TODAY").slice(0, maxTasks);
  const pinnedIds = new Set(pinned.map((t) => t.id));
  const pinnedMins = pinned.reduce((s, t) => s + (getTaskEstimateMinutes(t) || 15), 0);
  const minsLeft = Math.max(0, remainingCapacity - pinnedMins);

  const scored = pool
    .filter((t) => !pinnedIds.has(t.id))
    .map((t) => ({ task: t, score: scoreTask(t, catMap.get(t.categoryId)?.kind, minsLeft) }))
    .filter((s) => s.score >= 0)
    .sort((a, b) => b.score - a.score);

  const fillFromScored = (
    scoredList: { task: Task; score: number }[],
    cap: number,
    budget: number
  ): Task[] => {
    const result: Task[] = [];
    const kindCount: Record<string, number> = {};
    let usedMinutes = 0;
    for (const { task } of scoredList) {
      if (result.length >= cap) continue;
      const est = getTaskEstimateMinutes(task) || 15;
      if (usedMinutes + est > budget && usedMinutes > 0) continue;
      const kind = catMap.get(task.categoryId)?.kind ?? "";
      if ((kindCount[kind] ?? 0) >= 2 && scoredList.length > cap) continue;
      result.push(task);
      usedMinutes += est;
      kindCount[kind] = (kindCount[kind] ?? 0) + 1;
    }
    return result;
  };

  const suggested = fillFromScored(scored, maxTasks - pinned.length, minsLeft);
  return { pinned, suggested };
}

export function buildStabilizerStack(
  tasks: Task[],
  categories: Category[],
  availableMinutes: number,
  maxTasks = 5
): Task[] {
  const { pinned, suggested } = buildStabilizerStackSplit(tasks, categories, availableMinutes, maxTasks);
  return [...pinned, ...suggested];
}

export function getCategoriesByDomain(categories: Category[], domain: TaskDomain): Category[] {
  return categories.filter((c) => c.domain === domain);
}

export function isProjectMode(_task: Task): boolean {
  return true;
}

export function getTaskEstimateMinutes(task: Task): number {
  return task.subtasks.reduce((sum, subtask) => sum + (subtask.estimateMinutes ?? 0), 0);
}

export function getTaskActualSeconds(task: Task): number {
  return task.subtasks.reduce((sum, subtask) => sum + (subtask.actualSecondsTotal ?? 0), 0);
}

export async function getHiddenCategoryIds(): Promise<string[]> {
  const { data } = await supabase
    .from("app_settings")
    .select("hidden_category_ids")
    .eq("id", "default")
    .maybeSingle();
  return (data?.hidden_category_ids as string[]) ?? [];
}

export async function toggleCategoryVisibility(categoryId: string): Promise<void> {
  const userId = await getUserId();
  const { data: settings } = await supabase
    .from("app_settings")
    .select("*")
    .eq("id", "default")
    .maybeSingle();
  const s = settings ? rowToAppSettings(settings) : null;
  const hidden = s?.hiddenCategoryIds ?? [];
  const next = hidden.includes(categoryId)
    ? hidden.filter((id) => id !== categoryId)
    : [...hidden, categoryId];
  await supabase.from("app_settings").upsert({
    id: "default",
    user_id: userId,
    role: s?.role ?? "Life",
    available_minutes: s?.availableMinutes ?? 120,
    builder_available_minutes: s?.builderAvailableMinutes ?? 120,
    dark_mode: s?.darkMode ?? false,
    hidden_category_ids: next,
  });
  invalidate("appSettings");
}

const DEFAULT_CONTEXT_CARD = {
  why: "A custom category that matters to you.",
  winCondition: "Progress made and clarity gained.",
  script: "One step at a time.",
};

export async function addCustomCategory(
  name: string,
  domain: TaskDomain,
  contextCard?: { why: string; winCondition: string; script: string }
): Promise<Category | null> {
  const userId = await getUserId();
  const { count } = await supabase
    .from("categories")
    .select("id", { count: "exact", head: true })
    .eq("kind", "CUSTOM");
  if ((count ?? 0) >= 5) return null;

  const category: Category = {
    id: generateId(),
    name: name.trim(),
    kind: "CUSTOM",
    domain,
    contextCard: contextCard ?? DEFAULT_CONTEXT_CARD,
  };
  await supabase.from("categories").insert({
    id: category.id,
    user_id: userId,
    name: category.name,
    kind: category.kind,
    domain: category.domain,
    context_card: category.contextCard,
  });
  invalidate("categories");
  return category;
}

export async function deleteCustomCategory(id: string): Promise<boolean> {
  const { data: catRow } = await supabase
    .from("categories")
    .select("*")
    .eq("id", id)
    .single();
  if (!catRow) return false;
  const cat = rowToCategory(catRow);
  if (cat.kind !== "CUSTOM") return false;

  const { data: tasksInCat } = await supabase
    .from("tasks")
    .select("id")
    .eq("category_id", id);
  const { data: defaultCats } = await supabase
    .from("categories")
    .select("id")
    .eq("domain", cat.domain)
    .neq("kind", "CUSTOM")
    .limit(1);
  const fallbackId = defaultCats?.[0]?.id;
  const now = nowISO();

  if (fallbackId && tasksInCat && tasksInCat.length > 0) {
    for (const t of tasksInCat) {
      await supabase
        .from("tasks")
        .update({ category_id: fallbackId, updated_at: now })
        .eq("id", t.id);
    }
  }

  await supabase.from("categories").delete().eq("id", id);
  invalidate("categories", "tasks");
  return true;
}

export function getCustomCategories(categories: Category[]): Category[] {
  return categories.filter((c) => c.kind === "CUSTOM");
}

export function getDefaultCategories(categories: Category[]): Category[] {
  return categories.filter((c) => c.kind !== "CUSTOM");
}

export function getWaitingTasks(tasks: Task[], domain: TaskDomain): Task[] {
  return tasks
    .filter((t) => t.domain === domain && isWaiting(t))
    .sort((a, b) => {
      const aDate = a.nextActionAt ? new Date(a.nextActionAt).getTime() : Infinity;
      const bDate = b.nextActionAt ? new Date(b.nextActionAt).getTime() : Infinity;
      return aDate - bDate;
    });
}

// --- Seed ---

export async function seedDatabase() {
  const userId = await getUserId();
  const { count } = await supabase
    .from("categories")
    .select("id", { count: "exact", head: true });
  if ((count ?? 0) > 0) return;

  const now = nowISO();
  const lifeAdminCategories: Array<{ id: string; user_id: string; name: string; kind: string; domain: string; context_card: object }> = [
    { id: generateId(), user_id: userId, name: "LEGAL", kind: "LEGAL", domain: "LIFE_ADMIN", context_card: { why: "Fundamental security and peace of mind. Ensures your life and business have a protected foundation.", winCondition: "Every crucial document is filed, deadlines met, and you are 100% compliant.", script: "One step at a time. You are protected." } },
    { id: generateId(), user_id: userId, name: "MONEY", kind: "MONEY", domain: "LIFE_ADMIN", context_card: { why: "The fuel for your projects and family. Financial clarity removes the weight of the unknown.", winCondition: "Runway is known, bills are automated, and cash flow supports your current state.", script: "You are handling the essentials. You are in control." } },
    { id: generateId(), user_id: userId, name: "MAINTENANCE", kind: "MAINTENANCE", domain: "LIFE_ADMIN", context_card: { why: "Your environment and body. Small leaks sink great ships; keeping the baseline prevents chaos.", winCondition: "Physical spaces are clear, systems are operational, and health is actively sustained.", script: "Focus on the process. Your space is ready for you." } },
    { id: generateId(), user_id: userId, name: "CAREGIVER", kind: "CAREGIVER", domain: "LIFE_ADMIN", context_card: { why: "People and relationships. Caregiving, family, and connection are the foundation of stability.", winCondition: "Key relationships nurtured, dependents cared for, and your capacity to show up is sustained.", script: "Breathe through the tasks. You are resilient." } },
  ];

  const builderCategories: Array<{ id: string; user_id: string; name: string; kind: string; domain: string; context_card: object }> = [
    { id: generateId(), user_id: userId, name: "LEGAL", kind: "LEGAL", domain: "BUSINESS", context_card: { why: "Protects your business and intellectual property. Compliance and contracts reduce future risk.", winCondition: "All business-critical documents filed, agreements signed, and compliance current.", script: "One step at a time. Your business is protected." } },
    { id: generateId(), user_id: userId, name: "CONTENT", kind: "CONTENT", domain: "BUSINESS", context_card: { why: "Content builds reach and trust. Each piece compounds your audience and authority.", winCondition: "Consistent output that serves your audience and advances your message.", script: "Ship it. Done is better than perfect." } },
    { id: generateId(), user_id: userId, name: "PRODUCT", kind: "PRODUCT", domain: "BUSINESS", context_card: { why: "The product is what delivers value. Building and refining it is core to your business.", winCondition: "Core features work, users are unblocked, and the roadmap is clear.", script: "Focus on the next release. Iterate." } },
    { id: generateId(), user_id: userId, name: "NETWORKING", kind: "NETWORKING", domain: "BUSINESS", context_card: { why: "Relationships open doors. Warm outreach and genuine connection create opportunities.", winCondition: "Key relationships nurtured, introductions made, and you show up consistently.", script: "One conversation at a time. Be helpful." } },
    { id: generateId(), user_id: userId, name: "LEARNING", kind: "LEARNING", domain: "BUSINESS", context_card: { why: "Skills compound. Learning keeps you sharp and ahead of shifts in your field.", winCondition: "Time blocked for learning, skills applied, and knowledge gaps closing.", script: "Small increments. You're building capability." } },
    { id: generateId(), user_id: userId, name: "OPS", kind: "OPS", domain: "BUSINESS", context_card: { why: "Operations keep everything running. Tools, systems, and processes prevent chaos.", winCondition: "Systems work, vendors are managed, and the machine runs smoothly.", script: "Fix the leak. Automate the repeat." } },
  ];

  await supabase.from("categories").insert([...lifeAdminCategories, ...builderCategories]);

  const legalId = lifeAdminCategories[0].id;
  await supabase.from("tasks").insert({
    id: generateId(),
    user_id: userId,
    category_id: legalId,
    domain: "LIFE_ADMIN",
    title: "Renew U.S. passport (expired)",
    status: "BACKLOG",
    priority: 1,
    estimate_minutes: 30,
    actual_seconds_total: 0,
    context_card: { why: "Restores legal travel/ID flexibility and removes a major background stressor.", nextMicroStep: "Confirm renewal path + required documents, then pick the earliest appointment/mail option.", reframe: "This is competency restoration — one admin step that unlocks future freedom." },
    subtasks: [
      { id: generateId(), title: "Confirm renewal method (mail vs appointment)", done: false },
      { id: generateId(), title: "Gather required documents", done: false },
      { id: generateId(), title: "Take/obtain passport photo", done: false },
      { id: generateId(), title: "Complete DS-82 / required form", done: false },
      { id: generateId(), title: "Pay fee + submit", done: false },
    ],
    created_at: now,
    updated_at: now,
  });

  await supabase.from("app_settings").upsert({
    id: "default",
    user_id: userId,
    role: "Life",
    available_minutes: 120,
    builder_available_minutes: 120,
    dark_mode: false,
    hidden_category_ids: [],
  });

  invalidate("categories", "tasks", "appSettings");
}

// --- Supabase mutation helpers for pages ---

export async function updateTask(taskId: string, fields: Partial<Record<string, unknown>>): Promise<void> {
  const snakeFields: Record<string, unknown> = {};
  const fieldMap: Record<string, string> = {
    categoryId: "category_id",
    domain: "domain",
    title: "title",
    notes: "notes",
    status: "status",
    priority: "priority",
    dueDate: "due_date",
    softDeadline: "soft_deadline",
    blockedByTaskIds: "blocked_by_task_ids",
    estimateMinutes: "estimate_minutes",
    actualSecondsTotal: "actual_seconds_total",
    moneyImpact: "money_impact",
    frictionNote: "friction_note",
    nextActionAt: "next_action_at",
    pendingReason: "pending_reason",
    contextCard: "context_card",
    subtasks: "subtasks",
    timeTrackingMode: "time_tracking_mode",
    completedAt: "completed_at",
    updatedAt: "updated_at",
  };
  for (const [key, value] of Object.entries(fields)) {
    const snakeKey = fieldMap[key] ?? key;
    snakeFields[snakeKey] = value === undefined ? null : value;
  }
  if (!snakeFields.updated_at) snakeFields.updated_at = nowISO();
  await supabase.from("tasks").update(snakeFields).eq("id", taskId);
  invalidate("tasks");
}

export async function addTask(task: Task): Promise<void> {
  const userId = await getUserId();
  await supabase.from("tasks").insert({
    id: task.id,
    user_id: userId,
    category_id: task.categoryId,
    domain: task.domain,
    title: task.title,
    notes: task.notes,
    status: task.status,
    priority: task.priority,
    due_date: task.dueDate,
    soft_deadline: task.softDeadline,
    blocked_by_task_ids: task.blockedByTaskIds,
    estimate_minutes: task.estimateMinutes,
    actual_seconds_total: task.actualSecondsTotal,
    money_impact: task.moneyImpact,
    friction_note: task.frictionNote,
    next_action_at: task.nextActionAt,
    pending_reason: task.pendingReason,
    context_card: task.contextCard,
    subtasks: task.subtasks,
    time_tracking_mode: "PROJECT",
    created_at: task.createdAt,
    updated_at: task.updatedAt,
    completed_at: task.completedAt,
  });
  invalidate("tasks");
}

export async function deleteTask(taskId: string): Promise<void> {
  await supabase.from("time_entries").delete().eq("task_id", taskId);
  await supabase.from("tasks").delete().eq("id", taskId);
  invalidate("tasks", "timeEntries");
}

export async function addTimeEntry(entry: TimeEntry): Promise<void> {
  const userId = await getUserId();
  await supabase.from("time_entries").insert({
    id: entry.id,
    user_id: userId,
    task_id: entry.taskId,
    subtask_id: entry.subtaskId,
    start_at: entry.startAt,
    end_at: entry.endAt,
    seconds: entry.seconds,
    pause_reason: entry.pauseReason,
  });
  invalidate("timeEntries");
}

export async function updateTimeEntry(id: string, fields: Record<string, unknown>): Promise<void> {
  const snakeFields: Record<string, unknown> = {};
  const fieldMap: Record<string, string> = {
    endAt: "end_at", seconds: "seconds", pauseReason: "pause_reason",
    startAt: "start_at", subtaskId: "subtask_id", taskId: "task_id",
  };
  for (const [key, value] of Object.entries(fields)) {
    snakeFields[fieldMap[key] ?? key] = value === undefined ? null : value;
  }
  await supabase.from("time_entries").update(snakeFields).eq("id", id);
  invalidate("timeEntries");
}

export async function deleteTimeEntry(id: string): Promise<void> {
  await supabase.from("time_entries").delete().eq("id", id);
  invalidate("timeEntries");
}

export async function deleteTimeEntriesForTask(taskId: string): Promise<void> {
  await supabase.from("time_entries").delete().eq("task_id", taskId);
  invalidate("timeEntries");
}

export async function updateAppSettings(fields: Partial<AppSettings>): Promise<void> {
  const snakeFields: Record<string, unknown> = {};
  const fieldMap: Record<string, string> = {
    role: "role",
    availableMinutes: "available_minutes",
    builderAvailableMinutes: "builder_available_minutes",
    darkMode: "dark_mode",
    hiddenCategoryIds: "hidden_category_ids",
  };
  for (const [key, value] of Object.entries(fields)) {
    if (key === "id") continue;
    snakeFields[fieldMap[key] ?? key] = value;
  }
  await supabase.from("app_settings").update(snakeFields).eq("id", "default");
  invalidate("appSettings");
}

export async function addWin(win: Win): Promise<void> {
  const userId = await getUserId();
  await supabase.from("wins").insert({
    id: win.id,
    user_id: userId,
    text: win.text,
    date: win.date,
    tags: win.tags,
    created_at: win.createdAt,
  });
  invalidate("wins");
}

export async function updateWin(id: string, fields: { text?: string; date?: string; tags?: WinTag[] }): Promise<void> {
  await supabase.from("wins").update(fields).eq("id", id);
  invalidate("wins");
}

export async function addWeeklyReview(review: WeeklyReview): Promise<void> {
  const userId = await getUserId();
  await supabase.from("weekly_reviews").insert({
    id: review.id,
    user_id: userId,
    week_start: review.weekStart,
    answers: { ...review.answers, _status: review.status },
    created_at: review.createdAt,
  });
  invalidate("weeklyReviews");
}

export async function updateWeeklyReview(
  id: string,
  status: WeeklyReviewStatus,
  answers: WeeklyReview["answers"]
): Promise<void> {
  await supabase
    .from("weekly_reviews")
    .update({ answers: { ...answers, _status: status } })
    .eq("id", id);
  invalidate("weeklyReviews");
}

export async function deleteWeeklyReview(id: string): Promise<void> {
  await supabase.from("weekly_reviews").delete().eq("id", id);
  invalidate("weeklyReviews");
}

export async function addHabit(habit: Habit): Promise<void> {
  const userId = await getUserId();
  await supabase.from("habits").insert({
    id: habit.id,
    user_id: userId,
    name: habit.name,
    type: habit.type,
    schedule_type: habit.scheduleType,
    weekdays: habit.weekdays,
    every_n_days: habit.everyNDays,
    times_per_week: habit.timesPerWeek,
    goal_target: habit.goalTarget,
    unit: habit.unit,
    start_date: habit.startDate,
    time_of_day: habit.timeOfDay,
    show_in_today: habit.showInToday,
    allow_partial: habit.allowPartial,
    allow_skip: habit.allowSkip,
    color: habit.color,
    icon: habit.icon,
    sort_order: habit.sortOrder,
    created_at: habit.createdAt,
    updated_at: habit.updatedAt,
  });
  invalidate("habits");
}

export async function updateHabit(id: string, fields: Partial<Habit>): Promise<void> {
  const snakeFields: Record<string, unknown> = {};
  const fieldMap: Record<string, string> = {
    name: "name", type: "type", scheduleType: "schedule_type",
    weekdays: "weekdays", everyNDays: "every_n_days", timesPerWeek: "times_per_week",
    goalTarget: "goal_target", unit: "unit", startDate: "start_date",
    timeOfDay: "time_of_day", showInToday: "show_in_today",
    allowPartial: "allow_partial", allowSkip: "allow_skip",
    color: "color", icon: "icon", archivedAt: "archived_at",
    sortOrder: "sort_order", updatedAt: "updated_at",
  };
  for (const [key, value] of Object.entries(fields)) {
    if (key === "id" || key === "createdAt") continue;
    snakeFields[fieldMap[key] ?? key] = value === undefined ? null : value;
  }
  await supabase.from("habits").update(snakeFields).eq("id", id);
  invalidate("habits");
}

export async function bulkPutHabits(habits: Habit[]): Promise<void> {
  for (const habit of habits) {
    await updateHabit(habit.id, { sortOrder: habit.sortOrder, updatedAt: habit.updatedAt });
  }
  invalidate("habits");
}

// --- Timer state helpers ---

export async function getTimerState(): Promise<TimerState | undefined> {
  const { data } = await supabase
    .from("timer_state")
    .select("*")
    .eq("id", "active")
    .maybeSingle();
  return data ? rowToTimerState(data) : undefined;
}

export async function putTimerState(state: TimerState): Promise<void> {
  const userId = await getUserId();
  await supabase.from("timer_state").upsert({
    id: state.id,
    user_id: userId,
    task_id: state.taskId,
    subtask_id: state.subtaskId,
    time_entry_id: state.timeEntryId,
    started_at: state.startedAt,
    paused_at: state.pausedAt,
    accumulated_seconds: state.accumulatedSeconds,
  });
  invalidate("timerState");
}

export async function updateTimerState(fields: Partial<TimerState>): Promise<void> {
  const snakeFields: Record<string, unknown> = {};
  const fieldMap: Record<string, string> = {
    startedAt: "started_at", pausedAt: "paused_at",
    accumulatedSeconds: "accumulated_seconds",
    taskId: "task_id", subtaskId: "subtask_id",
    timeEntryId: "time_entry_id",
  };
  for (const [key, value] of Object.entries(fields)) {
    if (key === "id") continue;
    snakeFields[fieldMap[key] ?? key] = value === undefined ? null : value;
  }
  await supabase.from("timer_state").update(snakeFields).eq("id", "active");
  invalidate("timerState");
}

export async function deleteTimerState(): Promise<void> {
  await supabase.from("timer_state").delete().eq("id", "active");
  invalidate("timerState");
}

export async function resetAllData(): Promise<void> {
  const tables = [
    "timer_state", "time_entries", "habit_logs", "habits",
    "wins", "daily_capacity", "weekly_reviews", "tasks",
    "categories", "app_settings",
  ];
  for (const table of tables) {
    await supabase.from(table).delete().neq("id", "__never__");
  }
  invalidate(
    "categories", "tasks", "timeEntries", "weeklyReviews",
    "timerState", "appSettings", "dailyCapacity", "wins",
    "habits", "habitLogs"
  );
}
