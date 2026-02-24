import { useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import {
  db,
  getCategoriesByDomain,
  getCustomCategories,
  getDefaultCategories,
  toggleCategoryVisibility,
  addCustomCategory,
  deleteCustomCategory,
  type Category,
  type TaskDomain,
} from "../db";

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
  CUSTOM: "label",
};

const MAX_CUSTOM_CATEGORIES = 5;

export default function CategoriesPage() {
  const allCategories = useLiveQuery(() => db.categories.toArray()) ?? [];
  const settings = useLiveQuery(() => db.appSettings.get("default"));
  const tasks = useLiveQuery(() => db.tasks.toArray()) ?? [];
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [hiddenExpanded, setHiddenExpanded] = useState(false);

  const hiddenIds = settings?.hiddenCategoryIds ?? [];
  const lifeAdminDefaults = getCategoriesByDomain(
    getDefaultCategories(allCategories),
    "LIFE_ADMIN"
  );
  const builderDefaults = getCategoriesByDomain(
    getDefaultCategories(allCategories),
    "BUSINESS"
  );
  const customCategories = getCustomCategories(allCategories);

  const lifeAdminVisible = lifeAdminDefaults.filter((c) => !hiddenIds.includes(c.id));
  const builderVisible = builderDefaults.filter((c) => !hiddenIds.includes(c.id));
  const hiddenCategories = [...lifeAdminDefaults, ...builderDefaults].filter((c) =>
    hiddenIds.includes(c.id)
  );

  const getTasksForCategory = (catId: string) =>
    tasks.filter((t) => t.categoryId === catId);

  const handleToggleVisibility = (categoryId: string) => {
    toggleCategoryVisibility(categoryId);
  };

  const CategoryCard = ({
    cat,
    showVisibilityToggle,
  }: {
    cat: Category;
    showVisibilityToggle?: boolean;
  }) => {
    const catTasks = getTasksForCategory(cat.id);
    const doneTasks = catTasks.filter(
      (t) => t.status === "DONE" || t.status === "ARCHIVED"
    ).length;
    const totalTasks = catTasks.length;
    const isHidden = hiddenIds.includes(cat.id);

    return (
      <div
        key={cat.id}
        className="group flex flex-col bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-4 shadow-sm hover:shadow-md hover:border-accent-pink transition-all duration-300"
      >
        <div className="flex justify-between items-center gap-3 mb-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="p-1.5 bg-gradient-accent rounded-lg text-white shrink-0">
              <span className="material-symbols-outlined text-base">
                {kindIcons[cat.kind] ?? "category"}
              </span>
            </div>
            <h3 className="text-md font-semibold tracking-tight truncate">
              {cat.name}
            </h3>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {showVisibilityToggle && (
              <button
                type="button"
                onClick={() => handleToggleVisibility(cat.id)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title={isHidden ? "Show category" : "Hide category"}
              >
                <span className="material-symbols-outlined text-lg">
                  {isHidden ? "visibility_off" : "visibility"}
                </span>
              </button>
            )}
            {cat.kind === "CUSTOM" && (
              <DeleteCategoryButton
                category={cat}
                taskCount={totalTasks}
              />
            )}
            <Link
              to={`/categories/${cat.id}`}
              className="opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-accent text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1"
            >
              Enter
              <span className="material-symbols-outlined text-xs">
                arrow_forward
              </span>
            </Link>
          </div>
        </div>

        <div className="grow min-h-0">
          <p className="card-why text-slate-600 dark:text-slate-300 text-xs leading-snug line-clamp-2">
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
  };

  const CategorySection = ({
    title,
    description,
    categories,
    showVisibilityToggle = false,
  }: {
    title: string;
    description: string;
    categories: Category[];
    showVisibilityToggle?: boolean;
  }) => (
    <div className="mb-5">
      <h2 className="text-lg font-bold text-slate-700 dark:text-slate-300 mb-1">
        {title}
      </h2>
      <p className="text-slate-500 dark:text-slate-400 text-sm mb-4">
        {description}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
        {categories.map((cat) => (
          <CategoryCard
            key={cat.id}
            cat={cat}
            showVisibilityToggle={showVisibilityToggle}
          />
        ))}
      </div>
    </div>
  );

  return (
    <div className="max-w-[1400px] mx-auto w-full px-6 py-10 lg:px-20 pb-24 md:pb-10">
      <div className="flex flex-col gap-2 mb-10">
        <h1 className="text-4xl font-bold tracking-tight">
          Categories
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
          categories={lifeAdminVisible}
          showVisibilityToggle
        />
        <CategorySection
          title="Builder (Business)"
          description="Categories for building your business and projects."
          categories={builderVisible}
          showVisibilityToggle
        />

        {hiddenCategories.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setHiddenExpanded(!hiddenExpanded)}
              className="flex items-center gap-2 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 mb-4"
            >
              <span className="material-symbols-outlined text-lg">
                {hiddenExpanded ? "expand_less" : "expand_more"}
              </span>
              <h2 className="text-lg font-bold">
                Hidden categories ({hiddenCategories.length})
              </h2>
            </button>
            {hiddenExpanded && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
                {hiddenCategories.map((cat) => (
                  <CategoryCard
                    key={cat.id}
                    cat={cat}
                    showVisibilityToggle
                  />
                ))}
              </div>
            )}
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-700 dark:text-slate-300 mb-1">
                Custom Categories
              </h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm">
                Add up to {MAX_CUSTOM_CATEGORIES} custom categories.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAddModalOpen(true)}
              disabled={customCategories.length >= MAX_CUSTOM_CATEGORIES}
              className="bg-gradient-accent text-white px-4 py-2.5 rounded-lg font-bold text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
            >
              <span className="material-symbols-outlined text-lg">add</span>
              Add custom category
            </button>
          </div>
          {customCategories.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
              {customCategories.map((cat) => (
                <CategoryCard key={cat.id} cat={cat} />
              ))}
            </div>
          ) : (
            <p className="text-slate-500 dark:text-slate-400 text-sm italic">
              No custom categories yet. Add one to tailor categories to your needs.
            </p>
          )}
        </div>
      </div>

      <div className="mt-16 bg-gradient-accent/5 rounded-xl p-8 border border-primary/20">
        <div className="flex flex-col md:flex-row items-center gap-8">
          <div className="flex-1">
            <h4 className="text-xl font-bold mb-2">The Balance Method</h4>
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

      {addModalOpen && (
        <AddCategoryModal
          onClose={() => setAddModalOpen(false)}
          onAdded={() => setAddModalOpen(false)}
          customCount={customCategories.length}
        />
      )}
    </div>
  );
}

