import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/AuthContext";
import type {
  Category,
  Task,
  TimeEntry,
  WeeklyReview,
  TimerState,
  AppSettings,
  DailyCapacity,
  Win,
} from "../db";
import type { Habit, HabitLog } from "../habits";

function rowToCategory(r: Record<string, unknown>): Category {
  return {
    id: r.id as string,
    name: r.name as string,
    kind: r.kind as Category["kind"],
    domain: r.domain as Category["domain"],
    contextCard: r.context_card as Category["contextCard"],
  };
}

function rowToTask(r: Record<string, unknown>): Task {
  return {
    id: r.id as string,
    categoryId: r.category_id as string,
    domain: r.domain as Task["domain"],
    title: r.title as string,
    notes: r.notes as string | undefined,
    status: r.status as Task["status"],
    priority: r.priority as Task["priority"],
    dueDate: r.due_date as string | undefined,
    softDeadline: r.soft_deadline as string | undefined,
    blockedByTaskIds: r.blocked_by_task_ids as string[] | undefined,
    estimateMinutes: r.estimate_minutes as number | undefined,
    actualSecondsTotal: (r.actual_seconds_total as number) ?? 0,
    moneyImpact: r.money_impact as number | undefined,
    frictionNote: r.friction_note as string | undefined,
    nextActionAt: r.next_action_at as string | undefined,
    pendingReason: r.pending_reason as string | undefined,
    contextCard: r.context_card as Task["contextCard"],
    subtasks: (r.subtasks as Task["subtasks"]) ?? [],
    timeTrackingMode: r.time_tracking_mode as Task["timeTrackingMode"],
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    completedAt: r.completed_at as string | undefined,
  };
}

function rowToTimeEntry(r: Record<string, unknown>): TimeEntry {
  return {
    id: r.id as string,
    taskId: r.task_id as string,
    subtaskId: r.subtask_id as string | undefined,
    startAt: r.start_at as string,
    endAt: r.end_at as string | undefined,
    seconds: (r.seconds as number) ?? 0,
    pauseReason: r.pause_reason as string | undefined,
  };
}

function rowToWeeklyReview(r: Record<string, unknown>): WeeklyReview {
  const raw = r.answers as Record<string, unknown> | null;
  return {
    id: r.id as string,
    weekStart: r.week_start as string,
    status: ((raw?._status as string) || "completed") as WeeklyReview["status"],
    answers: {
      friction: raw?.friction as string | undefined,
      categoryFocus: raw?.categoryFocus as string | undefined,
      scariestNextStep: raw?.scariestNextStep as string | undefined,
    },
    createdAt: r.created_at as string,
  };
}

function rowToTimerState(r: Record<string, unknown>): TimerState {
  return {
    id: r.id as string,
    taskId: r.task_id as string,
    subtaskId: r.subtask_id as string | undefined,
    timeEntryId: r.time_entry_id as string,
    startedAt: r.started_at as string,
    pausedAt: r.paused_at as string | undefined,
    accumulatedSeconds: (r.accumulated_seconds as number) ?? 0,
  };
}

function rowToAppSettings(r: Record<string, unknown>): AppSettings {
  return {
    id: r.id as string,
    role: r.role as string,
    availableMinutes: (r.available_minutes as number) ?? 120,
    builderAvailableMinutes: (r.builder_available_minutes as number) ?? 120,
    darkMode: (r.dark_mode as boolean) ?? false,
    hiddenCategoryIds: r.hidden_category_ids as string[] | undefined,
  };
}

function rowToDailyCapacity(r: Record<string, unknown>): DailyCapacity {
  return {
    id: r.id as string,
    date: r.date as string,
    domain: r.domain as DailyCapacity["domain"],
    minutes: r.minutes as number,
  };
}

function rowToWin(r: Record<string, unknown>): Win {
  return {
    id: r.id as string,
    text: r.text as string,
    date: r.date as string,
    tags: (r.tags as Win["tags"]) ?? [],
    createdAt: r.created_at as string,
  };
}

