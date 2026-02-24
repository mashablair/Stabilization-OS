import { useState, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, generateId, nowISO, getCategoriesByDomain, type Task, type TaskDomain } from "../db";

interface Props {
  open: boolean;
  onClose: () => void;
  defaultDomain?: TaskDomain;
  /** When true, new LIFE_ADMIN tasks get status TODAY so they show in the Today Stack */
  addToTodayStack?: boolean;
}

export default function QuickEntryModal({ open, onClose, defaultDomain = "LIFE_ADMIN", addToTodayStack = false }: Props) {
  const allCategories = useLiveQuery(() => db.categories.toArray()) ?? [];
  const [domain, setDomain] = useState<TaskDomain>(defaultDomain);
  const categories = getCategoriesByDomain(allCategories, domain);
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [estimate, setEstimate] = useState(25);

  useEffect(() => {
    if (open) {
      setDomain(defaultDomain);
      setCategoryId("");
    }
  }, [open, defaultDomain]);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!title.trim()) return;
    const catId = categoryId || categories[0]?.id;
    if (!catId) return;

    const now = nowISO();
    const task: Task = {
      id: generateId(),
      categoryId: catId,
      domain,
      title: title.trim(),
      status: addToTodayStack && domain === "LIFE_ADMIN" ? "TODAY" : "BACKLOG",
      priority: 2,
      estimateMinutes: estimate,
      actualSecondsTotal: 0,
      contextCard: { why: "", nextMicroStep: "", reframe: "" },
      createdAt: now,
      updatedAt: now,
      subtasks: [],
    };

    await db.tasks.add(task);
    setTitle("");
    setEstimate(25);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-card-dark w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 dark:border-border-dark overflow-hidden">
        <div className="p-8 flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold tracking-tight">Quick Entry</h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          <div className="space-y-5">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 ml-1">
                Task Name
              </label>
              <input
                className="w-full bg-slate-100 dark:bg-background-dark border-none rounded-xl px-4 py-4 text-lg focus:ring-2 focus:ring-primary transition-all placeholder:text-slate-400"
                placeholder="What needs your attention?"
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
                    {d === "LIFE_ADMIN" ? "Life" : "Business"}
                  </button>
                );})}
              </div>
            </div>

            {/* Category */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 ml-1">
                Category
              </label>
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
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 ml-1">
                Estimated Time
              </label>
              <div className="relative flex items-center">
                <input
                  className="w-full bg-slate-100 dark:bg-background-dark border-none rounded-xl px-4 py-4 text-lg focus:ring-2 focus:ring-primary transition-all"
                  type="number"
                  value={estimate}
                  onChange={(e) => setEstimate(Number(e.target.value))}
                  min={1}
                />
                <span className="absolute right-4 text-slate-400 font-medium">
                  minutes
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={handleSubmit}
            className="w-full bg-gradient-accent text-white font-bold py-4 rounded-2xl text-lg shadow-lg shadow-primary/25 hover:opacity-90 transition-all flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined">auto_awesome</span>
            Add to Stack
          </button>

          <p className="text-center text-xs text-slate-400 italic">
            "Focus on one thing at a time. You're doing great."
          </p>
        </div>
      </div>
    </div>
  );
}
