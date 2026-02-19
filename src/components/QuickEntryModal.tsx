import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, generateId, nowISO, type Task } from "../db";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function QuickEntryModal({ open, onClose }: Props) {
  const categories = useLiveQuery(() => db.categories.toArray()) ?? [];
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [estimate, setEstimate] = useState(25);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!title.trim()) return;
    const catId = categoryId || categories[0]?.id;
    if (!catId) return;

    const now = nowISO();
    const task: Task = {
      id: generateId(),
      categoryId: catId,
      title: title.trim(),
      status: "TODAY",
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
      <div className="bg-white dark:bg-[#181f26] w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 dark:border-[#2a343f] overflow-hidden">
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
                className="w-full bg-slate-100 dark:bg-[#0f1419] border-none rounded-xl px-4 py-4 text-lg focus:ring-2 focus:ring-primary transition-all placeholder:text-slate-400"
                placeholder="What needs your attention?"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 ml-1">
                Category
              </label>
              <div className="flex flex-wrap gap-2">
                {categories.map((cat) => (
                  <label key={cat.id} className="cursor-pointer">
                    <input
                      className="hidden peer"
                      type="radio"
                      name="qe-category"
                      checked={
                        categoryId === cat.id ||
                        (!categoryId && cat.id === categories[0]?.id)
                      }
                      onChange={() => setCategoryId(cat.id)}
                    />
                    <span className="px-4 py-2 rounded-full border border-slate-200 dark:border-[#2a343f] text-sm font-medium peer-checked:bg-primary/10 peer-checked:text-primary peer-checked:border-primary transition-all inline-block">
                      {cat.name}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 ml-1">
                Estimated Time
              </label>
              <div className="relative flex items-center">
                <input
                  className="w-full bg-slate-100 dark:bg-[#0f1419] border-none rounded-xl px-4 py-4 text-lg focus:ring-2 focus:ring-primary transition-all"
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
