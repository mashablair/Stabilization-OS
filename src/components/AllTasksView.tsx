import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db, buildStabilizerStackSplit, isActionable, nowISO, getEffectiveMinutes, todayDateStr } from "../db";
import { formatMinutes } from "../hooks/useTimer";
import type { Task } from "../db";

type Tab = "Life" | "Builder";

interface Props {
  tab: Tab;
  /** When true, renders compact for modal/drawer with close affordance */
  embedded?: boolean;
  onClose?: () => void;
}

export default function AllTasksView({ tab, embedded = false, onClose }: Props) {
  const categories = useLiveQuery(() => db.categories.toArray()) ?? [];
  const allTasks = useLiveQuery(() => db.tasks.toArray()) ?? [];
  const settings = useLiveQuery(() => db.appSettings.get("default"));
  const today = todayDateStr();
  const dailyOverride = useLiveQuery(
    () => db.dailyCapacity.where("[date+domain]").equals([today, "LIFE_ADMIN"]).first(),
    [today]
  );
  const availMins = getEffectiveMinutes(settings, dailyOverride, "LIFE_ADMIN");

  const stabilizerPool = allTasks.filter(
    (t) => t.domain === "LIFE_ADMIN" && isActionable(t)
  );
  const builderPool = allTasks.filter(
    (t) => t.domain === "BUSINESS" && isActionable(t)
  );

  const { pinned: pinnedTasks } = buildStabilizerStackSplit(
    allTasks,
    categories,
    availMins,
    5
  );
  const pinnedIds = new Set(pinnedTasks.map((t) => t.id));

  const tasks =
    tab === "Life"
      ? [...stabilizerPool].sort((a, b) => {
          const aPinned = a.status === "TODAY" ? 1 : 0;
          const bPinned = b.status === "TODAY" ? 1 : 0;
          if (aPinned !== bPinned) return bPinned - aPinned;
          return (a.title ?? "").localeCompare(b.title ?? "");
        })
      : [...builderPool].sort((a, b) => {
          const aPinned = a.status === "TODAY" ? 1 : 0;
          const bPinned = b.status === "TODAY" ? 1 : 0;
          if (aPinned !== bPinned) return bPinned - aPinned;
          return (a.title ?? "").localeCompare(b.title ?? "");
        });

  const catMap = new Map(categories.map((c) => [c.id, c]));

  const pinTask = async (task: Task) => {
    await db.tasks.update(task.id, {
      status: "TODAY",
      updatedAt: nowISO(),
    });
  };

  const unpinTask = async (task: Task) => {
    await db.tasks.update(task.id, {
      status: "BACKLOG",
      updatedAt: nowISO(),
    });
  };

  const isPinned = (task: Task) => task.status === "TODAY";

  return (
    <div className={`flex flex-col ${embedded ? "gap-4" : "gap-6"}`}>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold leading-tight">
          All {tab === "Life" ? "Life" : "Business"} Tasks
        </h2>
        {embedded && onClose && (
          <button
            onClick={onClose}
            className="p-2 -m-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        )}
      </div>

      <p className="text-sm text-slate-500 dark:text-slate-400">
        {tab === "Life"
          ? "Pin tasks to add them to your Today Stack. Unpin to remove."
          : "Pin tasks to prioritize them at the top of your Builder Queue."}
      </p>

      <div className="flex flex-col gap-2">
        {tasks.length === 0 ? (
          <p className="text-slate-400 py-8 text-center">
            No {tab === "Life" ? "life" : "business"} tasks yet.
          </p>
        ) : (
          tasks.map((task) => {
            const cat = catMap.get(task.categoryId);
            const pinned = isPinned(task);
            const stackFull =
              tab === "Life" && pinnedIds.size >= 5 && !pinned;

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
                    <span className="material-symbols-outlined text-sm">
                      schedule
                    </span>
                    {task.estimateMinutes
                      ? formatMinutes(task.estimateMinutes)
                      : "—"}
                  </div>
                </Link>
                <button
                  onClick={() => (pinned ? unpinTask(task) : pinTask(task))}
                  disabled={stackFull}
                  className={`shrink-0 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                    stackFull
                      ? "opacity-50 cursor-not-allowed border border-slate-200 dark:border-border-dark text-slate-400"
                      : pinned
                        ? "border border-slate-200 dark:border-border-dark text-slate-600 dark:text-slate-300 hover:border-amber-400 hover:text-amber-600 dark:hover:text-amber-400"
                        : "bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20"
                  }`}
                  title={
                    stackFull
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
  );
}