function rowToHabit(r: Record<string, unknown>): Habit {
  return {
    id: r.id as string,
    name: r.name as string,
    type: r.type as Habit["type"],
    scheduleType: r.schedule_type as Habit["scheduleType"],
    weekdays: r.weekdays as number[] | undefined,
    everyNDays: r.every_n_days as number | undefined,
    timesPerWeek: r.times_per_week as number | undefined,
    goalTarget: r.goal_target as number | undefined,
    unit: r.unit as string | undefined,
    startDate: r.start_date as string,
    timeOfDay: (r.time_of_day as Habit["timeOfDay"]) ?? "ANYTIME",
    showInToday: (r.show_in_today as boolean) ?? true,
    allowPartial: (r.allow_partial as boolean) ?? false,
    allowSkip: (r.allow_skip as boolean) ?? true,
    color: r.color as string | undefined,
    icon: r.icon as string | undefined,
    archivedAt: r.archived_at as string | undefined,
    sortOrder: (r.sort_order as number) ?? 0,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function rowToHabitLog(r: Record<string, unknown>): HabitLog {
  return {
    id: r.id as string,
    habitId: r.habit_id as string,
    date: r.date as string,
    status: (r.status as HabitLog["status"]) ?? "NONE",
    value: r.value as number | undefined,
    note: r.note as string | undefined,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export {
  rowToCategory,
  rowToTask,
  rowToTimeEntry,
  rowToWeeklyReview,
  rowToTimerState,
  rowToAppSettings,
  rowToDailyCapacity,
  rowToWin,
  rowToHabit,
  rowToHabitLog,
};

// ---- Query hooks ----
// All query keys include userId to prevent cache leak between logins

export function useCategories() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["categories", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*");
      if (error) throw error;
      return (data ?? []).map(rowToCategory);
    },
  });
}

export function useCategory(id: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["categories", user?.id, id],
    enabled: !!user?.id && !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return rowToCategory(data);
    },
  });
}

export function useTasks() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["tasks", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select("*");
      if (error) throw error;
      return (data ?? []).map(rowToTask);
    },
  });
}

export function useTask(id: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["tasks", user?.id, id],
    enabled: !!user?.id && !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return rowToTask(data);
    },
  });
}

export function useTasksByCategory(categoryId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["tasks", user?.id, "category", categoryId],
    enabled: !!user?.id && !!categoryId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("category_id", categoryId!);
      if (error) throw error;
      return (data ?? []).map(rowToTask);
    },
  });
}

export function useTimeEntries() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["timeEntries", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("time_entries").select("*");
      if (error) throw error;
      return (data ?? []).map(rowToTimeEntry);
    },
  });
}

export function useTimeEntriesForTask(taskId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["timeEntries", user?.id, "task", taskId],
    enabled: !!user?.id && !!taskId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_entries")
        .select("*")
        .eq("task_id", taskId!);
      if (error) throw error;
      return (data ?? []).map(rowToTimeEntry);
    },
  });
}

export function useWeeklyReviews() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["weeklyReviews", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("weekly_reviews").select("*");
      if (error) throw error;
      return (data ?? []).map(rowToWeeklyReview);
    },
  });
}

export function useTimerState() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["timerState", user?.id],
    enabled: !!user?.id,
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("timer_state")
        .select("*")
        .eq("id", "active")
        .maybeSingle();
      if (error) throw error;
      return data ? rowToTimerState(data) : undefined;
    },
  });
}

export function useAppSettings() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["appSettings", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("*")
        .eq("id", "default")
        .maybeSingle();
      if (error) throw error;
      return data ? rowToAppSettings(data) : undefined;
    },
  });
}

export function useDailyCapacity(date: string, domain: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["dailyCapacity", user?.id, date, domain],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_capacity")
        .select("*")
        .eq("date", date)
        .eq("domain", domain)
        .maybeSingle();
      if (error) throw error;
      return data ? rowToDailyCapacity(data) : undefined;
    },
  });
}

export function useWins() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["wins", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("wins").select("*");
      if (error) throw error;
      return (data ?? []).map(rowToWin);
    },
  });
}

export function useWinsByDate(date: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["wins", user?.id, "date", date],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wins")
        .select("*")
        .eq("date", date)
        .order("created_at");
      if (error) throw error;
      return (data ?? []).map(rowToWin);
    },
  });
}

export function useHabits() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["habits", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("habits").select("*");
      if (error) throw error;
      return (data ?? []).map(rowToHabit);
    },
  });
}

export function useHabitLogs() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["habitLogs", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("habit_logs").select("*");
      if (error) throw error;
      return (data ?? []).map(rowToHabitLog);
    },
  });
}
