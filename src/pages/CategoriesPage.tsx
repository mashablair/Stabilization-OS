import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db, getCategoriesByDomain } from "../db";

const kindIcons: Record<string, string> = {
  LEGAL: "gavel",
  MONEY: "account_balance_wallet",
  MAINTENANCE: "home_repair_service",
  CAREGIVER: "favorite",
  CONTENT: "edit_note",
  PRODUCT: "precision_manufacturing",
  NETWORKING: "groups",
  LEARNING: "school",
  OPS: "settings",
};

export default function CategoriesPage() {
  const allCategories = useLiveQuery(() => db.categories.toArray()) ?? [];
  const lifeAdminCategories = getCategoriesByDomain(allCategories, "LIFE_ADMIN");
  const builderCategories = getCategoriesByDomain(allCategories, "BUSINESS");
  const tasks = useLiveQuery(() => db.tasks.toArray()) ?? [];

  const getTasksForCategory = (catId: string) =>
    tasks.filter((t) => t.categoryId === catId);

  const CategorySection = ({
    title,
    description,
    categories,
  }: {
    title: string;
    description: string;
    categories: typeof allCategories;
  }) => (
    <div>
      <h2 className="text-lg font-bold text-slate-700 dark:text-slate-300 mb-1">
        {title}
      </h2>
      <p className="text-slate-500 dark:text-slate-400 text-sm mb-4">
        {description}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
        {categories.map((cat) => {
          const catTasks = getTasksForCategory(cat.id);
          const doneTasks = catTasks.filter((t) => t.status === "DONE" || t.status === "ARCHIVED").length;
          const totalTasks = catTasks.length;

          return (
            <div
              key={cat.id}
              className="group flex flex-col bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-4 shadow-sm hover:shadow-md hover:border-accent-pink transition-all duration-300"
            >
              <div className="flex justify-between items-center gap-3 mb-3">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className="p-1.5 bg-gradient-accent rounded-lg text-white shrink-0">
                    <span className="material-symbols-outlined text-lg">
                      {kindIcons[cat.kind] ?? "category"}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold tracking-tight truncate">
                    {cat.name}
                  </h3>
                </div>
                <Link
                  to={`/categories/${cat.id}`}
                  className="opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-accent text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 shrink-0"
                >
                  Enter
                  <span className="material-symbols-outlined text-xs">
                    arrow_forward
                  </span>
                </Link>
              </div>

              <div className="grow min-h-0">
                <span className="text-[10px] uppercase font-bold tracking-[0.15em] text-slate-400 dark:text-slate-500 block mb-0.5">
                  Why this matters
                </span>
                <p className="text-slate-600 dark:text-slate-300 text-sm leading-snug line-clamp-2">
                  {cat.contextCard.why}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 min-w-0">
                <p className="text-xs italic text-gradient font-medium truncate flex-1 min-w-0">
                  {cat.contextCard.script}
                </p>
                <span className="text-xs text-slate-400 font-mono shrink-0">
                  {doneTasks}/{totalTasks}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

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

      <div className="flex flex-col gap-8">
        <CategorySection
          title="Life"
          description="Categories for keeping life running smoothly."
          categories={lifeAdminCategories}
        />
        <CategorySection
          title="Builder (Business)"
          description="Categories for building your business and projects."
          categories={builderCategories}
        />
      </div>

      <div className="mt-16 bg-gradient-accent/5 rounded-xl p-8 border border-primary/20">
        <div className="flex flex-col md:flex-row items-center gap-8">
          <div className="flex-1">
            <h4 className="text-xl font-bold mb-2">
              The Balance Method
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
