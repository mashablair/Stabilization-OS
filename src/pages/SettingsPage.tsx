import { useEffect, useState } from "react";
import { useAppSettings } from "../hooks/useData";
import { updateAppSettings, resetAllData, type Category, type Task, type TimeEntry, type WeeklyReview, type DailyCapacity, type AppSettings } from "../db";
import { supabase } from "../lib/supabase";
import { rowToCategory, rowToTask, rowToTimeEntry, rowToWeeklyReview, rowToDailyCapacity, rowToWin, rowToHabit, rowToHabitLog, rowToAppSettings } from "../hooks/useData";
import type { Habit, HabitLog } from "../habits";
import type { Win } from "../db";

interface ShareBundle {
  meta: { version: string; exportedAt: string; timezone: string };
  categories: Category[];
  tasks: Task[];
  timeEntries: TimeEntry[];
  weeklyReviews?: WeeklyReview[];
  dailyCapacity?: DailyCapacity[];
  wins?: Win[];
  habits?: Habit[];
  habitLogs?: HabitLog[];
  appSettings?: AppSettings;
}

export default function SettingsPage() {
  const { data: settings } = useAppSettings();
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState("");
  const [stabilizerDraft, setStabilizerDraft] = useState("");
  const [builderDraft, setBuilderDraft] = useState("");
  const [dirtyFields, setDirtyFields] = useState<Set<"availableMinutes" | "builderAvailableMinutes">>(new Set());

  const stabilizerDefault = settings?.availableMinutes ?? 120;
  const builderDefault = settings?.builderAvailableMinutes ?? 120;

  const updateSetting = async (field: "availableMinutes" | "builderAvailableMinutes", value: number) => {
    const v = Math.max(0, value);
    setDirtyFields((prev) => {
      const next = new Set(prev);
      next.delete(field);
      return next;
    });
    await updateAppSettings({ [field]: v });
  };

  useEffect(() => {
    if (!dirtyFields.has("availableMinutes")) {
      setStabilizerDraft(String(stabilizerDefault));
    }
  }, [stabilizerDefault, dirtyFields]);

  useEffect(() => {
    if (!dirtyFields.has("builderAvailableMinutes")) {
      setBuilderDraft(String(builderDefault));
    }
  }, [builderDefault, dirtyFields]);

  const commitSetting = async (field: "availableMinutes" | "builderAvailableMinutes") => {
    const raw = field === "availableMinutes" ? stabilizerDraft : builderDraft;
    const parsed = Number(raw);
    await updateSetting(field, Number.isFinite(parsed) ? parsed : 0);
  };

  const exportBundle = async () => {
    const [catRes, taskRes, teRes, wrRes, dcRes, winsRes, habRes, hlRes, asRes] = await Promise.all([
      supabase.from("categories").select("*"),
      supabase.from("tasks").select("*"),
      supabase.from("time_entries").select("*"),
      supabase.from("weekly_reviews").select("*"),
      supabase.from("daily_capacity").select("*"),
      supabase.from("wins").select("*"),
      supabase.from("habits").select("*"),
      supabase.from("habit_logs").select("*"),
      supabase.from("app_settings").select("*").eq("id", "default").maybeSingle(),
    ]);

    const bundle: ShareBundle = {
      meta: { version: "1.1.0", exportedAt: new Date().toISOString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      categories: (catRes.data ?? []).map(rowToCategory),
      tasks: (taskRes.data ?? []).map(rowToTask),
      timeEntries: (teRes.data ?? []).map(rowToTimeEntry),
      weeklyReviews: (wrRes.data ?? []).map(rowToWeeklyReview),
      dailyCapacity: (dcRes.data ?? []).map(rowToDailyCapacity),
      wins: (winsRes.data ?? []).map(rowToWin),
      habits: (habRes.data ?? []).map(rowToHabit),
      habitLogs: (hlRes.data ?? []).map(rowToHabitLog),
      appSettings: asRes.data ? rowToAppSettings(asRes.data) : undefined,
    };

    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `balance-os-bundle-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importBundle = async (file: File) => {
    setImporting(true);
    setImportStatus("Reading file...");
    try {
      const text = await file.text();
      const bundle: ShareBundle = JSON.parse(text);
      if (!bundle.meta?.version || !bundle.categories || !bundle.tasks) throw new Error("Invalid bundle format");

      setImportStatus("Importing data...");
      await resetAllData();

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const uid = user.id;

      for (const cat of bundle.categories) {
        await supabase.from("categories").insert({ id: cat.id, user_id: uid, name: cat.name, kind: cat.kind, domain: cat.domain, context_card: cat.contextCard });
      }
      for (const task of bundle.tasks) {
        await supabase.from("tasks").insert({ id: task.id, user_id: uid, category_id: task.categoryId, domain: task.domain, title: task.title, notes: task.notes, status: task.status, priority: task.priority, due_date: task.dueDate, soft_deadline: task.softDeadline, blocked_by_task_ids: task.blockedByTaskIds, estimate_minutes: task.estimateMinutes, actual_seconds_total: task.actualSecondsTotal, money_impact: task.moneyImpact, friction_note: task.frictionNote, next_action_at: task.nextActionAt, pending_reason: task.pendingReason, context_card: task.contextCard, subtasks: task.subtasks, time_tracking_mode: task.timeTrackingMode ?? "TASK", created_at: task.createdAt, updated_at: task.updatedAt, completed_at: task.completedAt });
      }
      for (const te of bundle.timeEntries) {
        await supabase.from("time_entries").insert({ id: te.id, user_id: uid, task_id: te.taskId, subtask_id: te.subtaskId, start_at: te.startAt, end_at: te.endAt, seconds: te.seconds, pause_reason: te.pauseReason });
      }
      if (bundle.weeklyReviews) for (const wr of bundle.weeklyReviews) {
        await supabase.from("weekly_reviews").insert({ id: wr.id, user_id: uid, week_start: wr.weekStart, answers: wr.answers, created_at: wr.createdAt });
      }
      if (bundle.dailyCapacity) for (const dc of bundle.dailyCapacity) {
        await supabase.from("daily_capacity").insert({ id: dc.id, user_id: uid, date: dc.date, domain: dc.domain, minutes: dc.minutes });
      }
      if (bundle.wins) for (const w of bundle.wins) {
        await supabase.from("wins").insert({ id: w.id, user_id: uid, text: w.text, date: w.date, tags: w.tags, created_at: w.createdAt });
      }
      if (bundle.habits) for (const h of bundle.habits) {
        await supabase.from("habits").insert({ id: h.id, user_id: uid, name: h.name, type: h.type, schedule_type: h.scheduleType, weekdays: h.weekdays, every_n_days: h.everyNDays, times_per_week: h.timesPerWeek, goal_target: h.goalTarget, unit: h.unit, start_date: h.startDate, time_of_day: h.timeOfDay, show_in_today: h.showInToday, allow_partial: h.allowPartial, allow_skip: h.allowSkip, color: h.color, icon: h.icon, archived_at: h.archivedAt ?? null, sort_order: h.sortOrder, created_at: h.createdAt, updated_at: h.updatedAt });
      }
      if (bundle.habitLogs) for (const hl of bundle.habitLogs) {
        await supabase.from("habit_logs").insert({ id: hl.id, user_id: uid, habit_id: hl.habitId, date: hl.date, status: hl.status, value: hl.value, note: hl.note, created_at: hl.createdAt, updated_at: hl.updatedAt });
      }
      if (bundle.appSettings) {
        await supabase.from("app_settings").upsert({ id: "default", user_id: uid, role: bundle.appSettings.role, available_minutes: bundle.appSettings.availableMinutes, builder_available_minutes: bundle.appSettings.builderAvailableMinutes, dark_mode: bundle.appSettings.darkMode, hidden_category_ids: bundle.appSettings.hiddenCategoryIds });
      }

      setImportStatus(`Imported ${bundle.categories.length} categories, ${bundle.tasks.length} tasks, ${bundle.timeEntries.length} time entries, ${bundle.wins?.length ?? 0} wins, ${bundle.habits?.length ?? 0} habits, and ${bundle.habitLogs?.length ?? 0} habit logs.`);
      window.location.reload();
    } catch (err) {
      setImportStatus(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setImporting(false);
    }
  };

  const exportCSV = async (type: "tasks" | "time_entries") => {
    if (type === "tasks") {
      const { data: tasksData } = await supabase.from("tasks").select("*");
      const { data: categoriesData } = await supabase.from("categories").select("id, name");
      const tasks = tasksData ?? [];
      const categories = categoriesData ?? [];
      const catMap = new Map(categories.map((c: { id: string; name: string }) => [c.id, c.name]));
      const header = "id,title,category,status,priority,estimateMinutes,actualMinutes,moneyImpact,dueDate,createdAt\n";
      const rows = tasks.map((t: Record<string, unknown>) =>
        `"${t.id}","${(t.title as string).replace(/"/g, '""')}","${catMap.get(t.category_id as string) ?? ""}","${t.status}",${t.priority},${t.estimate_minutes ?? ""},${Math.round((t.actual_seconds_total as number) / 60)},${t.money_impact ?? ""},"${t.due_date ?? ""}","${t.created_at}"`
      ).join("\n");
      downloadText(header + rows, "tasks_summary.csv", "text/csv");
    } else {
      const { data: entriesData } = await supabase.from("time_entries").select("*");
      const entries = entriesData ?? [];
      const header = "id,taskId,startAt,endAt,seconds,pauseReason\n";
      const rows = entries.map((e: Record<string, unknown>) =>
        `"${e.id}","${e.task_id}","${e.start_at}","${e.end_at ?? ""}",${e.seconds},"${e.pause_reason ?? ""}"`
      ).join("\n");
      downloadText(header + rows, "time_entries.csv", "text/csv");
    }
  };

  const handleResetData = async () => {
    if (!confirm("This will permanently delete all your data. Are you sure?")) return;
    if (!confirm("This cannot be undone. Export first if needed. Continue?")) return;
    await resetAllData();
    window.location.reload();
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 pb-24 md:pb-10">
      <h1 className="text-3xl font-bold tracking-tight mb-2">Settings</h1>
      <p className="text-slate-500 dark:text-slate-400 mb-10">Manage your data, exports, and preferences.</p>

      <div className="space-y-8">
        <section className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
          <h3 className="font-bold text-lg mb-1">Default Daily Capacity</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">How many minutes per day you typically have available. You can override this on any given day from the Today page.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Life</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={stabilizerDraft}
                  onChange={(e) => {
                    setStabilizerDraft(e.target.value);
                    setDirtyFields((prev) => new Set(prev).add("availableMinutes"));
                  }}
                  onBlur={() => commitSetting("availableMinutes")}
                  min={0}
                  className="w-24 bg-slate-100 dark:bg-background-dark border-none rounded-xl px-4 py-3 text-lg font-bold focus:ring-2 focus:ring-primary transition-all text-center"
                />
                <span className="text-sm font-medium text-slate-400">minutes / day</span>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Builder (Business)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={builderDraft}
                  onChange={(e) => {
                    setBuilderDraft(e.target.value);
                    setDirtyFields((prev) => new Set(prev).add("builderAvailableMinutes"));
                  }}
                  onBlur={() => commitSetting("builderAvailableMinutes")}
                  min={0}
                  className="w-24 bg-slate-100 dark:bg-background-dark border-none rounded-xl px-4 py-3 text-lg font-bold focus:ring-2 focus:ring-primary transition-all text-center"
                />
                <span className="text-sm font-medium text-slate-400">minutes / day</span>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
          <h3 className="font-bold text-lg mb-2">Export Share Bundle</h3>
          <p className="text-sm text-slate-500 mb-4">Download all your data as a JSON file.</p>
          <button onClick={exportBundle} className="bg-gradient-accent text-white font-bold px-6 py-3 rounded-xl shadow-lg shadow-primary/20 hover:opacity-90 transition-all flex items-center gap-2">
            <span className="material-symbols-outlined">download</span>Export .json Bundle
          </button>
        </section>

        <section className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
          <h3 className="font-bold text-lg mb-2">Import Share Bundle</h3>
          <p className="text-sm text-slate-500 mb-4">Import a previously exported bundle. This will <strong>overwrite</strong> all data.</p>
          <label className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 cursor-pointer hover:border-primary transition-colors font-bold text-slate-600 dark:text-slate-300">
            <span className="material-symbols-outlined">upload_file</span>Choose .json file
            <input type="file" accept=".json" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) importBundle(file); }} disabled={importing} />
          </label>
          {importStatus && <p className="mt-3 text-sm text-slate-500">{importStatus}</p>}
        </section>

        <section className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
          <h3 className="font-bold text-lg mb-2">Export CSV</h3>
          <p className="text-sm text-slate-500 mb-4">Download data as spreadsheet-friendly CSV files.</p>
          <div className="flex gap-3">
            <button onClick={() => exportCSV("tasks")} className="px-5 py-3 rounded-xl border border-slate-200 dark:border-slate-700 font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-all flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">table_chart</span>tasks_summary.csv
            </button>
            <button onClick={() => exportCSV("time_entries")} className="px-5 py-3 rounded-xl border border-slate-200 dark:border-slate-700 font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-all flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">schedule</span>time_entries.csv
            </button>
          </div>
        </section>

        <section className="bg-white dark:bg-slate-900 rounded-xl border-2 border-red-200 dark:border-red-900/30 p-6">
          <h3 className="font-bold text-lg mb-2 text-red-600">Danger Zone</h3>
          <p className="text-sm text-slate-500 mb-4">Permanently delete all data. This cannot be undone.</p>
          <button onClick={handleResetData} className="px-6 py-3 rounded-xl bg-red-500 text-white font-bold hover:bg-red-600 transition-colors flex items-center gap-2">
            <span className="material-symbols-outlined">delete_forever</span>Reset All Data
          </button>
        </section>
      </div>
    </div>
  );
}

function downloadText(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
