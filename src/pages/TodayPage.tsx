import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { useTimer, formatTime, formatMinutes } from "../hooks/useTimer";
import QuickEntryModal from "../components/QuickEntryModal";

const ROLES = ["Stabilizer", "Builder", "Caregiver"];

const ROLE_CONFIG: Record<
  string,
  {
    heading: string;
    subtitle: string;
    icon: string;
    kindWeights: Record<string, number>;
  }
> = {
  Stabilizer: {
    heading: "What needs stabilizing today?",
    subtitle: "Focus on the foundations. Legal and financial tasks come first.",
    icon: "shield",
    kindWeights: { LEGAL: 4, MONEY: 3, MAINTENANCE: 2, EMOTIONAL: 1 },
  },
  Builder: {
    heading: "What are you building today?",
    subtitle: "Focus on momentum. Maintenance and money tasks drive progress.",
    icon: "construction",
    kindWeights: { MAINTENANCE: 4, MONEY: 3, LEGAL: 2, EMOTIONAL: 1 },
  },
  Caregiver: {
    heading: "Who are you caring for today?",
    subtitle: "Focus on people. Emotional and maintenance tasks matter most.",
    icon: "favorite",
    kindWeights: { EMOTIONAL: 4, MAINTENANCE: 3, LEGAL: 2, MONEY: 1 },
  },
};

