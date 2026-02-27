import { useState, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  db,
  generateId,
  nowISO,
  todayDateStr,
  getCategoriesByDomain,
  type Task,
  type TaskDomain,
} from "../db";

interface Props {
  open: boolean;
  onClose: () => void;
  defaultDomain?: TaskDomain;
  defaultDate?: string; // YYYY-MM-DD
}

const MAX_DURATION_MINUTES = 8 * 60; // 8 hours, matches useTimer max

export default function LogTaskModal({
  open,
  onClose,
  defaultDomain = "LIFE_ADMIN",
  defaultDate,
}: Props) {
  const allCategories = useLiveQuery(() => db.categories.toArray()) ?? [];
  const [domain, setDomain] = useState<TaskDomain>(defaultDomain);
  const categories = getCategoriesByDomain(allCategories, domain);
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [duration, setDuration] = useState(10);
  const [date, setDate] = useState(defaultDate ?? todayDateStr());

  useEffect(() => {
    if (open) {
      setDomain(defaultDomain);
      setCategoryId("");
      setDate(defaultDate ?? todayDateStr());
    }
  }, [open, defaultDomain, defaultDate]);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!title.trim()) return;
    const catId = categoryId || categories[0]?.id;
    if (!catId) return;
    if (duration <= 0) return;

    const durationMins = Math.min(Math.max(1, Math.round(duration)), MAX_DURATION_MINUTES);
    const seconds = durationMins * 60;

    const startAt = `${date}T12:00:00.000Z`;
    const startMs = new Date(startAt).getTime();
    const endAt = new Date(startMs + seconds * 1000).toISOString();

    const now = nowISO();
    const taskId = generateId();
    const entryId = generateId();

    const task: Task = {
      id: taskId,
      categoryId: catId,
      domain,
      title: title.trim(),
      status: "DONE",
      priority: 2,
      estimateMinutes: durationMins,
      actualSecondsTotal: seconds,
      contextCard: { why: "", nextMicroStep: "", reframe: "" },
      createdAt: now,
      updatedAt: now,
      completedAt: endAt,
      subtasks: [],
    };

    await db.tasks.add(task);
    await db.timeEntries.add({
      id: entryId,
      taskId,
      startAt,
      endAt,
      seconds,
    });

    setTitle("");
    setDuration(10);
    onClose();
  };

  const canSubmit =
    title.trim().length > 0 &&
    (categoryId || categories[0]?.id) &&
    duration > 0 &&
    duration <= MAX_DURATION_MINUTES;

  return (
    <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-card-dark w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 dark:border-border-dark overflow-hidden">
        <div className="p-8 flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold tracking-tight">Log Task</h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          <p className="text-sm text-slate-500 dark:text-slate-400">
            Record a task you already completed. It will appear in Done Today and count toward your time.
          </p>

          <div className="space-y-5">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 ml-1">
                Task Name
              </label>
              <input
                className="w-full bg-slate-100 dark:bg-background-dark border-none rounded-xl px-4 py-4 text-lg focus:ring-2 focus:ring-primary transition-all placeholder:text-slate-400"
                placeholder="e.g. review documents"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                autoFocus
              />
            </div>

            {/* Domain */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 ml-1">
                Domain
              </label>
              <div className="flex gap-2">
                {(["LIFE_ADMIN", "BUSINESS"] as const).map((d) => {
                  const catsForDomain = getCategoriesByDomain(allCategories, d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => {
                        setDomain(d);
                        setCategoryId(catsForDomain[0]?.id ?? "");
                      }}
                      className={`flex-1 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                        domain === d
                          ? "bg-primary/10 text-primary border-primary"
                          : "border-slate-200 dark:border-border-dark text-slate-500 hover:border-slate-400"
                      }`}
                    >
                      {d === "LIFE_ADMIN" ? "Life" : "Builder"}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Category */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 ml-1">
                Category
              </label>
              {categories.length === 0 ? (
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  Add a category first in Settings.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategoryId(cat.id)}
                      className={`px-4 py-2 rounded-full border text-sm font-medium transition-all ${
                        categoryId === cat.id ||
                        (!categoryId && cat.id === categories[0]?.id)
                          ? "bg-primary/10 text-primary border-primary"
                          : "border-slate-200 dark:border-border-dark text-slate-500 hover:border-slate-400"
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 ml-1">
                  Duration
                </label>
                <div className="relative flex items-center">
                  <input
                    className="w-full bg-slate-100 dark:bg-background-dark border-none rounded-xl px-4 py-4 text-lg focus:ring-2 focus:ring-primary transition-all"
                    type="number"
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    min={1}
                    max={MAX_DURATION_MINUTES}
                  />
                  <span className="absolute right-4 text-slate-400 font-medium">
                    min
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 ml-1">
                  Date
                </label>
                <input
                  className="w-full bg-slate-100 dark:bg-background-dark border-none rounded-xl px-4 py-4 text-lg focus:ring-2 focus:ring-primary transition-all"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!canSubmit || categories.length === 0}
            className="w-full bg-gradient-accent text-white font-bold py-4 rounded-2xl text-lg shadow-lg shadow-primary/25 hover:opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined">history_edu</span>
            Log Task
          </button>
        </div>
      </div>
    </div>
  );
}
