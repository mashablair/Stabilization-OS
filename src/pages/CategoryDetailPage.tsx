import { useParams, Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db, nowISO, markTaskDone, unmarkTaskDone, type TaskStatus } from "../db";
import { formatMinutes } from "../hooks/useTimer";

export default function CategoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const category = useLiveQuery(() => (id ? db.categories.get(id) : undefined), [id]);
  const tasks = useLiveQuery(
    () => (id ? db.tasks.where("categoryId").equals(id).toArray() : []),
    [id]
  ) ?? [];

  if (!category) {
    return (
      <div className="flex justify-center items-center py-20 text-slate-400">
        Loading...
      </div>
    );
  }

  const totalEstimate = tasks.reduce((s, t) => s + (t.estimateMinutes ?? 0), 0);
  const totalActual = tasks.reduce((s, t) => s + t.actualSecondsTotal, 0);
  const doneTasks = tasks.filter((t) => t.status === "DONE" || t.status === "ARCHIVED");
  const completionPct = tasks.length > 0 ? Math.round((doneTasks.length / tasks.length) * 100) : 0;

  const statusOrder: Record<TaskStatus, number> = {
    IN_PROGRESS: 0,
    TODAY: 1,
    BACKLOG: 2,
    PENDING: 3,
    DONE: 4,
    ARCHIVED: 5,
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 pb-24 md:pb-10">
      <div className="flex items-center gap-2 mb-6 text-sm">
        <Link to="/categories" className="text-slate-500 hover:text-primary">
          Categories
        </Link>
        <span className="text-slate-300">/</span>
        <span className="font-medium">{category.name}</span>
      </div>

      <h1 className="text-3xl font-bold tracking-tight mb-2">{category.name}</h1>
      <p className="text-slate-500 dark:text-slate-400 mb-8">{category.contextCard.why}</p>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">Estimated</p>
          <p className="text-2xl font-bold text-gradient">{formatMinutes(totalEstimate)}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">Actual</p>
          <p className="text-2xl font-bold">{formatMinutes(Math.round(totalActual / 60))}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">Complete</p>
          <p className="text-2xl font-bold text-gradient">{completionPct}%</p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {[...tasks]
          .sort((a, b) => (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9))
          .map((task) => (
            <Link
              key={task.id}
              to={`/tasks/${task.id}`}
              className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 hover:shadow-md hover:border-primary/30 transition-all flex items-center justify-between group"
            >
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <button
                  onClick={async (e) => {
                    e.preventDefault();
                    if (task.status === "DONE") {
                      await unmarkTaskDone(task.id);
                    } else {
                      await markTaskDone(task.id);
                    }
                  }}
                  className={`size-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                    task.status === "DONE"
                      ? "bg-gradient-accent border-transparent"
                      : "border-slate-300 dark:border-slate-600 hover:border-primary"
                  }`}
                >
                  {task.status === "DONE" && (
                    <span className="material-symbols-outlined text-white text-sm">check</span>
                  )}
                </button>
                <div className="min-w-0">
                  <h4 className={`font-semibold truncate ${task.status === "DONE" ? "line-through text-slate-400" : ""}`}>
                    {task.title}
                  </h4>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm">schedule</span>
                      {task.estimateMinutes ? formatMinutes(task.estimateMinutes) : "—"}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                      task.status === "IN_PROGRESS" ? "bg-primary/10 text-primary" :
                      task.status === "TODAY" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                      task.status === "DONE" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                      "bg-slate-100 text-slate-500 dark:bg-slate-800"
                    }`}>
                      {task.status.replace("_", " ")}
                    </span>
                  </div>
                </div>
              </div>
              <span className="material-symbols-outlined text-slate-300 group-hover:text-primary transition-colors">
                chevron_right
              </span>
            </Link>
          ))}

        {tasks.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <p>No tasks in this category yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