export default function TodayPage() {
  const settings = useLiveQuery(() => db.appSettings.get("default"));
  const categories = useLiveQuery(() => db.categories.toArray()) ?? [];
  const allTasks = useLiveQuery(() => db.tasks.toArray()) ?? [];
  const [showModal, setShowModal] = useState(false);
  const timer = useTimer();

  const role = settings?.role ?? "Stabilizer";
  const availMins = settings?.availableMinutes ?? 120;
  const roleConfig = ROLE_CONFIG[role] ?? ROLE_CONFIG.Stabilizer;

  const todayTasks = useMemo(() => {
    const kindWeights = roleConfig.kindWeights;
    const catMap = new Map(categories.map((c) => [c.id, c]));
    const MAX_TASKS = 5;

    const available = allTasks.filter((t) => t.status !== "DONE");

    const inProgress = available.filter((t) => t.status === "IN_PROGRESS");

    const rest = available.filter((t) => t.status !== "IN_PROGRESS");

    const kindRank = Object.entries(kindWeights)
      .sort((a, b) => b[1] - a[1])
      .map(([kind]) => kind);

    const buckets = new Map<string, typeof rest>();
    for (const kind of kindRank) {
      buckets.set(kind, []);
    }
    for (const task of rest) {
      const cat = catMap.get(task.categoryId);
      const kind = cat?.kind ?? "";
      if (!buckets.has(kind)) buckets.set(kind, []);
      buckets.get(kind)!.push(task);
    }

    const sortBucket = (tasks: typeof rest) =>
      tasks.sort((a, b) => {
        if (a.status === "TODAY" && b.status !== "TODAY") return -1;
        if (b.status === "TODAY" && a.status !== "TODAY") return 1;

        const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        if (aDue !== bDue) return aDue - bDue;

        if (a.priority !== b.priority) return a.priority - b.priority;

        const aMoney = Math.abs(a.moneyImpact ?? 0);
        const bMoney = Math.abs(b.moneyImpact ?? 0);
        return bMoney - aMoney;
      });

    for (const [, tasks] of buckets) {
      sortBucket(tasks);
    }

    const suggested: typeof rest = [...inProgress];

    for (const kind of kindRank) {
      if (suggested.length >= MAX_TASKS) break;
      const bucket = buckets.get(kind) ?? [];
      for (const task of bucket) {
        if (suggested.length >= MAX_TASKS) break;
        if (!suggested.some((t) => t.id === task.id)) {
          suggested.push(task);
        }
      }
    }

    return suggested;
  }, [allTasks, categories, roleConfig]);

  const allocatedMins = todayTasks.reduce(
    (s, t) => s + (t.estimateMinutes ?? 0),
    0
  );
  const pct = Math.min((allocatedMins / Math.max(availMins, 1)) * 100, 100);

  const catMap = new Map(categories.map((c) => [c.id, c]));

  return (
    <div className="flex flex-1 justify-center py-8 px-4 md:px-0 pb-24 md:pb-8">
      <div className="flex flex-col max-w-[800px] flex-1 gap-8">
        {/* Role Selector */}
        <section className="flex flex-col gap-5 text-center">
          <div className="flex items-center justify-center gap-2 text-primary">
            <span className="material-symbols-outlined text-3xl">
              {roleConfig.icon}
            </span>
          </div>
          <h1 className="tracking-tight text-3xl font-bold leading-tight">
            {roleConfig.heading}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm max-w-md mx-auto">
            {roleConfig.subtitle}
          </p>
          <div className="flex p-1.5 rounded-xl bg-slate-200 dark:bg-card-dark border border-slate-300 dark:border-border-dark self-center w-full max-w-md">
            {ROLES.map((r) => (
              <label
                key={r}
                className={`flex cursor-pointer h-12 flex-1 items-center justify-center overflow-hidden rounded-lg px-4 transition-all text-sm font-semibold ${
                  role === r
                    ? "bg-gradient-accent text-white shadow-lg shadow-primary/20"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                <span className="truncate">{r}</span>
                <input
                  className="hidden"
                  name="role"
                  type="radio"
                  value={r}
                  checked={role === r}
                  onChange={() =>
                    db.appSettings.update("default", { role: r })
                  }
                />
              </label>
            ))}
          </div>
        </section>

        {/* Capacity */}
        <section className="flex flex-col items-center gap-4 bg-primary/5 p-6 rounded-2xl border border-primary/10">
          <div className="flex flex-col items-center gap-2">
            <h3 className="text-slate-700 dark:text-slate-400 text-sm font-semibold uppercase tracking-wider">
              Available Capacity
            </h3>
            <div className="flex items-center gap-3">
              <input
                className="bg-transparent border-none text-5xl font-bold text-gradient focus:ring-0 p-0 w-32 text-center focus:outline-none"
                type="number"
                value={availMins}
                onChange={(e) =>
                  db.appSettings.update("default", {
                    availableMinutes: Number(e.target.value) || 0,
                  })
                }
                min={0}
              />
              <span className="text-2xl font-medium text-slate-400">
                minutes
              </span>
            </div>
          </div>
          <div className="w-full bg-slate-200 dark:bg-[#2a343f] h-2 rounded-full overflow-hidden">
            <div
              className="bg-gradient-accent h-full rounded-full transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs text-slate-500 italic">
            {allocatedMins} minutes allocated to your stack
            {availMins - allocatedMins > 0 &&
              ` — ${availMins - allocatedMins} minutes of breathing room`}
          </p>
        </section>

        {/* Today Stack */}
        <section className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold leading-tight flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">
                layers
              </span>
              Today Stack
            </h3>
            <button
              onClick={() => setShowModal(true)}
              className="text-primary text-sm font-bold flex items-center gap-1 hover:underline"
            >
              <span className="material-symbols-outlined text-sm">
                add_circle
              </span>
              Add Task
            </button>
          </div>

          {todayTasks.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <span className="material-symbols-outlined text-4xl mb-2 block">
                inbox
              </span>
              <p className="font-medium">Your stack is empty.</p>
              <p className="text-sm mt-1">
                Add tasks or move items to Today from Categories.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-4">
            {todayTasks.map((task) => {
              const cat = catMap.get(task.categoryId);
              const isActive = timer.activeTaskId === task.id;
              const isRunning = isActive && timer.isRunning;

              return (
                <div
                  key={task.id}
                  className={`p-6 rounded-2xl transition-all ${
                    isActive
                      ? "bg-white dark:bg-[#181f26] border-2 border-primary/40 shadow-[0_0_20px_rgba(168,85,247,0.15)] ring-4 ring-primary/5"
                      : "bg-white/60 dark:bg-[#181f26]/50 border border-slate-200 dark:border-[#2a343f] opacity-80 hover:opacity-100"
                  }`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <span
                      className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-widest ${
                        isActive
                          ? "bg-primary/10 text-primary border border-primary/20"
                          : "bg-slate-200 dark:bg-[#2a343f] text-slate-500 dark:text-slate-400"
                      }`}
                    >
                      {cat?.name ?? "—"}
                    </span>
                    {isActive ? (
                      <span className="text-gradient font-mono font-bold text-lg">
                        {formatTime(timer.elapsed)}
                        {task.estimateMinutes
                          ? ` / ${formatTime(task.estimateMinutes * 60)}`
                          : ""}
                      </span>
                    ) : (
                      <span className="text-slate-400 font-mono text-sm">
                        {task.estimateMinutes
                          ? formatMinutes(task.estimateMinutes)
                          : "—"}
                      </span>
                    )}
                  </div>

                  <Link to={`/tasks/${task.id}`}>
                    <h4
                      className={`${
                        isActive ? "text-xl font-bold" : "text-lg font-semibold"
                      } mb-1 hover:text-primary transition-colors`}
                    >
                      {task.title}
                    </h4>
                  </Link>

                  {task.contextCard.reframe && (
                    <p className="text-slate-500 dark:text-slate-400 text-sm italic mb-4">
                      "{task.contextCard.reframe}"
                    </p>
                  )}

                  {task.subtasks.length > 0 && (
                    <div className="mb-4 flex items-center gap-2 text-xs text-slate-400">
                      <span className="material-symbols-outlined text-sm">
                        checklist
                      </span>
                      {task.subtasks.filter((s) => s.done).length}/
                      {task.subtasks.length} subtasks
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    {isRunning ? (
                      <>
                        <button
                          onClick={() => timer.pauseTimer()}
                          className="flex-1 bg-gradient-accent hover:opacity-90 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-primary/20"
                        >
                          <span className="material-symbols-outlined">
                            pause
                          </span>
                          Pause
                        </button>
                        <button
                          onClick={() => timer.stopTimer()}
                          className="size-12 flex items-center justify-center border-2 border-slate-200 dark:border-[#2a343f] rounded-xl text-slate-400 hover:text-red-500 hover:border-red-500/50 transition-all"
                        >
                          <span className="material-symbols-outlined">
                            stop
                          </span>
                        </button>
                      </>
                    ) : isActive && timer.isPaused ? (
                      <>
                        <button
                          onClick={() => timer.startTimer(task.id)}
                          className="flex-1 bg-gradient-accent hover:opacity-90 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-primary/20"
                        >
                          <span className="material-symbols-outlined">
                            play_arrow
                          </span>
                          Resume
                        </button>
                        <button
                          onClick={() => timer.stopTimer()}
                          className="size-12 flex items-center justify-center border-2 border-slate-200 dark:border-[#2a343f] rounded-xl text-slate-400 hover:text-red-500 hover:border-red-500/50 transition-all"
                        >
                          <span className="material-symbols-outlined">
                            stop
                          </span>
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => timer.startTimer(task.id)}
                        className="flex-1 border-2 border-primary text-primary hover:bg-gradient-accent hover:text-white hover:border-transparent font-bold py-2 rounded-xl flex items-center justify-center gap-2 transition-all"
                      >
                        <span className="material-symbols-outlined">
                          play_arrow
                        </span>
                        Start
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <footer className="mt-8 flex flex-col items-center gap-4 py-8 border-t border-slate-200 dark:border-[#2a343f]">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/5 text-primary rounded-full text-sm font-medium border border-primary/10">
            <span className="material-symbols-outlined text-sm">spa</span>
            Stay focused. One task at a time.
          </div>
        </footer>
      </div>

      <QuickEntryModal open={showModal} onClose={() => setShowModal(false)} />
    </div>
  );
}
