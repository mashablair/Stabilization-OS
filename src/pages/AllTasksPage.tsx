import { useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import {
  db,
  buildStabilizerStackSplit,
  isActionable,
  nowISO,
  markTaskDone,
  unmarkTaskDone,
  markTaskArchived,
  getEffectiveMinutes,
  todayDateStr,
} from "../db";
import type { Task } from "../db";
import { formatMinutes } from "../hooks/useTimer";

type DomainTab = "Stabilizer" | "Builder";
type DoneTab = "Completed" | "Archived";

export default function AllTasksPage() {
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get("tab")?.toLowerCase();
  const domainTab: DomainTab = tabParam === "builder" ? "Builder" : "Stabilizer";

  const categories = useLiveQuery(() => db.categories.toArray()) ?? [];
  const allTasks = useLiveQuery(() => db.tasks.toArray()) ?? [];
  const settings = useLiveQuery(() => db.appSettings.get("default"));
  const today = todayDateStr();
  const dailyOverride = useLiveQuery(
    () => db.dailyCapacity.where("[date+domain]").equals([today, "LIFE_ADMIN"]).first(),
    [today]
  );
  const availMins = getEffectiveMinutes(settings, dailyOverride, "LIFE_ADMIN");

  const [doneOpen, setDoneOpen] = useState(false);
  const [doneTab, setDoneTab] = useState<DoneTab>("Completed");

  const domain = domainTab === "Stabilizer" ? "LIFE_ADMIN" : "BUSINESS";
  const actionableTasks = allTasks.filter(
    (t) => t.domain === domain && isActionable(t)
  );

  const { pinned: pinnedTasks } = buildStabilizerStackSplit(
    allTasks,
    categories,
    availMins,
    5
  );
  const pinnedIds = new Set(pinnedTasks.map((t) => t.id));

  const sortedTasks = [...actionableTasks].sort((a, b) => {
    const aPinned = a.status === "TODAY" ? 1 : 0;
    const bPinned = b.status === "TODAY" ? 1 : 0;
    if (aPinned !== bPinned) return bPinned - aPinned;
    return (a.title ?? "").localeCompare(b.title ?? "");
  });

  const completedTasks = allTasks
    .filter((t) => t.domain === domain && t.status === "DONE")
    .sort(
      (a, b) =>
        new Date(b.completedAt ?? b.updatedAt).getTime() -
        new Date(a.completedAt ?? a.updatedAt).getTime()
    );

  const archivedTasks = allTasks
    .filter((t) => t.domain === domain && t.status === "ARCHIVED")
    .sort(
      (a, b) =>
        new Date(b.completedAt ?? b.updatedAt).getTime() -
        new Date(a.completedAt ?? a.updatedAt).getTime()
    );

  const catMap = new Map(categories.map((c) => [c.id, c]));

  const pinTask = async (task: Task) => {
    await db.tasks.update(task.id, { status: "TODAY", updatedAt: nowISO() });
  };
  const unpinTask = async (task: Task) => {
    await db.tasks.update(task.id, { status: "BACKLOG", updatedAt: nowISO() });
  };
  const isPinned = (task: Task) => task.status === "TODAY";
  const stackFull = domainTab === "Stabilizer" && pinnedIds.size >= 5;

  const doneTasks = doneTab === "Completed" ? completedTasks : archivedTasks;

  return (
    <div className="max-w-[800px] mx-auto w-full px-6 py-10 pb-24 md:pb-10">
      <div className="flex items-center gap-2 mb-6 text-sm">
        <Link to="/" className="text-slate-500 hover:text-primary">
          Today
        </Link>
        <span className="text-slate-300">/</span>
        <span className="font-medium">All Tasks</span>
      </div>

      <div className="flex gap-2 mb-6">
        <Link
          to="/today/all?tab=stabilizer"
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
            domainTab === "Stabilizer"
              ? "bg-primary/10 text-primary border border-primary"
              : "border border-slate-200 dark:border-border-dark text-slate-500 hover:border-slate-400"
          }`}
        >
          Stabilizer
        </Link>
        <Link
          to="/today/all?tab=builder"
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
            domainTab === "Builder"
              ? "bg-primary/10 text-primary border border-primary"
              : "border border-slate-200 dark:border-border-dark text-slate-500 hover:border-slate-400"
          }`}
        >
          Builder
        </Link>
      </div>

      {/* Active tasks */}
      <div className="flex flex-col gap-6">
        <div>
          <h2 className="text-xl font-bold leading-tight">
            All {domainTab === "Stabilizer" ? "Life Admin" : "Business"} Tasks
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {domainTab === "Stabilizer"
              ? "Pin tasks to add them to your Today Stack. Unpin to remove."
              : "Pin tasks to prioritize them at the top of your Builder Queue."}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {sortedTasks.length === 0 ? (
            <p className="text-slate-400 py-8 text-center">
              No {domainTab === "Stabilizer" ? "life admin" : "business"} tasks yet.
            </p>
          ) : (
            sortedTasks.map((task) => {
              const cat = catMap.get(task.categoryId);
              const pinned = isPinned(task);
              const cannotPin = stackFull && !pinned;

              return (
                <div
                  key={task.id}
                  className="flex items-center justify-between gap-4 p-4 rounded-xl border border-slate-200 dark:border-border-dark bg-white dark:bg-card-dark hover:border-primary/30 transition-colors"
                >
                  <Link
                    to={`/tasks/${task.id}`}
                    className="flex-1 min-w-0 hover:text-primary transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <h4 className="font-semibold truncate">{task.title}</h4>
                      {cat && (
                        <span className="shrink-0 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest bg-slate-100 dark:bg-border-dark text-slate-500 dark:text-slate-400">
                          {cat.name}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                      <span className="material-symbols-outlined text-sm">schedule</span>
                      {task.estimateMinutes ? formatMinutes(task.estimateMinutes) : "—"}
                    </div>
                  </Link>
                  <button
                    onClick={() => (pinned ? unpinTask(task) : pinTask(task))}
                    disabled={cannotPin}
                    className={`shrink-0 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                      cannotPin
                        ? "opacity-50 cursor-not-allowed border border-slate-200 dark:border-border-dark text-slate-400"
                        : pinned
                          ? "border border-slate-200 dark:border-border-dark text-slate-600 dark:text-slate-300 hover:border-amber-400 hover:text-amber-600 dark:hover:text-amber-400"
                          : "bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20"
                    }`}
                    title={
                      cannotPin
                        ? "Stack full (5/5). Remove a task from Today to add another."
                        : pinned
                          ? "Remove from today"
                          : "Add to today"
                    }
                  >
                    {pinned ? "Remove from today" : "Add to today"}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Done / Archived section */}
      {(completedTasks.length > 0 || archivedTasks.length > 0) && (
        <div className="mt-10">
          <button
            type="button"
            onClick={() => setDoneOpen(!doneOpen)}
            className="flex items-center gap-3 py-3 text-left group w-full"
          >
            <span
              className={`material-symbols-outlined text-slate-400 transition-transform ${doneOpen ? "rotate-90" : ""}`}
            >
              chevron_right
            </span>
            <h3 className="text-lg font-bold text-slate-600 dark:text-slate-300 group-hover:text-primary transition-colors">
              Done
            </h3>
            <span className="px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-bold">
              {completedTasks.length + archivedTasks.length}
            </span>
          </button>

          {doneOpen && (
            <div className="mt-2 flex flex-col gap-4">
              <div className="flex gap-2">
                {(["Completed", "Archived"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setDoneTab(t)}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                      doneTab === t
                        ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-300 dark:border-green-800"
                        : "border border-slate-200 dark:border-border-dark text-slate-500 hover:border-slate-400"
                    }`}
                  >
                    {t}
                    <span className="ml-1.5 text-xs opacity-70">
                      ({t === "Completed" ? completedTasks.length : archivedTasks.length})
                    </span>
                  </button>
                ))}
              </div>

              {doneTasks.length === 0 ? (
                <p className="text-slate-400 py-6 text-center text-sm">
                  No {doneTab.toLowerCase()} tasks yet.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {doneTasks.map((task) => {
                    const cat = catMap.get(task.categoryId);
                    return (
                      <div
                        key={task.id}
                        className="flex items-center justify-between gap-4 p-4 rounded-xl border border-slate-200 dark:border-border-dark bg-white/60 dark:bg-card-dark/50 transition-colors"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <button
                            onClick={() => unmarkTaskDone(task.id)}
                            className="size-6 rounded-full bg-gradient-accent border-transparent flex items-center justify-center shrink-0 hover:opacity-80 transition-opacity"
                            title="Undo completion"
                          >
                            <span className="material-symbols-outlined text-white text-sm">check</span>
                          </button>
                          <Link
                            to={`/tasks/${task.id}`}
                            className="flex-1 min-w-0 hover:text-primary transition-colors"
                          >
                            <h4 className="font-semibold truncate text-slate-400 line-through">
                              {task.title}
                            </h4>
                            <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                              {cat && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 dark:bg-border-dark">
                                  {cat.name}
                                </span>
                              )}
                              {task.completedAt && (
                                <span>
                                  {new Date(task.completedAt).toLocaleDateString(undefined, {
                                    month: "short",
                                    day: "numeric",
                                  })}
                                </span>
                              )}
                            </div>
                          </Link>
                        </div>
                        <div className="flex items-center gap-2">
                          {doneTab === "Completed" && (
                            <button
                              onClick={() => markTaskArchived(task.id)}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 dark:border-border-dark text-slate-500 hover:border-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-all"
                              title="Archive this task"
                            >
                              Archive
                            </button>
                          )}
                          {doneTab === "Archived" && (
                            <button
                              onClick={async () => {
                                await db.tasks.update(task.id, {
                                  status: "DONE",
                                  updatedAt: nowISO(),
                                });
                              }}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 dark:border-border-dark text-slate-500 hover:border-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-all"
                              title="Move back to Completed"
                            >
                              Unarchive
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
