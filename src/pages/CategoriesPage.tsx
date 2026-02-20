import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";

const kindIcons: Record<string, string> = {
  LEGAL: "gavel",
  MONEY: "account_balance_wallet",
  MAINTENANCE: "home_repair_service",
  CAREGIVER: "favorite",
};

export default function CategoriesPage() {
  const categories = useLiveQuery(() => db.categories.toArray()) ?? [];
  const tasks = useLiveQuery(() => db.tasks.toArray()) ?? [];

  const getTasksForCategory = (catId: string) =>
    tasks.filter((t) => t.categoryId === catId);

  return (
    <div className="max-w-[1400px] mx-auto w-full px-6 py-10 lg:px-20 pb-24 md:pb-10">
      <div className="flex flex-col gap-2 mb-10">
        <h1 className="text-4xl font-bold tracking-tight">
          Categories Overview
        </h1>
        <p className="text-slate-500 dark:text-slate-400 text-lg max-w-2xl leading-relaxed">
          A calm space to manage your high-level domains. Clear the mental
          clutter by grounding yourself in what matters most.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
        {categories.map((cat) => {
          const catTasks = getTasksForCategory(cat.id);
          const doneTasks = catTasks.filter((t) => t.status === "DONE").length;
          const totalTasks = catTasks.length;

          return (
            <div
              key={cat.id}
              className="group flex flex-col bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-8 shadow-sm hover:shadow-md hover:border-accent-pink transition-all duration-300"
            >
              <div className="flex justify-between items-start mb-6">
                <div className="p-3 bg-gradient-accent rounded-lg text-white">
                  <span className="material-symbols-outlined text-3xl">
                    {kindIcons[cat.kind] ?? "category"}
                  </span>
                </div>
                <Link
                  to={`/categories/${cat.id}`}
                  className="opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-accent text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2"
                >
                  Enter Category
                  <span className="material-symbols-outlined text-sm">
                    arrow_forward
                  </span>
                </Link>
              </div>

              <h3 className="text-2xl font-bold mb-4 tracking-tight">
                {cat.name}
              </h3>

              <div className="space-y-6 flex-grow">
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-[0.15em] text-slate-400 dark:text-slate-500 block mb-1">
                    Why this matters
                  </span>
                  <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                    {cat.contextCard.why}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-[0.15em] text-gradient block mb-1">
                    Win condition
                  </span>
                  <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                    {cat.contextCard.winCondition}
                  </p>
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3 italic text-gradient font-medium">
                  <span className="material-symbols-outlined text-primary">
                    auto_awesome
                  </span>
                  <p>{cat.contextCard.script}</p>
                </div>
                <span className="text-xs text-slate-400 font-mono">
                  {doneTasks}/{totalTasks}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-16 bg-gradient-accent/5 rounded-xl p-8 border border-primary/20">
        <div className="flex flex-col md:flex-row items-center gap-8">
          <div className="flex-1">
            <h4 className="text-xl font-bold mb-2">
              The Stabilization Method
            </h4>
            <p className="text-slate-600 dark:text-slate-400">
              When stress levels are high, narrow your focus. These categories
              are your anchor points. If one is shaky, focus there until the
              baseline is restored. You don't need to do everything — just the
              essentials.
            </p>
          </div>
          <Link
            to="/"
            className="bg-gradient-accent text-white px-6 py-3 rounded-lg font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] transition-transform whitespace-nowrap"
          >
            View Today Stack
          </Link>
        </div>
      </div>
    </div>
  );
}
