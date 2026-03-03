import { useEffect, useMemo, useState } from "react";
import { useHabits, useHabitLogs } from "../hooks/useData";
import { generateId, nowISO, todayDateStr, upsertHabitLog, addHabit as addHabitFn, updateHabit, bulkPutHabits } from "../db";
import {
  getConsistencyStats,
  getCurrentStreak,
  getRangeDates,
  isHabitScheduledOnDate,
  type Habit,
  type HabitLog,
  type HabitLogStatus,
  type HabitRange,
  type HabitScheduleType,
  type HabitTimeOfDay,
  type HabitType,
} from "../habits";

const HABIT_COLORS: string[] = [
  "#22c55e", "#3b82f6", "#a855f7", "#f97316", "#eab308", "#ec4899", "#14b8a6", "#64748b",
  "#ef4444", "#8b5cf6", "#06b6d4", "#84cc16", "#f43f5e", "#0ea5e9", "#f59e0b", "#10b981",
  "#6366f1", "#d946ef", "#22d3ee", "#a3e635", "#fb7185", "#38bdf8", "#fbbf24", "#34d399",
  "#818cf8", "#e879f9", "#67e8f9", "#bef264", "#f472b6", "#7dd3fc", "#fcd34d", "#6ee7b7",
  "#a78bfa", "#c084fc", "#5eead4", "#d9f99d", "#f9a8d4", "#bae6fd", "#fde68a", "#a7f3d0",
  "#c4b5fd", "#e9d5ff", "#99f6e4", "#ecfccb", "#fbcfe8", "#e0f2fe", "#fef3c7", "#d1fae5",
  "#a855f7", "#ec4899",
];

const HABIT_ICONS: string[] = [
  "favorite", "fitness_center", "menu_book", "self_improvement", "water_drop", "schedule", "directions_walk", "bedtime",
  "local_florist", "restaurant", "coffee", "nightlight", "star", "bolt", "spa", "pool", "sports_gymnastics",
  "hiking", "psychology", "school", "auto_stories", "science", "code", "computer", "eco",
  "shower", "kitchen", "cleaning_services", "home_repair_service", "grass", "terrain", "recycling", "energy_savings_leaf",
  "music_note", "headphones", "brush", "palette", "draw", "edit_note", "task_alt", "check_circle", "add_circle",
  "timer", "alarm", "event", "today", "trending_up", "insights", "bar_chart", "pie_chart",
];

const TIME_OF_DAY_OPTIONS: Array<{ value: HabitTimeOfDay; label: string }> = [
  { value: "MORNING", label: "Morning" },
  { value: "ANYTIME", label: "Anytime" },
  { value: "EVENING", label: "Evening" },
];

type DayEditorState = { open: boolean; date: string };

function getHabitTimeOfDay(habit: Habit): HabitTimeOfDay {
  return habit.timeOfDay ?? "ANYTIME";
}

