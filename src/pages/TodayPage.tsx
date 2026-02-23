import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db, buildStabilizerStackSplit, getWaitingTasks, isActionable, nowISO, unmarkTaskDone } from "../db";
import { useTimer, formatTime, formatMinutes } from "../hooks/useTimer";
import QuickEntryModal from "../components/QuickEntryModal";
import AllTasksDrawer from "../components/AllTasksDrawer";

type Tab = "Stabilizer" | "Builder";

function daysUntil(dateStr: string): number {
  return Math.ceil(
    (new Date(dateStr).getTime() - Date.now()) / 86_400_000
  );
}

function formatNextAction(dateStr: string): string {
  const days = daysUntil(dateStr);
  const formatted = new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  if (days <= 0) return `${formatted} (today)`;
  if (days === 1) return `${formatted} (tomorrow)`;
  return `${formatted} (in ${days} days)`;
}

export default function TodayPage() {
  const settings = useLiveQuery(() => db.appSettings.get("default"));
  const categories = useLiveQuery(() => db.categories.toArray()) ?? [];
  const allTasks = useLiveQuery(() => db.tasks.toArray()) ?? [];
  const [showModal, setShowModal] = useState(false);
  const [showAllTasksDrawer, setShowAllTasksDrawer] = useState(false);
  const [tab, setTab] = useState<Tab>("Stabilizer");
  const [waitingOpen, setWaitingOpen] = useState(false);
  const [doneOpen, setDoneOpen] = useState(true);
  const timer = useTimer();

  const availMins = settings?.availableMinutes ?? 120;

  const { pinned: stabilizerPinned, suggested: stabilizerSuggested } = useMemo(
    () => buildStabilizerStackSplit(allTasks, categories, availMins, 5),
    [allTasks, categories, availMins]
  );
  const stabilizerTasks = [...stabilizerPinned, ...stabilizerSuggested];

  const builderActionable = useMemo(
    () =>
      allTasks.filter(
        (t) => t.domain === "BUSINESS" && isActionable(t)
      ),
    [allTasks]
  );

  const waitingTasks = useMemo(
    () => getWaitingTasks(allTasks, tab === "Stabilizer" ? "LIFE_ADMIN" : "BUSINESS"),
    [allTasks, tab]
  );

  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);

  const doneToday = useMemo(() => {
    const domain = tab === "Stabilizer" ? "LIFE_ADMIN" : "BUSINESS";
    return allTasks
      .filter(
        (t) =>
          t.domain === domain &&
          (t.status === "DONE" || t.status === "ARCHIVED") &&
          t.completedAt &&
          new Date(t.completedAt).getTime() >= todayStart
      )
      .sort(
        (a, b) =>
          new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime()
      );
  }, [allTasks, tab, todayStart]);

  const todayTasks = tab === "Stabilizer" ? stabilizerTasks : builderActionable;

  const allocatedMins = todayTasks.reduce(
    (s, t) => s + (t.estimateMinutes ?? 0),
    0
  );
  const pct = Math.min((allocatedMins / Math.max(availMins, 1)) * 100, 100);
  const catMap = new Map(categories.map((c) => [c.id, c]));

  const makeActionable = async (taskId: string) => {
    await db.tasks.update(taskId, {
      status: "BACKLOG",
      nextActionAt: undefined,
      pendingReason: undefined,
      updatedAt: nowISO(),
    });
  };

  const pinToToday = async (taskId: string) => {
    await db.tasks.update(taskId, { status: "TODAY", updatedAt: nowISO() });
  };
  const removeFromToday = async (taskId: string) => {
    await db.tasks.update(taskId, { status: "BACKLOG", updatedAt: nowISO() });
  };

  const stackCount = tab === "Stabilizer" ? stabilizerTasks.length : builderActionable.length;
  const stackFull = tab === "Stabilizer" && stabilizerPinned.length >= 5;

  const renderTaskCard = (
    task: (typeof allTasks)[0],
    isPinned: boolean,
    showPinActions = true
  ) => {
    const cat = catMap.get(task.categoryId);
    const isActive = timer.activeTaskId === task.id;
    const isRunning = isActive && timer.isRunning;
    const canPin = !stackFull && !isPinned;

    return (
      <div
        key={task.id}
        className={`p-6 rounded-2xl transition-all ${
          isActive
            ? "bg-white dark:bg-card-dark border-2 border-primary/40 shadow-[0_0_20px_rgba(168,85,247,0.15)] ring-4 ring-primary/5"
            : "bg-white/60 dark:bg-card-dark/50 border border-slate-200 dark:border-border-dark opacity-80 hover:opacity-100"
        }`}
      >
        <div className="flex justify-between items-start mb-3">
          <span
            className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-widest ${
              isActive
                ? "bg-primary/10 text-primary border border-primary/20"
                : "bg-slate-200 dark:bg-border-dark text-slate-500 dark:text-slate-400"
            }`}
          >
            {cat?.name ?? "—"}
          </span>
          <div className="flex items-center gap-2">
            {showPinActions && isPinned && (
              <button
                onClick={() => removeFromToday(task.id)}
                className="text-xs text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 flex items-center gap-1"
                title="Remove from today"
              >
                <span className="material-symbols-outlined text-sm">push_pin</span>
              </button>
            )}
            {showPinActions && !isPinned && canPin && (
              <button
                onClick={() => pinToToday(task.id)}
                className="text-xs text-slate-400 hover:text-primary flex items-center gap-1"
                title="Pin to today"
              >
                <span className="material-symbols-outlined text-sm">add_circle</span>
              </button>
            )}
            {isActive ? (
              <span className="text-gradient font-mono font-bold text-lg">
                {formatTime(timer.elapsed)}
                {task.estimateMinutes ? ` / ${formatTime(task.estimateMinutes * 60)}` : ""}
              </span>
            ) : (
              <span className="text-slate-400 font-mono text-sm">
                {task.estimateMinutes ? formatMinutes(task.estimateMinutes) : "—"}
              </span>
            )}
          </div>
        </div>

        <Link to={`/tasks/${task.id}`}>
          <h4
            className={`${isActive ? "text-xl font-bold" : "text-lg font-semibold"} mb-1 hover:text-primary transition-colors`}
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
            <span className="material-symbols-outlined text-sm">checklist</span>
            {task.subtasks.filter((s) => s.done).length}/{task.subtasks.length} subtasks
          </div>
        )}

        <div className="flex items-center gap-3">
          {isRunning ? (
            <>
              <button
                onClick={() => timer.pauseTimer()}
                className="flex-1 bg-gradient-accent hover:opacity-90 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-primary/20"
              >
                <span className="material-symbols-outlined">pause</span>
                Pause
              </button>
              <button
                onClick={() => timer.stopTimer()}
                className="size-12 flex items-center justify-center border-2 border-slate-200 dark:border-border-dark rounded-xl text-slate-400 hover:text-red-500 hover:border-red-500/50 transition-all"
              >
                <span className="material-symbols-outlined">stop</span>
              </button>
            </>
          ) : isActive && timer.isPaused ? (
            <>
              <button
                onClick={() => timer.startTimer(task.id)}
                className="flex-1 bg-gradient-accent hover:opacity-90 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-primary/20"
              >
                <span className="material-symbols-outlined">play_arrow</span>
                Resume
              </button>
              <button
                onClick={() => timer.stopTimer()}
                className="size-12 flex items-center justify-center border-2 border-slate-200 dark:border-border-dark rounded-xl text-slate-400 hover:text-red-500 hover:border-red-500/50 transition-all"
              >
                <span className="material-symbols-outlined">stop</span>
              </button>
            </>
          ) : (
            <button
              onClick={() => timer.startTimer(task.id)}
              className="flex-1 border-2 border-primary text-primary hover:bg-gradient-accent hover:text-white hover:border-transparent font-bold py-2 rounded-xl flex items-center justify-center gap-2 transition-all"
            >
              <span className="material-symbols-outlined">play_arrow</span>
              Start
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-1 justify-center py-8 px-4 md:px-0 pb-24 md:pb-8">
      <div className="flex flex-col max-w-[800px] flex-1 gap-8">
        {/* Tab Selector */}
        <section className="flex flex-col gap-5 text-center">
          <div className="flex items-center justify-center gap-2 text-primary">
            <span className="material-symbols-outlined text-3xl">
              {tab === "Stabilizer" ? "shield" : "construction"}
            </span>
          </div>
          <h1 className="tracking-tight text-3xl font-bold leading-tight">
            {tab === "Stabilizer"
              ? "What needs stabilizing today?"
              : "What are you building today?"}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm max-w-md mx-auto">
            {tab === "Stabilizer"
              ? "Focus on the foundations. Legal and financial tasks come first."
              : "Business tasks live here. Ship when you're ready."}
          </p>
          <div className="flex p-1.5 rounded-xl bg-slate-200 dark:bg-card-dark border border-slate-300 dark:border-border-dark self-center w-full max-w-sm">
            {(["Stabilizer", "Builder"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { setTab(t); setWaitingOpen(false); }}
                className={`flex cursor-pointer h-12 flex-1 items-center justify-center overflow-hidden rounded-lg px-4 transition-all text-sm font-semibold ${
                  tab === t
                    ? "bg-gradient-accent text-white shadow-lg shadow-primary/20"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </section>

        {/* Capacity (Stabilizer only) */}
        {tab === "Stabilizer" && (
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
                <span className="text-2xl font-medium text-slate-400">minutes</span>
              </div>
            </div>
            <div className="w-full bg-slate-200 dark:bg-border-dark h-2 rounded-full overflow-hidden">
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
        )}

        {/* Today Stack */}
        <section className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold leading-tight flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">layers</span>
                {tab === "Stabilizer" ? "Today Stack" : "Builder Queue"}
                {tab === "Stabilizer" && (
                  <span className="text-slate-400 font-normal text-base">
                    ({stackCount}/5)
                  </span>
                )}
              </h3>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowAllTasksDrawer(true)}
                  className="text-slate-600 dark:text-slate-400 text-sm font-semibold flex items-center gap-1 hover:text-primary transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">list</span>
                  View all tasks
                </button>
                <button
                  onClick={() => setShowModal(true)}
                  className="text-primary text-sm font-bold flex items-center gap-1 hover:underline"
                >
                  <span className="material-symbols-outlined text-sm">add_circle</span>
                  Add Task
                </button>
              </div>
            </div>
            {tab === "Stabilizer" && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Up to 5 tasks. Pin tasks from All tasks to customize your stack.
              </p>
            )}
          </div>

          {/* Builder empty state */}
          {tab === "Builder" && builderActionable.length === 0 && (
            <div className="text-center py-16 px-6">
              <div className="inline-flex items-center justify-center size-16 rounded-2xl bg-slate-100 dark:bg-card-dark mb-5">
                <span className="material-symbols-outlined text-3xl text-slate-400">pause_circle</span>
              </div>
              <h3 className="text-xl font-bold mb-2">Builder is paused</h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm mx-auto leading-relaxed">
                This week is Stabilization week. Add business tasks when you're ready — they'll live here.
              </p>
              <button
                onClick={() => setShowModal(true)}
                className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-accent text-white font-bold text-sm shadow-lg shadow-primary/20 hover:opacity-90 transition-all"
              >
                <span className="material-symbols-outlined text-sm">add</span>
                Add Business Task
              </button>
            </div>
          )}

          {/* Stack full message (Stabilizer) */}
          {stackFull && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
              Stack full (5/5). Remove a task from today to add another, or use{" "}
              <button
                onClick={() => setShowAllTasksDrawer(true)}
                className="font-bold underline hover:no-underline"
              >
                View all tasks
              </button>{" "}
              to swap.
            </div>
          )}

          {/* Stabilizer empty state */}
          {tab === "Stabilizer" && stabilizerTasks.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <span className="material-symbols-outlined text-4xl mb-2 block">check_circle</span>
              <p className="font-medium">All clear.</p>
              <p className="text-sm mt-1">No life-admin tasks need attention right now.</p>
              <p className="text-sm mt-2">
                <button
                  onClick={() => setShowAllTasksDrawer(true)}
                  className="text-primary font-semibold hover:underline"
                >
                  View all tasks
                </button>{" "}
                to pin tasks for today.
              </p>
            </div>
          )}

          {/* Task cards */}
          <div className="flex flex-col gap-6">
            {tab === "Stabilizer" && stabilizerPinned.length > 0 && (
              <div className="flex flex-col gap-3">
                <h4 className="text-xs font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400 flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">push_pin</span>
                  Pinned
                </h4>
                <div className="flex flex-col gap-4">
                  {stabilizerPinned.map((task) => renderTaskCard(task, true))}
                </div>
              </div>
            )}
            {tab === "Stabilizer" && stabilizerSuggested.length > 0 && (
              <div className="flex flex-col gap-3">
                <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">auto_awesome</span>
                  Suggested
                </h4>
                <div className="flex flex-col gap-4">
                  {stabilizerSuggested.map((task) => renderTaskCard(task, false))}
                </div>
              </div>
            )}
            {tab === "Builder" && (
              <div className="flex flex-col gap-4">
                {builderActionable.map((task) =>
                  renderTaskCard(task, task.status === "TODAY", false)
                )}
              </div>
            )}
          </div>
        </section>

        {/* Done Today Section */}
        {doneToday.length > 0 && (
          <section className="flex flex-col">
            <button
              type="button"
              onClick={() => setDoneOpen(!doneOpen)}
              className="flex items-center gap-3 py-3 text-left group"
            >
              <span className={`material-symbols-outlined text-slate-400 transition-transform ${doneOpen ? "rotate-90" : ""}`}>
                chevron_right
              </span>
              <h3 className="text-lg font-bold text-green-600 dark:text-green-400 group-hover:text-green-500 transition-colors flex items-center gap-2">
                <span className="material-symbols-outlined text-xl">task_alt</span>
                Done Today
              </h3>
              <span className="px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-bold">
                {doneToday.length}
              </span>
            </button>

            {doneOpen && (
              <div className="flex flex-col gap-3 mt-2">
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 rounded-xl border border-green-200 dark:border-green-800/40 p-4 flex items-center gap-3">
                  <span className="material-symbols-outlined text-2xl text-green-500">celebration</span>
                  <p className="text-sm font-medium text-green-700 dark:text-green-300">
                    {doneToday.length === 1
                      ? "You knocked one out! Every task closed is a loop that stops draining your energy."
                      : doneToday.length < 4
                        ? `${doneToday.length} tasks done — you're building real momentum. Keep going!`
                        : `${doneToday.length} tasks done today — incredible! You're proving to yourself what's possible.`}
                  </p>
                </div>

                {doneToday.map((task) => {
                  const cat = catMap.get(task.categoryId);
                  return (
                    <div
                      key={task.id}
                      className="bg-white/40 dark:bg-card-dark/30 border border-green-200/50 dark:border-green-800/20 rounded-xl p-4 flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <button
                          onClick={() => unmarkTaskDone(task.id)}
                          className="size-6 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center shrink-0 hover:opacity-80 transition-opacity"
                          title="Undo"
                        >
                          <span className="material-symbols-outlined text-white text-sm">check</span>
                        </button>
                        <Link to={`/tasks/${task.id}`} className="flex-1 min-w-0 hover:text-primary transition-colors">
                          <h4 className="font-semibold truncate text-slate-400 line-through text-sm">{task.title}</h4>
                          <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
                            {cat && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-100 dark:bg-border-dark">
                                {cat.name}
                              </span>
                            )}
                            {task.actualSecondsTotal > 0 && (
                              <span>{formatMinutes(Math.round(task.actualSecondsTotal / 60))}</span>
                            )}
                          </div>
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Waiting Section */}
        {waitingTasks.length > 0 && (
          <section className="flex flex-col">
            <button
              type="button"
              onClick={() => setWaitingOpen(!waitingOpen)}
              className="flex items-center gap-3 py-3 text-left group"
            >
              <span className={`material-symbols-outlined text-slate-400 transition-transform ${waitingOpen ? "rotate-90" : ""}`}>
                chevron_right
              </span>
              <h3 className="text-lg font-bold text-slate-600 dark:text-slate-300 group-hover:text-primary transition-colors">
                Waiting
              </h3>
              <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-bold">
                {waitingTasks.length}
              </span>
            </button>

            {waitingOpen && (
              <div className="flex flex-col gap-3 mt-2">
                {waitingTasks.map((task) => {
                  const cat = catMap.get(task.categoryId);
                  return (
                    <div
                      key={task.id}
                      className="bg-white/50 dark:bg-card-dark/30 border border-slate-200 dark:border-border-dark rounded-xl p-5 flex items-start justify-between gap-4"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                            Waiting
                          </span>
                          {cat && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest bg-slate-100 dark:bg-border-dark text-slate-500 dark:text-slate-400">
                              {cat.name}
                            </span>
                          )}
                        </div>
                        <Link to={`/tasks/${task.id}`} className="hover:text-primary transition-colors">
                          <h4 className="font-semibold truncate">{task.title}</h4>
                        </Link>
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400">
                          {task.nextActionAt && (
                            <span className="flex items-center gap-1">
                              <span className="material-symbols-outlined text-sm">event</span>
                              Next action: {formatNextAction(task.nextActionAt)}
                            </span>
                          )}
                        </div>
                        {task.pendingReason && (
                          <p className="text-xs text-slate-400 italic mt-1">
                            {task.pendingReason}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => makeActionable(task.id)}
                        className="shrink-0 px-3 py-2 rounded-lg border border-slate-200 dark:border-border-dark text-xs font-bold text-slate-600 dark:text-slate-300 hover:border-primary hover:text-primary transition-all"
                      >
                        Make actionable
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        <footer className="mt-8 flex flex-col items-center gap-4 py-8 border-t border-slate-200 dark:border-border-dark">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/5 text-primary rounded-full text-sm font-medium border border-primary/10">
            <span className="material-symbols-outlined text-sm">spa</span>
            Stay focused. One task at a time.
          </div>
        </footer>
      </div>

      <QuickEntryModal
        open={showModal}
        onClose={() => setShowModal(false)}
        defaultDomain={tab === "Builder" ? "BUSINESS" : "LIFE_ADMIN"}
        addToTodayStack={tab === "Stabilizer"}
      />

      <AllTasksDrawer
        open={showAllTasksDrawer}
        onClose={() => setShowAllTasksDrawer(false)}
        tab={tab}
      />
    </div>
  );
}
