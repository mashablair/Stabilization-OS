import { useState, useEffect } from "react";
import { useCategories } from "../hooks/useData";
import { generateId, nowISO, getCategoriesByDomain, addTask, type Task, type TaskDomain } from "../db";

const DEFAULT_FIRST_SUBTASK_TITLE = "Main";

interface Props {
  open: boolean;
  onClose: () => void;
  defaultDomain?: TaskDomain;
  /** When true, new LIFE_ADMIN tasks get status TODAY so they show in the Today Stack */
  addToTodayStack?: boolean;
}

export default function QuickEntryModal({ open, onClose, defaultDomain = "LIFE_ADMIN", addToTodayStack = false }: Props) {
  const { data: allCategories = [] } = useCategories();
  const [domain, setDomain] = useState<TaskDomain>(defaultDomain);
  const categories = getCategoriesByDomain(allCategories, domain);
  const [title, setTitle] = useState("");
  const [firstSubtask, setFirstSubtask] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [estimate, setEstimate] = useState(25);

  useEffect(() => {
    if (open) {
      setDomain(defaultDomain);
      setCategoryId("");
      setFirstSubtask("");
    }
  }, [open, defaultDomain]);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!title.trim()) return;
    const catId = categoryId || categories[0]?.id;
    if (!catId) return;

    const now = nowISO();
    const subtaskTitle = firstSubtask.trim() || DEFAULT_FIRST_SUBTASK_TITLE;
    const subtasks = [
      {
        id: generateId(),
        title: subtaskTitle,
        done: false,
        estimateMinutes: estimate,
        actualSecondsTotal: 0,
      },
    ];

    const task: Task = {
      id: generateId(),
      categoryId: catId,
      domain,
      title: title.trim(),
      status: addToTodayStack && domain === "LIFE_ADMIN" ? "TODAY" : "BACKLOG",
      priority: 2,
      timeTrackingMode: "PROJECT",
      estimateMinutes: estimate,
      actualSecondsTotal: 0,
      contextCard: { why: "", nextMicroStep: "", reframe: "" },
      createdAt: now,
      updatedAt: now,
      subtasks,
    };

    await addTask(task);
    setTitle("");
    setFirstSubtask("");
    setEstimate(25);
    onClose();
  };

  const inputClass =
    "w-full bg-slate-100 dark:bg-background-dark border-none rounded-xl px-3 h-10 text-sm focus:ring-2 focus:ring-primary transition-all placeholder:text-slate-400";

  return (
    <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-card-dark w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 dark:border-border-dark overflow-hidden">
        <div className="p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold tracking-tight">Quick Entry</h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 ml-1">
                Task name
              </label>
              <input
                className={inputClass}
                placeholder="What needs your attention?"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 ml-1">
                First subtask
              </label>
              <input
                className={inputClass}
                placeholder={`Optional — defaults to "${DEFAULT_FIRST_SUBTASK_TITLE}"`}
                value={firstSubtask}
                onChange={(e) => setFirstSubtask(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              />
              <p className="text-[11px] text-slate-400 dark:text-slate-500 ml-1">
                Time and estimate apply to this step; you can add more subtasks on the task page.
              </p>
            </div>

            {/* Domain */}
            <div className="space-y-1.5">
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
                    className={`flex-1 px-3 py-2 rounded-xl border text-xs font-semibold transition-all ${
                      domain === d
                        ? "bg-primary/10 text-primary border-primary"
                        : "border-slate-200 dark:border-border-dark text-slate-500 hover:border-slate-400"
                    }`}
                  >
                    {d === "LIFE_ADMIN" ? "Life" : "Business"}
                  </button>
                );})}
              </div>
            </div>

            {/* Category */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 ml-1">
                Category
              </label>
              <div className="flex flex-wrap gap-1.5">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategoryId(cat.id)}
                    className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
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
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 ml-1">
                Estimated time
              </label>
              <div className="relative flex items-center">
                <input
                  className={`${inputClass} pr-18`}
                  type="number"
                  value={estimate}
                  onChange={(e) => setEstimate(Number(e.target.value))}
                  min={1}
                />
                <span className="absolute right-3 text-xs text-slate-400 font-medium pointer-events-none">
                  minutes
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={handleSubmit}
            className="w-full bg-gradient-accent text-white font-bold py-3 rounded-xl text-sm shadow-lg shadow-primary/25 hover:opacity-90 transition-all flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-lg">auto_awesome</span>
            Add to Stack
          </button>

          <p className="text-center text-[11px] text-slate-400 italic">
            "Focus on one thing at a time. You're doing great."
          </p>
        </div>
      </div>
    </div>
  );
}