function formatDateLabel(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function isDoneEquivalent(habit: Habit, log: HabitLog | undefined): boolean {
  if (!log) return false;
  if (log.status === "DONE") return true;
  if (log.status === "PARTIAL" && habit.allowPartial) return true;
  if (habit.type !== "CHECK" && typeof log.value === "number" && (habit.goalTarget ?? 0) > 0) {
    return log.value >= (habit.goalTarget ?? 0);
  }
  return false;
}

function dayCellLabel(status: HabitLogStatus): string {
  if (status === "DONE") return "D";
  if (status === "PARTIAL") return "P";
  if (status === "SKIP") return "S";
  return "";
}

export default function HabitsPage() {
  const { data: habitsRaw = [] } = useHabits();
  const habits = [...habitsRaw].sort((a, b) => a.sortOrder - b.sortOrder);
  const { data: logs = [] } = useHabitLogs();
  const [range, setRange] = useState<HabitRange>("MONTH");
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [dayEditor, setDayEditor] = useState<DayEditorState>({ open: false, date: todayDateStr() });
  const [historyTimeFilter, setHistoryTimeFilter] = useState<"ALL" | HabitTimeOfDay>("ALL");
  const [todaySectionsOpen, setTodaySectionsOpen] = useState<Record<HabitTimeOfDay, boolean>>({
    MORNING: true,
    ANYTIME: false,
    EVENING: false,
  });

  const activeHabits = habits.filter((h) => !h.archivedAt);
  const today = todayDateStr();
  const rangeDates = useMemo(() => getRangeDates(range, today), [range, today]);

  const logsByHabitAndDate = useMemo(() => {
    const map = new Map<string, HabitLog>();
    for (const log of logs) {
      map.set(`${log.habitId}|${log.date}`, log);
    }
    return map;
  }, [logs]);

  const getLog = (habitId: string, date: string) => logsByHabitAndDate.get(`${habitId}|${date}`);

  const todayHabits = activeHabits.filter((habit) => habit.showInToday && isHabitScheduledOnDate(habit, today));
  const todayHabitsByTime = useMemo(() => {
    return {
      MORNING: todayHabits.filter((habit) => getHabitTimeOfDay(habit) === "MORNING"),
      ANYTIME: todayHabits.filter((habit) => getHabitTimeOfDay(habit) === "ANYTIME"),
      EVENING: todayHabits.filter((habit) => getHabitTimeOfDay(habit) === "EVENING"),
    };
  }, [todayHabits]);
  const todayCompleted = todayHabits.filter((habit) => isDoneEquivalent(habit, getLog(habit.id, today))).length;
  const historyHabits =
    historyTimeFilter === "ALL"
      ? activeHabits
      : activeHabits.filter((habit) => getHabitTimeOfDay(habit) === historyTimeFilter);

  const setStatus = async (habit: Habit, date: string, status: HabitLogStatus) => {
    const existing = getLog(habit.id, date);
    const keepValue = status === "DONE" || status === "PARTIAL" ? existing?.value : undefined;
    await upsertHabitLog(habit.id, date, {
      status,
      value: keepValue,
      note: existing?.note,
    });
  };

  const setNumericValue = async (habit: Habit, date: string, nextValue: number) => {
    const safe = Math.max(0, nextValue);
    const status: HabitLogStatus = safe > 0 ? "PARTIAL" : "NONE";
    const existing = getLog(habit.id, date);
    await upsertHabitLog(habit.id, date, {
      status: safe >= (habit.goalTarget ?? 0) && (habit.goalTarget ?? 0) > 0 ? "DONE" : status,
      value: safe,
      note: existing?.note,
    });
  };

  const updateDayNote = async (habitId: string, date: string, note: string) => {
    const existing = getLog(habitId, date);
    await upsertHabitLog(habitId, date, {
      status: existing?.status ?? "NONE",
      value: existing?.value,
      note,
    });
  };

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-10 pb-24 md:pb-10 space-y-8">
      <section className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Habits</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Fast daily logging with calm, information-dense history.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowEdit(true)}
            className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Manage habits
          </button>
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="px-4 py-2.5 rounded-xl bg-gradient-accent text-white text-sm font-bold shadow-lg shadow-primary/20 hover:opacity-90 transition-all flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-base">add</span>
            Add habit
          </button>
        </div>
      </section>

      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Today</p>
            <p className="font-semibold">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</p>
          </div>
          <p className="text-sm font-semibold text-primary">{todayCompleted}/{todayHabits.length} completed</p>
        </div>

        {todayHabits.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No habits scheduled for today.</p>
        ) : (
          <div className="space-y-3">
            {TIME_OF_DAY_OPTIONS.map((section) => {
              const sectionHabits = todayHabitsByTime[section.value];
              const isOpen = todaySectionsOpen[section.value];
              return (
                <div key={section.value} className="rounded-xl border border-slate-200 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() =>
                      setTodaySectionsOpen((prev) => ({ ...prev, [section.value]: !prev[section.value] }))
                    }
                    className="w-full px-3 py-2.5 flex items-center justify-between gap-2 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`material-symbols-outlined text-sm transition-transform ${isOpen ? "rotate-90" : ""}`}>
                        chevron_right
                      </span>
                      <p className="text-sm font-bold">{section.label}</p>
                    </div>
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      {sectionHabits.length} habit{sectionHabits.length === 1 ? "" : "s"}
                    </p>
                  </button>
                  {isOpen && (
                    <div className="p-3 border-t border-slate-200 dark:border-slate-700 space-y-3">
                      {sectionHabits.length === 0 ? (
                        <p className="text-sm text-slate-500 dark:text-slate-400">No habits in this section.</p>
                      ) : (
                        sectionHabits.map((habit) => {
                          const log = getLog(habit.id, today);
                          const value = log?.value ?? 0;
                          return (
                            <div key={habit.id} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 flex flex-col gap-2">
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="material-symbols-outlined text-base" style={{ color: habit.color ?? "#a855f7" }}>
                                    {habit.icon ?? "check_circle"}
                                  </span>
                                  <p className="font-semibold truncate">{habit.name}</p>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setStatus(habit, today, log?.status === "DONE" ? "NONE" : "DONE")}
                                    className={`size-7 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-200 ${
                                      log?.status === "DONE"
                                        ? "border-transparent text-white shadow-md"
                                        : "border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500"
                                    }`}
                                    style={log?.status === "DONE" ? { background: habit.color ?? "#22c55e" } : undefined}
                                    title={log?.status === "DONE" ? "Uncheck to clear" : "Mark done"}
                                  >
                                    {log?.status === "DONE" ? (
                                      <span className="material-symbols-outlined text-base font-bold">check</span>
                                    ) : null}
                                  </button>
                                  {habit.allowPartial && (
                                    <button
                                      type="button"
                                      onClick={() => setStatus(habit, today, "PARTIAL")}
                                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${log?.status === "PARTIAL" ? "bg-amber-100 dark:bg-amber-900/40 border-amber-400 text-amber-700 dark:text-amber-300" : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"}`}
                                    >
                                      Partial
                                    </button>
                                  )}
                                  {habit.allowSkip && (
                                    <button
                                      type="button"
                                      onClick={() => setStatus(habit, today, "SKIP")}
                                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${log?.status === "SKIP" ? "bg-slate-200 dark:bg-slate-700 border-slate-400 text-slate-700 dark:text-slate-200" : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"}`}
                                    >
                                      Skip
                                    </button>
                                  )}
                                </div>
                              </div>
                              {habit.type !== "CHECK" && (
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    className="size-7 rounded-lg border border-slate-200 dark:border-slate-700"
                                    onClick={() => setNumericValue(habit, today, value - 1)}
                                  >
                                    -
                                  </button>
                                  <input
                                    type="number"
                                    value={value}
                                    min={0}
                                    onChange={(e) => setNumericValue(habit, today, Number(e.target.value) || 0)}
                                    className="w-18 text-center rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent px-2 py-1.5 text-sm"
                                  />
                                  <button
                                    type="button"
                                    className="size-7 rounded-lg border border-slate-200 dark:border-slate-700"
                                    onClick={() => setNumericValue(habit, today, value + 1)}
                                  >
                                    +
                                  </button>
                                  <span className="text-xs text-slate-500 dark:text-slate-400">
                                    goal {habit.goalTarget ?? 0} {habit.unit ?? ""}
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            {([
              { key: "WEEK", label: "Week" },
              { key: "MONTH", label: "Month" },
              { key: "THREE_MONTHS", label: "3 Months" },
            ] as const).map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setRange(item.key)}
                className={`px-4 py-2 text-sm font-semibold ${range === item.key ? "bg-primary text-white" : "bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800"}`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="flex rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            {([
              { key: "ALL", label: "All" },
              { key: "MORNING", label: "Morning" },
              { key: "ANYTIME", label: "Anytime" },
              { key: "EVENING", label: "Evening" },
            ] as const).map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setHistoryTimeFilter(item.key)}
                className={`px-3 py-2 text-xs font-semibold ${historyTimeFilter === item.key ? "bg-primary text-white" : "bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800"}`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Consistency is primary. Streak stays secondary.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="overflow-x-auto">
            <div className="min-w-max">
              <div className="flex border-b border-slate-200 dark:border-slate-800">
                <div className="w-72 shrink-0 px-4 py-3 text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  Habit
                </div>
                <div className="flex">
                  {rangeDates.map((date, idx) => {
                    const prevMonth = idx > 0 ? rangeDates[idx - 1].slice(0, 7) : date.slice(0, 7);
                    const currentMonth = date.slice(0, 7);
                    const monthStart = idx > 0 && prevMonth !== currentMonth;
                    return (
                      <button
                        key={date}
                        type="button"
                        onClick={() => setDayEditor({ open: true, date })}
                        className={`w-8 h-8 text-[10px] text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800 ${monthStart ? "border-l-2 border-l-slate-300 dark:border-l-slate-600" : "border-l border-l-slate-100 dark:border-l-slate-800"}`}
                        title={formatDateLabel(date)}
                      >
                        {new Date(`${date}T00:00:00`).getDate()}
                      </button>
                    );
                  })}
                </div>
              </div>

              {historyHabits.map((habit) => {
                const habitLogsByDate = new Map<string, HabitLog>();
                const allHabitLogsByDate = new Map<string, HabitLog>();
                for (const log of logs) {
                  if (log.habitId === habit.id) {
                    allHabitLogsByDate.set(log.date, log);
                  }
                }
                for (const date of rangeDates) {
                  const maybe = getLog(habit.id, date);
                  if (maybe) habitLogsByDate.set(date, maybe);
                }
                const stats = getConsistencyStats(habit, habitLogsByDate, rangeDates);
                const streak = getCurrentStreak(habit, allHabitLogsByDate, today);
                return (
                  <div key={habit.id} className="flex border-b border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => setShowEdit(true)}
                      className="w-72 shrink-0 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="material-symbols-outlined text-base" style={{ color: habit.color ?? "#a855f7" }}>
                          {habit.icon ?? "check_circle"}
                        </span>
                        <p className="font-semibold truncate">{habit.name}</p>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {stats.consistencyPct}% consistency • streak {streak}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {stats.numerator}/{stats.denominator} + {stats.skips} skips
                      </p>
                    </button>
                    <div className="flex">
                      {rangeDates.map((date, idx) => {
                        const log = getLog(habit.id, date);
                        const status = log?.status ?? "NONE";
                        const prevMonth = idx > 0 ? rangeDates[idx - 1].slice(0, 7) : date.slice(0, 7);
                        const currentMonth = date.slice(0, 7);
                        const monthStart = idx > 0 && prevMonth !== currentMonth;
                        return (
                          <button
                            key={`${habit.id}-${date}`}
                            type="button"
                            onClick={() => setDayEditor({ open: true, date })}
                            className={`w-8 h-8 border text-[10px] font-bold flex items-center justify-center ${monthStart ? "border-l-2 border-l-slate-300 dark:border-l-slate-600" : "border-l border-l-slate-100 dark:border-l-slate-800"} ${status === "DONE" ? "text-white" : status === "PARTIAL" ? "text-slate-700 dark:text-slate-200" : status === "SKIP" ? "text-slate-500" : "text-transparent"}`}
                            style={{
                              background:
                                status === "DONE"
                                  ? habit.color ?? "#a855f7"
                                  : status === "PARTIAL"
                                    ? `repeating-linear-gradient(45deg, ${habit.color ?? "#a855f7"}55, ${habit.color ?? "#a855f7"}55 4px, transparent 4px, transparent 8px)`
                                    : status === "SKIP"
                                      ? "#cbd5e1"
                                      : "transparent",
                            }}
                            title={`${habit.name} • ${formatDateLabel(date)} • ${status}`}
                          >
                            {dayCellLabel(status)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {historyHabits.length === 0 && (
                <div className="p-10 text-center text-slate-500 dark:text-slate-400">
                  {activeHabits.length === 0
                    ? "Add your first habit to start tracking consistency."
                    : "No habits match this time-of-day filter."}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <AddHabitModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        existingCount={activeHabits.length}
      />
      <ManageHabitsModal
        open={showEdit}
        onClose={() => setShowEdit(false)}
        habits={habits}
      />
      <DayEditorModal
        open={dayEditor.open}
        date={dayEditor.date}
        onClose={() => setDayEditor((s) => ({ ...s, open: false }))}
        onPrev={() => {
          const d = new Date(`${dayEditor.date}T00:00:00`);
          d.setDate(d.getDate() - 1);
          setDayEditor({ open: true, date: d.toISOString().slice(0, 10) });
        }}
        onNext={() => {
          const d = new Date(`${dayEditor.date}T00:00:00`);
          d.setDate(d.getDate() + 1);
          setDayEditor({ open: true, date: d.toISOString().slice(0, 10) });
        }}
        habits={activeHabits}
        getLog={getLog}
        setStatus={setStatus}
        setNumericValue={setNumericValue}
        setNote={updateDayNote}
      />
    </div>
  );
}

function AddHabitModal({
  open,
  onClose,
  existingCount,
}: {
  open: boolean;
  onClose: () => void;
  existingCount: number;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<HabitType>("CHECK");
  const [scheduleType, setScheduleType] = useState<HabitScheduleType>("DAILY");
  const [weekdays, setWeekdays] = useState<number[]>([1, 3, 5]);
  const [everyNDays, setEveryNDays] = useState(2);
  const [timesPerWeek, setTimesPerWeek] = useState(3);
  const [goalTarget, setGoalTarget] = useState(1);
  const [unit, setUnit] = useState("");
  const [showInToday, setShowInToday] = useState(true);
  const [timeOfDay, setTimeOfDay] = useState<HabitTimeOfDay>("ANYTIME");
  const [allowPartial, setAllowPartial] = useState(false);
  const [allowSkip, setAllowSkip] = useState(true);
  const [startDate, setStartDate] = useState(todayDateStr());
  const [color, setColor] = useState(HABIT_COLORS[0]);
  const [icon, setIcon] = useState(HABIT_ICONS[0]);
  const [showCustomColor, setShowCustomColor] = useState(false);
  const [showCustomIcon, setShowCustomIcon] = useState(false);

  if (!open) return null;

  const submit = async () => {
    if (!name.trim()) return;
    const now = nowISO();
    const habit: Habit = {
      id: generateId(),
      name: name.trim(),
      type,
      scheduleType,
      weekdays: scheduleType === "WEEKDAYS" ? weekdays : undefined,
      everyNDays: scheduleType === "EVERY_N_DAYS" ? everyNDays : undefined,
      timesPerWeek: scheduleType === "TIMES_PER_WEEK" ? timesPerWeek : undefined,
      goalTarget: type === "CHECK" ? undefined : goalTarget,
      unit: type === "CHECK" ? undefined : unit.trim() || undefined,
      startDate,
      timeOfDay,
      showInToday,
      allowPartial: type === "CHECK" ? allowPartial : true,
      allowSkip,
      color,
      icon,
      sortOrder: existingCount + 1,
      createdAt: now,
      updatedAt: now,
    };
    await addHabitFn(habit);
    onClose();
  };

  const toggleWeekday = (day: number) => {
    setWeekdays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)));
  };

  return (
    <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="max-w-2xl mx-auto bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Add Habit</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <HabitFormFields
          name={name}
          setName={setName}
          type={type}
          setType={(next) => {
            setType(next);
            if (next !== "CHECK") setAllowPartial(true);
          }}
          scheduleType={scheduleType}
          setScheduleType={(v) => setScheduleType(v)}
          weekdays={weekdays}
          toggleWeekday={toggleWeekday}
          everyNDays={everyNDays}
          setEveryNDays={setEveryNDays}
          timesPerWeek={timesPerWeek}
          setTimesPerWeek={setTimesPerWeek}
          goalTarget={goalTarget}
          setGoalTarget={setGoalTarget}
          unit={unit}
          setUnit={setUnit}
          timeOfDay={timeOfDay}
          setTimeOfDay={setTimeOfDay}
          showInToday={showInToday}
          setShowInToday={setShowInToday}
          allowPartial={allowPartial}
          setAllowPartial={setAllowPartial}
          allowSkip={allowSkip}
          setAllowSkip={setAllowSkip}
          startDate={startDate}
          setStartDate={setStartDate}
          color={color}
          setColor={setColor}
          icon={icon}
          setIcon={setIcon}
          showCustomColor={showCustomColor}
          setShowCustomColor={setShowCustomColor}
          showCustomIcon={showCustomIcon}
          setShowCustomIcon={setShowCustomIcon}
        />

        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold">
            Cancel
          </button>
          <button type="button" onClick={submit} className="px-4 py-2.5 rounded-xl bg-gradient-accent text-white text-sm font-bold">
            Add habit
          </button>
        </div>
      </div>
    </div>
  );
}

interface HabitFormFieldsProps {
  name: string;
  setName: (v: string) => void;
  type: HabitType;
  setType: (v: HabitType) => void;
  scheduleType: HabitScheduleType;
  setScheduleType: (v: HabitScheduleType) => void;
  weekdays: number[];
  toggleWeekday: (day: number) => void;
  everyNDays: number;
  setEveryNDays: (v: number) => void;
  timesPerWeek: number;
  setTimesPerWeek: (v: number) => void;
  goalTarget: number;
  setGoalTarget: (v: number) => void;
  unit: string;
  setUnit: (v: string) => void;
  timeOfDay: HabitTimeOfDay;
  setTimeOfDay: (v: HabitTimeOfDay) => void;
  showInToday: boolean;
  setShowInToday: (v: boolean) => void;
  allowPartial: boolean;
  setAllowPartial: (v: boolean) => void;
  allowSkip: boolean;
  setAllowSkip: (v: boolean) => void;
  startDate: string;
  setStartDate: (v: string) => void;
  color: string;
  setColor: (v: string) => void;
  icon: string;
  setIcon: (v: string) => void;
  showCustomColor: boolean;
  setShowCustomColor: (v: boolean) => void;
  showCustomIcon: boolean;
  setShowCustomIcon: (v: boolean) => void;
}

function HabitFormFields({
  name,
  setName,
  type,
  setType,
  scheduleType,
  setScheduleType,
  weekdays,
  toggleWeekday,
  everyNDays,
  setEveryNDays,
  timesPerWeek,
  setTimesPerWeek,
  goalTarget,
  setGoalTarget,
  unit,
  setUnit,
  timeOfDay,
  setTimeOfDay,
  showInToday,
  setShowInToday,
  allowPartial,
  setAllowPartial,
  allowSkip,
  setAllowSkip,
  startDate,
  setStartDate,
  color,
  setColor,
  icon,
  setIcon,
  showCustomColor,
  setShowCustomColor,
  showCustomIcon,
  setShowCustomIcon,
}: HabitFormFieldsProps) {
  const [showMoreColors, setShowMoreColors] = useState(false);
  const [showMoreIcons, setShowMoreIcons] = useState(false);

  useEffect(() => {
    const colorIdx = HABIT_COLORS.indexOf(color);
    if (colorIdx >= 10) setShowMoreColors(true);
  }, [color]);

  useEffect(() => {
    const iconIdx = HABIT_ICONS.indexOf(icon);
    if (iconIdx >= 10) setShowMoreIcons(true);
  }, [icon]);

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-4 py-2.5"
          placeholder="e.g. Walk 8k steps"
          autoFocus
        />
      </label>

      <div className="grid sm:grid-cols-2 gap-4">
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Type</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as HabitType)}
            className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-4 py-2.5"
          >
            <option value="CHECK">Check</option>
            <option value="COUNT">Count</option>
            <option value="TIME">Time</option>
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Start date</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-4 py-2.5"
          />
        </label>
      </div>

      <label className="block">
        <span className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Schedule</span>
        <select
          value={scheduleType}
          onChange={(e) => setScheduleType(e.target.value as HabitScheduleType)}
          className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-4 py-2.5"
        >
          <option value="DAILY">Daily</option>
          <option value="WEEKDAYS">Specific weekdays</option>
          <option value="EVERY_N_DAYS">Every N days</option>
          <option value="TIMES_PER_WEEK">X times per week</option>
        </select>
      </label>

      <label className="block">
        <span className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Time of day</span>
        <select
          value={timeOfDay}
          onChange={(e) => setTimeOfDay(e.target.value as HabitTimeOfDay)}
          className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-4 py-2.5"
        >
          {TIME_OF_DAY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {scheduleType === "WEEKDAYS" && (
        <div className="flex flex-wrap gap-2">
          {(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const).map((label, day) => (
            <button
              key={label}
              type="button"
              onClick={() => toggleWeekday(day)}
              className={`px-3 py-1.5 rounded-lg text-sm border ${weekdays.includes(day) ? "border-primary text-primary bg-primary/10" : "border-slate-200 dark:border-slate-700"}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {scheduleType === "EVERY_N_DAYS" && (
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Every N days</span>
          <input
            type="number"
            min={1}
            value={everyNDays}
            onChange={(e) => setEveryNDays(Math.max(1, Number(e.target.value) || 1))}
            className="mt-1.5 w-32 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-4 py-2.5"
          />
        </label>
      )}

      {scheduleType === "TIMES_PER_WEEK" && (
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Times per week</span>
          <input
            type="number"
            min={1}
            max={7}
            value={timesPerWeek}
            onChange={(e) => setTimesPerWeek(Math.min(7, Math.max(1, Number(e.target.value) || 1)))}
            className="mt-1.5 w-32 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-4 py-2.5"
          />
        </label>
      )}

      {type !== "CHECK" && (
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Goal (optional)</span>
            <input
              type="number"
              min={1}
              value={goalTarget}
              onChange={(e) => setGoalTarget(Math.max(1, Number(e.target.value) || 1))}
              className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-4 py-2.5"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Unit</span>
            <input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder={type === "TIME" ? "minutes" : "steps"}
              className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-4 py-2.5"
            />
          </label>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showInToday} onChange={(e) => setShowInToday(e.target.checked)} />
          Show in Today
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={allowPartial}
            disabled={type !== "CHECK"}
            onChange={(e) => setAllowPartial(e.target.checked)}
          />
          Allow Partial (Check habits)
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={allowSkip} onChange={(e) => setAllowSkip(e.target.checked)} />
        Allow Skip
      </label>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">Color</p>
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex flex-wrap gap-1.5">
              {(showMoreColors ? HABIT_COLORS : HABIT_COLORS.slice(0, 10)).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setColor(c);
                    setShowCustomColor(false);
                  }}
                  className={`size-6 rounded-full border-2 shrink-0 ${color === c && !showCustomColor ? "border-slate-800 dark:border-slate-100 ring-2 ring-primary" : "border-transparent"}`}
                  style={{ background: c }}
                  title={c}
                />
              ))}
              <button
                type="button"
                onClick={() => setShowCustomColor(true)}
                className={`size-6 rounded-full border-2 shrink-0 flex items-center justify-center ${showCustomColor ? "border-primary bg-primary/10" : "border-dashed border-slate-300 dark:border-slate-600"}`}
                title="Add custom color"
              >
                <span className="material-symbols-outlined text-sm">add</span>
              </button>
              {HABIT_COLORS.length > 10 && (
                <button
                  type="button"
                  onClick={() => setShowMoreColors(!showMoreColors)}
                  className="text-xs font-semibold text-primary hover:underline ml-1 self-center"
                >
                  {showMoreColors ? "less" : "more"}
                </button>
              )}
            </div>
          </div>
          {showCustomColor && (
            <div className="mt-2 flex items-center gap-2">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="size-8 rounded border border-slate-200 dark:border-slate-700 cursor-pointer"
              />
              <input
                type="text"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="#hex"
                className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-1.5 text-sm"
              />
            </div>
          )}
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">Icon</p>
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex flex-wrap gap-1.5">
              {(showMoreIcons ? HABIT_ICONS : HABIT_ICONS.slice(0, 10)).map((i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setIcon(i);
                    setShowCustomIcon(false);
                  }}
                  className={`size-8 rounded-lg border shrink-0 flex items-center justify-center ${icon === i && !showCustomIcon ? "border-primary text-primary bg-primary/10" : "border-slate-200 dark:border-slate-700"}`}
                >
                  <span className="material-symbols-outlined text-base">{i}</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowCustomIcon(true)}
                className={`size-8 rounded-lg border shrink-0 flex items-center justify-center ${showCustomIcon ? "border-primary bg-primary/10" : "border-dashed border-slate-300 dark:border-slate-600"}`}
                title="Add custom icon"
              >
                <span className="material-symbols-outlined text-sm">add</span>
              </button>
              {HABIT_ICONS.length > 10 && (
                <button
                  type="button"
                  onClick={() => setShowMoreIcons(!showMoreIcons)}
                  className="text-xs font-semibold text-primary hover:underline ml-1 self-center"
                >
                  {showMoreIcons ? "less" : "more"}
                </button>
              )}
            </div>
          </div>
          {showCustomIcon && (
            <div className="mt-2 flex items-center gap-2">
              <input
                type="text"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                placeholder="e.g. local_florist"
                className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-1.5 text-sm"
              />
              <span className="material-symbols-outlined text-2xl shrink-0" style={{ color: color || "#a855f7" }}>
                {icon || "?"}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ManageHabitsModal({
  open,
  onClose,
  habits,
}: {
  open: boolean;
  onClose: () => void;
  habits: Habit[];
}) {
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);

  if (!open) return null;

  const active = habits.filter((h) => !h.archivedAt).sort((a, b) => a.sortOrder - b.sortOrder);
  const archived = habits.filter((h) => !!h.archivedAt).sort((a, b) => a.name.localeCompare(b.name));

  const move = async (index: number, dir: -1 | 1) => {
    const next = [...active];
    const swap = index + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[index], next[swap]] = [next[swap], next[index]];
    await bulkPutHabits(next.map((h, idx) => ({ ...h, sortOrder: idx + 1, updatedAt: nowISO() })));
  };

  const archive = async (habit: Habit) => {
    await updateHabit(habit.id, { archivedAt: nowISO(), updatedAt: nowISO() });
  };

  const restore = async (habit: Habit) => {
    await updateHabit(habit.id, {
      archivedAt: undefined,
      sortOrder: active.length + 1,
      updatedAt: nowISO(),
    });
  };

  return (
    <>
      <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
        <div className="max-w-2xl mx-auto bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">Manage Habits</h2>
            <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Active (reorder + archive)</p>
            {active.length === 0 && <p className="text-sm text-slate-500">No active habits.</p>}
            {active.map((habit, idx) => (
              <div key={habit.id} className="flex items-center justify-between gap-3 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="material-symbols-outlined text-base" style={{ color: habit.color ?? "#a855f7" }}>
                    {habit.icon ?? "check_circle"}
                  </span>
                  <p className="font-semibold truncate">{habit.name}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setEditingHabit(habit)}
                    className="size-8 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:border-primary hover:text-primary"
                    title="Edit habit"
                  >
                    <span className="material-symbols-outlined text-base">edit</span>
                  </button>
                  <button type="button" onClick={() => move(idx, -1)} className="size-8 rounded-lg border border-slate-200 dark:border-slate-700">↑</button>
                  <button type="button" onClick={() => move(idx, 1)} className="size-8 rounded-lg border border-slate-200 dark:border-slate-700">↓</button>
                  <button type="button" onClick={() => archive(habit)} className="px-3 py-1.5 rounded-lg border border-amber-300 text-amber-700 text-xs font-semibold">
                    Archive
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Archived</p>
            {archived.length === 0 && <p className="text-sm text-slate-500">No archived habits.</p>}
            {archived.map((habit) => (
              <div key={habit.id} className="flex items-center justify-between gap-3 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
                <p className="font-medium text-slate-500">{habit.name}</p>
                <button type="button" onClick={() => restore(habit)} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold">
                  Restore
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <EditHabitModal
        open={!!editingHabit}
        habit={editingHabit}
        onClose={() => setEditingHabit(null)}
        onSaved={() => setEditingHabit(null)}
      />
    </>
  );
}

function EditHabitModal({
  open,
  habit,
  onClose,
  onSaved,
}: {
  open: boolean;
  habit: Habit | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<HabitType>("CHECK");
  const [scheduleType, setScheduleType] = useState<HabitScheduleType>("DAILY");
  const [weekdays, setWeekdays] = useState<number[]>([1, 3, 5]);
  const [everyNDays, setEveryNDays] = useState(2);
  const [timesPerWeek, setTimesPerWeek] = useState(3);
  const [goalTarget, setGoalTarget] = useState(1);
  const [unit, setUnit] = useState("");
  const [showInToday, setShowInToday] = useState(true);
  const [timeOfDay, setTimeOfDay] = useState<HabitTimeOfDay>("ANYTIME");
  const [allowPartial, setAllowPartial] = useState(false);
  const [allowSkip, setAllowSkip] = useState(true);
  const [startDate, setStartDate] = useState(todayDateStr());
  const [color, setColor] = useState(HABIT_COLORS[0]);
  const [icon, setIcon] = useState(HABIT_ICONS[0]);
  const [showCustomColor, setShowCustomColor] = useState(false);
  const [showCustomIcon, setShowCustomIcon] = useState(false);

  useEffect(() => {
    if (habit) {
      setName(habit.name);
      setType(habit.type);
      setScheduleType(habit.scheduleType);
      setWeekdays(habit.weekdays ?? [1, 3, 5]);
      setEveryNDays(habit.everyNDays ?? 2);
      setTimesPerWeek(habit.timesPerWeek ?? 3);
      setGoalTarget(habit.goalTarget ?? 1);
      setUnit(habit.unit ?? "");
      setTimeOfDay(habit.timeOfDay ?? "ANYTIME");
      setShowInToday(habit.showInToday);
      setAllowPartial(habit.allowPartial);
      setAllowSkip(habit.allowSkip);
      setStartDate(habit.startDate);
      const habitColor = habit.color ?? HABIT_COLORS[0];
      const habitIcon = habit.icon ?? HABIT_ICONS[0];
      setColor(HABIT_COLORS.includes(habitColor) ? habitColor : habitColor);
      setIcon(HABIT_ICONS.includes(habitIcon) ? habitIcon : habitIcon);
      setShowCustomColor(!!habit.color && !HABIT_COLORS.includes(habit.color));
      setShowCustomIcon(!!habit.icon && !HABIT_ICONS.includes(habit.icon));
    }
  }, [habit?.id]);

  if (!open || !habit) return null;

  const submit = async () => {
    if (!name.trim()) return;
    const now = nowISO();
    await updateHabit(habit.id, {
      name: name.trim(),
      type,
      scheduleType,
      weekdays: scheduleType === "WEEKDAYS" ? weekdays : undefined,
      everyNDays: scheduleType === "EVERY_N_DAYS" ? everyNDays : undefined,
      timesPerWeek: scheduleType === "TIMES_PER_WEEK" ? timesPerWeek : undefined,
      goalTarget: type === "CHECK" ? undefined : goalTarget,
      unit: type === "CHECK" ? undefined : unit.trim() || undefined,
      startDate,
      timeOfDay,
      showInToday,
      allowPartial: type === "CHECK" ? allowPartial : true,
      allowSkip,
      color,
      icon,
      updatedAt: now,
    });
    onSaved();
  };

  const toggleWeekday = (day: number) => {
    setWeekdays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)));
  };

  return (
    <div className="fixed inset-0 z-70 bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="max-w-2xl mx-auto bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Edit Habit</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <HabitFormFields
          name={name}
          setName={setName}
          type={type}
          setType={(next) => {
            setType(next);
            if (next !== "CHECK") setAllowPartial(true);
          }}
          scheduleType={scheduleType}
          setScheduleType={(v) => setScheduleType(v)}
          weekdays={weekdays}
          toggleWeekday={toggleWeekday}
          everyNDays={everyNDays}
          setEveryNDays={setEveryNDays}
          timesPerWeek={timesPerWeek}
          setTimesPerWeek={setTimesPerWeek}
          goalTarget={goalTarget}
          setGoalTarget={setGoalTarget}
          unit={unit}
          setUnit={setUnit}
          timeOfDay={timeOfDay}
          setTimeOfDay={setTimeOfDay}
          showInToday={showInToday}
          setShowInToday={setShowInToday}
          allowPartial={allowPartial}
          setAllowPartial={setAllowPartial}
          allowSkip={allowSkip}
          setAllowSkip={setAllowSkip}
          startDate={startDate}
          setStartDate={setStartDate}
          color={color}
          setColor={setColor}
          icon={icon}
          setIcon={setIcon}
          showCustomColor={showCustomColor}
          setShowCustomColor={setShowCustomColor}
          showCustomIcon={showCustomIcon}
          setShowCustomIcon={setShowCustomIcon}
        />

        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold">
            Cancel
          </button>
          <button type="button" onClick={submit} className="px-4 py-2.5 rounded-xl bg-gradient-accent text-white text-sm font-bold">
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}

function DayEditorModal({
  open,
  date,
  onClose,
  onPrev,
  onNext,
  habits,
  getLog,
  setStatus,
  setNumericValue,
  setNote,
}: {
  open: boolean;
  date: string;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  habits: Habit[];
  getLog: (habitId: string, date: string) => HabitLog | undefined;
  setStatus: (habit: Habit, date: string, status: HabitLogStatus) => Promise<void>;
  setNumericValue: (habit: Habit, date: string, value: number) => Promise<void>;
  setNote: (habitId: string, date: string, note: string) => Promise<void>;
}) {
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);
  if (!open) return null;

  const scheduled = habits.filter((habit) => isHabitScheduledOnDate(habit, date));

  return (
    <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="max-w-2xl mx-auto bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button type="button" onClick={onPrev} className="size-8 rounded-lg border border-slate-200 dark:border-slate-700">←</button>
            <h2 className="text-xl font-bold">Edit: {formatDateLabel(date)}</h2>
            <button type="button" onClick={onNext} className="size-8 rounded-lg border border-slate-200 dark:border-slate-700">→</button>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {scheduled.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No habits scheduled for this day.</p>
        ) : (
          <div className="space-y-3">
            {scheduled.map((habit) => {
              const log = getLog(habit.id, date);
              const value = log?.value ?? 0;
              return (
                <div key={habit.id} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="material-symbols-outlined text-base" style={{ color: habit.color ?? "#a855f7" }}>
                        {habit.icon ?? "check_circle"}
                      </span>
                      <p className="font-semibold truncate">{habit.name}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setStatus(habit, date, log?.status === "DONE" ? "NONE" : "DONE")}
                        className={`size-7 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-200 ${
                          log?.status === "DONE"
                            ? "border-transparent text-white shadow-md"
                            : "border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500"
                        }`}
                        style={log?.status === "DONE" ? { background: habit.color ?? "#22c55e" } : undefined}
                        title={log?.status === "DONE" ? "Uncheck to clear" : "Mark done"}
                      >
                        {log?.status === "DONE" ? (
                          <span className="material-symbols-outlined text-base font-bold">check</span>
                        ) : null}
                      </button>
                      {habit.allowPartial && (
                        <button
                          type="button"
                          onClick={() => setStatus(habit, date, "PARTIAL")}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${log?.status === "PARTIAL" ? "bg-amber-100 dark:bg-amber-900/40 border-amber-400 text-amber-700 dark:text-amber-300" : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"}`}
                        >
                          Partial
                        </button>
                      )}
                      {habit.allowSkip && (
                        <button
                          type="button"
                          onClick={() => setStatus(habit, date, "SKIP")}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${log?.status === "SKIP" ? "bg-slate-200 dark:bg-slate-700 border-slate-400 text-slate-700 dark:text-slate-200" : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"}`}
                        >
                          Skip
                        </button>
                      )}
                    </div>
                  </div>

                  {habit.type !== "CHECK" && (
                    <div className="flex items-center gap-2">
                      <button type="button" className="size-7 rounded-lg border border-slate-200 dark:border-slate-700" onClick={() => setNumericValue(habit, date, value - 1)}>
                        -
                      </button>
                      <input
                        type="number"
                        min={0}
                        value={value}
                        onChange={(e) => setNumericValue(habit, date, Number(e.target.value) || 0)}
                        className="w-18 text-center rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent px-2 py-1.5 text-sm"
                      />
                      <button type="button" className="size-7 rounded-lg border border-slate-200 dark:border-slate-700" onClick={() => setNumericValue(habit, date, value + 1)}>
                        +
                      </button>
                    </div>
                  )}

                  <div>
                    <button
                      type="button"
                      onClick={() => setExpandedNoteId((id) => (id === habit.id ? null : habit.id))}
                      className="text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-primary"
                    >
                      {expandedNoteId === habit.id ? "Hide note" : "Add note"}
                    </button>
                    {expandedNoteId === habit.id && (
                      <textarea
                        value={log?.note ?? ""}
                        onChange={(e) => setNote(habit.id, date, e.target.value)}
                        rows={2}
                        className="mt-2 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm"
                        placeholder="Optional note..."
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