function DeleteCategoryButton({
  category,
  taskCount,
}: {
  category: Category;
  taskCount: number;
}) {
  const handleDelete = async () => {
    if (taskCount > 0) {
      const ok = confirm(
        `This will reassign ${taskCount} task(s) to the first default category. Continue?`
      );
      if (!ok) return;
    }
    await deleteCustomCategory(category.id);
  };

  return (
    <button
      type="button"
      onClick={handleDelete}
      className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
      title="Delete custom category"
    >
      <span className="material-symbols-outlined text-lg">delete</span>
    </button>
  );
}

function AddCategoryModal({
  onClose,
  onAdded,
  customCount,
}: {
  onClose: () => void;
  onAdded: () => void;
  customCount: number;
}) {
  const [name, setName] = useState("");
  const [domain, setDomain] = useState<TaskDomain>("LIFE_ADMIN");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required");
      return;
    }
    if (customCount >= MAX_CUSTOM_CATEGORIES) {
      setError("Maximum custom categories reached");
      return;
    }
    setSubmitting(true);
    setError("");
    const cat = await addCustomCategory(trimmed, domain);
    setSubmitting(false);
    if (cat) {
      setName("");
      onAdded();
    } else {
      setError("Could not add category (max 5 custom categories)");
    }
  };

  return (
    <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="p-6 flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold tracking-tight">
              Add custom category
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 ml-1">
              Name
            </label>
            <input
              className="w-full bg-slate-100 dark:bg-background-dark border-none rounded-xl px-4 py-3 text-lg focus:ring-2 focus:ring-primary transition-all placeholder:text-slate-400"
              placeholder="e.g. Health, Volunteering"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 ml-1">
              Domain
            </label>
            <div className="flex gap-2">
              {(["LIFE_ADMIN", "BUSINESS"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDomain(d)}
                  className={`flex-1 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                    domain === d
                      ? "bg-primary/10 text-primary border-primary"
                      : "border-slate-200 dark:border-border-dark text-slate-500 hover:border-slate-400"
                  }`}
                >
                  {d === "LIFE_ADMIN" ? "Life" : "Business"}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 bg-gradient-accent text-white font-bold py-3 rounded-xl shadow-lg shadow-primary/20 hover:opacity-90 transition-all disabled:opacity-50"
            >
              {submitting ? "Adding..." : "Add"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
