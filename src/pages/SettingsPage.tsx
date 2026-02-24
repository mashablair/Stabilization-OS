import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type Category, type Task, type TimeEntry, type WeeklyReview, type DailyCapacity, type AppSettings } from "../db";

interface ShareBundle {
  meta: { version: string; exportedAt: string; timezone: string };
  categories: Category[];
  tasks: Task[];
  timeEntries: TimeEntry[];
  weeklyReviews?: WeeklyReview[];
  dailyCapacity?: DailyCapacity[];
  appSettings?: AppSettings;
}

export default function SettingsPage() {
  const settings = useLiveQuery(() => db.appSettings.get("default"));
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState("");

  const stabilizerDefault = settings?.availableMinutes ?? 120;
  const builderDefault = settings?.builderAvailableMinutes ?? 120;

  const updateSetting = (
    field: "availableMinutes" | "builderAvailableMinutes",
    value: number
  ) => {
    const v = Math.max(0, value);
    if (field === "availableMinutes") {
      db.appSettings.update("default", { availableMinutes: v });
    } else {
      db.appSettings.update("default", { builderAvailableMinutes: v });
    }
  };

  const exportBundle = async () => {
    const categories = await db.categories.toArray();
    const tasks = await db.tasks.toArray();
    const timeEntries = await db.timeEntries.toArray();
    const weeklyReviews = await db.weeklyReviews.toArray();
    const dailyCapacity = await db.dailyCapacity.toArray();
    const appSettings = await db.appSettings.get("default");

    const bundle: ShareBundle = {
      meta: {
        version: "1.1.0",
        exportedAt: new Date().toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      categories,
      tasks,
      timeEntries,
      weeklyReviews,
      dailyCapacity,
      appSettings: appSettings ?? undefined,
    };

    const blob = new Blob([JSON.stringify(bundle, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `balance-os-bundle-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importBundle = async (file: File) => {
    setImporting(true);
    setImportStatus("Reading file...");
    try {
      const text = await file.text();
      const bundle: ShareBundle = JSON.parse(text);

      if (!bundle.meta?.version || !bundle.categories || !bundle.tasks) {
        throw new Error("Invalid bundle format");
      }

      setImportStatus("Importing data...");

      await db.transaction(
        "rw",
        [db.categories, db.tasks, db.timeEntries, db.weeklyReviews, db.dailyCapacity, db.appSettings],
        async () => {
          await db.categories.clear();
          await db.tasks.clear();
          await db.timeEntries.clear();
          await db.weeklyReviews.clear();
          await db.dailyCapacity.clear();

          await db.categories.bulkAdd(bundle.categories);
          await db.tasks.bulkAdd(bundle.tasks);
          await db.timeEntries.bulkAdd(bundle.timeEntries);
          if (bundle.weeklyReviews) {
            await db.weeklyReviews.bulkAdd(bundle.weeklyReviews);
          }
          if (bundle.dailyCapacity) {
            await db.dailyCapacity.bulkAdd(bundle.dailyCapacity);
          }
          if (bundle.appSettings) {
            await db.appSettings.put(bundle.appSettings);
          }
        }
      );

      setImportStatus(
        `Imported ${bundle.categories.length} categories, ${bundle.tasks.length} tasks, ${bundle.timeEntries.length} time entries.`
      );
    } catch (err) {
      setImportStatus(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setImporting(false);
    }
  };

  const exportCSV = async (type: "tasks" | "time_entries") => {
    if (type === "tasks") {
      const tasks = await db.tasks.toArray();
      const categories = await db.categories.toArray();
      const catMap = new Map(categories.map((c) => [c.id, c.name]));

      const header =
        "id,title,category,status,priority,estimateMinutes,actualMinutes,moneyImpact,dueDate,createdAt\n";
      const rows = tasks
        .map(
          (t) =>
            `"${t.id}","${t.title.replace(/"/g, '""')}","${catMap.get(t.categoryId) ?? ""}","${t.status}",${t.priority},${t.estimateMinutes ?? ""},${Math.round(t.actualSecondsTotal / 60)},${t.moneyImpact ?? ""},"${t.dueDate ?? ""}","${t.createdAt}"`
        )
        .join("\n");

      downloadText(header + rows, "tasks_summary.csv", "text/csv");
    } else {
      const entries = await db.timeEntries.toArray();
      const header = "id,taskId,startAt,endAt,seconds,pauseReason\n";
      const rows = entries
        .map(
          (e) =>
            `"${e.id}","${e.taskId}","${e.startAt}","${e.endAt ?? ""}",${e.seconds},"${e.pauseReason ?? ""}"`
        )
        .join("\n");

      downloadText(header + rows, "time_entries.csv", "text/csv");
    }
  };

  const resetData = async () => {
    if (
      !confirm(
        "This will permanently delete all your data. Are you sure?"
      )
    )
      return;
    if (!confirm("This cannot be undone. Export first if needed. Continue?"))
      return;

    await db.delete();
    window.location.reload();
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 pb-24 md:pb-10">
      <h1 className="text-3xl font-bold tracking-tight mb-2">Settings</h1>
      <p className="text-slate-500 dark:text-slate-400 mb-10">
        Manage your data, exports, and preferences.
      </p>

      <div className="space-y-8">
        {/* Daily Capacity Defaults */}
        <section className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
          <h3 className="font-bold text-lg mb-1">Default Daily Capacity</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
            How many minutes per day you typically have available. You can
            override this on any given day from the Today page.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                Life
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={stabilizerDefault}
                  onChange={(e) =>
                    updateSetting("availableMinutes", Number(e.target.value) || 0)
                  }
                  min={0}
                  className="w-24 bg-slate-100 dark:bg-background-dark border-none rounded-xl px-4 py-3 text-lg font-bold focus:ring-2 focus:ring-primary transition-all text-center"
                />
                <span className="text-sm font-medium text-slate-400">
                  minutes / day
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                Builder (Business)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={builderDefault}
                  onChange={(e) =>
                    updateSetting("builderAvailableMinutes", Number(e.target.value) || 0)
                  }
                  min={0}
                  className="w-24 bg-slate-100 dark:bg-background-dark border-none rounded-xl px-4 py-3 text-lg font-bold focus:ring-2 focus:ring-primary transition-all text-center"
                />
                <span className="text-sm font-medium text-slate-400">
                  minutes / day
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Export Bundle */}
        <section className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
          <h3 className="font-bold text-lg mb-2">Export Share Bundle</h3>
          <p className="text-sm text-slate-500 mb-4">
            Download all your data as a JSON file. Includes categories, tasks,
            time entries, and weekly reviews.
          </p>
          <button
            onClick={exportBundle}
            className="bg-gradient-accent text-white font-bold px-6 py-3 rounded-xl shadow-lg shadow-primary/20 hover:opacity-90 transition-all flex items-center gap-2"
          >
            <span className="material-symbols-outlined">download</span>
            Export .json Bundle
          </button>
        </section>

        {/* Import Bundle */}
        <section className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
          <h3 className="font-bold text-lg mb-2">Import Share Bundle</h3>
          <p className="text-sm text-slate-500 mb-4">
            Import a previously exported bundle. This will{" "}
            <strong>overwrite</strong> all local data.
          </p>
          <label className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 cursor-pointer hover:border-primary transition-colors font-bold text-slate-600 dark:text-slate-300">
            <span className="material-symbols-outlined">upload_file</span>
            Choose .json file
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) importBundle(file);
              }}
              disabled={importing}
            />
          </label>
          {importStatus && (
            <p className="mt-3 text-sm text-slate-500">{importStatus}</p>
          )}
        </section>

        {/* CSV Export */}
        <section className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
          <h3 className="font-bold text-lg mb-2">Export CSV</h3>
          <p className="text-sm text-slate-500 mb-4">
            Download data as spreadsheet-friendly CSV files.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => exportCSV("tasks")}
              className="px-5 py-3 rounded-xl border border-slate-200 dark:border-slate-700 font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-all flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-sm">
                table_chart
              </span>
              tasks_summary.csv
            </button>
            <button
              onClick={() => exportCSV("time_entries")}
              className="px-5 py-3 rounded-xl border border-slate-200 dark:border-slate-700 font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-all flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-sm">
                schedule
              </span>
              time_entries.csv
            </button>
          </div>
        </section>

        {/* Danger Zone */}
        <section className="bg-white dark:bg-slate-900 rounded-xl border-2 border-red-200 dark:border-red-900/30 p-6">
          <h3 className="font-bold text-lg mb-2 text-red-600">Danger Zone</h3>
          <p className="text-sm text-slate-500 mb-4">
            Permanently delete all local data. This cannot be undone.
          </p>
          <button
            onClick={resetData}
            className="px-6 py-3 rounded-xl bg-red-500 text-white font-bold hover:bg-red-600 transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined">delete_forever</span>
            Reset All Data
          </button>
        </section>
      </div>
    </div>
  );
}

function downloadText(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
