import { useState, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import type { TaskDomain } from "../db";
import { formatMinutes } from "../hooks/useTimer";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LineChart,
  Line,
} from "recharts";

type FilterTab = "All" | "Stabilizer" | "Builder";

export default function DashboardPage() {
  const [filterTab, setFilterTab] = useState<FilterTab>("All");
  const settings = useLiveQuery(() => db.appSettings.get("default"));
  const tasks = useLiveQuery(() => db.tasks.toArray()) ?? [];
  const categories = useLiveQuery(() => db.categories.toArray()) ?? [];
  const timeEntries = useLiveQuery(() => db.timeEntries.toArray()) ?? [];
  const isDark = settings?.darkMode ?? false;

  const chartTooltipStyle = useMemo(
    () =>
      isDark
        ? {
            contentStyle: {
              backgroundColor: "#1e293b",
              color: "#f1f5f9",
              border: "1px solid #334155",
              borderRadius: "0.5rem",
              padding: "0.5rem 0.75rem",
            },
            labelStyle: { color: "#f1f5f9" },
            itemStyle: { color: "#f1f5f9" },
          }
        : {
            contentStyle: {
              backgroundColor: "#fff",
              color: "#334155",
              border: "1px solid #e2e8f0",
              borderRadius: "0.5rem",
              padding: "0.5rem 0.75rem",
            },
            labelStyle: { color: "#334155" },
            itemStyle: { color: "#334155" },
          },
    [isDark]
  );

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400000);

  const domain: TaskDomain | null =
    filterTab === "Stabilizer" ? "LIFE_ADMIN" : filterTab === "Builder" ? "BUSINESS" : null;

  const filteredTasks = useMemo(() => {
    if (!domain) return tasks;
    return tasks.filter((t) => t.domain === domain);
  }, [tasks, domain]);

  const filteredTaskIds = useMemo(
    () => new Set(filteredTasks.map((t) => t.id)),
    [filteredTasks]
  );

  const filteredTimeEntries = useMemo(() => {
    if (!domain) return timeEntries;
    return timeEntries.filter((e) => filteredTaskIds.has(e.taskId));
  }, [timeEntries, filteredTaskIds, domain]);

  const filteredCategories = useMemo(() => {
    if (!domain) return categories;
    return categories.filter((c) => c.domain === domain);
  }, [categories, domain]);

  const stats = useMemo(() => {
    const recentDone = filteredTasks.filter(
      (t) => (t.status === "DONE" || t.status === "ARCHIVED") &&
        t.completedAt && new Date(t.completedAt) >= weekAgo
    );
    const completedCount = recentDone.length;

    const recentEntries = filteredTimeEntries.filter(
      (e) => e.endAt && new Date(e.startAt) >= weekAgo
    );
    const totalSeconds = recentEntries.reduce((s, e) => s + e.seconds, 0);

    const moneyRecovered = recentDone
      .filter((t) => t.moneyImpact && t.moneyImpact > 0)
      .reduce((s, t) => s + (t.moneyImpact ?? 0), 0);

    const openLoops = filteredTasks.filter(
      (t) => t.status !== "DONE" && t.status !== "ARCHIVED"
    ).length;

    return { completedCount, totalSeconds, moneyRecovered, openLoops };
  }, [filteredTasks, filteredTimeEntries, weekAgo]);

  const catChartData = useMemo(() => {
    return filteredCategories.map((cat) => {
      const catTasks = filteredTasks.filter((t) => t.categoryId === cat.id);
      const planned = catTasks.reduce(
        (s, t) => s + (t.estimateMinutes ?? 0),
        0
      );
      const actual = Math.round(
        catTasks.reduce((s, t) => s + t.actualSecondsTotal, 0) / 60
      );
      return { name: cat.name, Planned: planned, Actual: actual };
    });
  }, [filteredCategories, filteredTasks]);

  const openLoopsTrend = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      const dayName = d.toLocaleDateString("en-US", { weekday: "short" });
      const openAtDay = filteredTasks.filter((t) => {
        if (t.status === "DONE" || t.status === "ARCHIVED") {
          const doneDate = new Date(t.completedAt ?? t.updatedAt);
          return doneDate > d;
        }
        return new Date(t.createdAt) <= d;
      }).length;
      days.push({ day: dayName, count: Math.max(openAtDay, 0) });
    }
    return days;
  }, [filteredTasks, now]);

  const frictionItems = useMemo(() => {
    const items: Array<{ type: string; text: string; note: string }> = [];
    const recentEntries = filteredTimeEntries.filter(
      (e) => e.pauseReason && new Date(e.startAt) >= weekAgo
    );
    const reasons = new Map<string, number>();
    recentEntries.forEach((e) => {
      const r = e.pauseReason!;
      reasons.set(r, (reasons.get(r) ?? 0) + 1);
    });
    reasons.forEach((count, reason) => {
      items.push({
        type: "Pause",
        text: `"${reason}" interruption occurred ${count} time(s)`,
        note: "Consider batching or blocking time for this.",
      });
    });

    filteredTasks
      .filter((t) => t.frictionNote && t.status !== "DONE" && t.status !== "ARCHIVED")
      .slice(0, 5)
      .forEach((t) => {
        items.push({
          type: "Task Friction",
          text: `${t.title}: ${t.frictionNote}`,
          note: "Address the root cause to unblock progress.",
        });
      });

    const mismatches = filteredTasks
      .filter(
        (t) =>
          (t.status === "DONE" || t.status === "ARCHIVED") &&
          t.estimateMinutes &&
          t.actualSecondsTotal > 0
      )
      .map((t) => ({
        title: t.title,
        est: t.estimateMinutes!,
        actual: Math.round(t.actualSecondsTotal / 60),
        ratio: t.actualSecondsTotal / 60 / t.estimateMinutes!,
      }))
      .filter((m) => m.ratio > 1.5 || m.ratio < 0.5)
      .sort((a, b) => Math.abs(b.ratio - 1) - Math.abs(a.ratio - 1))
      .slice(0, 3);

    mismatches.forEach((m) => {
      items.push({
        type: m.ratio > 1 ? "Over-estimate" : "Under-estimate",
        text: `${m.title}: estimated ${formatMinutes(m.est)}, actual ${formatMinutes(m.actual)}`,
        note: "Calibrate future estimates based on this.",
      });
    });

    return items;
  }, [filteredTasks, filteredTimeEntries, weekAgo]);

  const typeColors: Record<string, string> = {
    Pause: "border-primary/40",
    "Task Friction": "border-accent-pink/40",
    "Over-estimate": "border-amber-400/40",
    "Under-estimate": "border-emerald-400/40",
  };
  const typeLabelColors: Record<string, string> = {
    Pause: "text-primary",
    "Task Friction": "text-accent-pink",
    "Over-estimate": "text-amber-600",
    "Under-estimate": "text-emerald-600",
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 nav:px-12 pb-24 md:pb-8">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-black tracking-tight">
            Weekly Dashboard
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium">
            {weekAgo.toLocaleDateString()} –{" "}
            {now.toLocaleDateString()} • Retrospective
          </p>
        </div>
        <div className="flex p-1.5 rounded-xl bg-slate-200 dark:bg-card-dark border border-slate-300 dark:border-border-dark w-full md:w-auto max-w-sm">
          {(["All", "Stabilizer", "Builder"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setFilterTab(t)}
              className={`flex cursor-pointer h-10 flex-1 md:flex-initial md:min-w-[100px] items-center justify-center overflow-hidden rounded-lg px-4 transition-all text-sm font-semibold ${
                filterTab === t
                  ? "bg-gradient-accent text-white shadow-lg shadow-primary/20"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </header>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-1">
            Tasks Completed
          </p>
          <span className="text-2xl font-bold text-gradient">
            {stats.completedCount}
          </span>
        </div>
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-1">
            Time Tracked
          </p>
          <span className="text-2xl font-bold">
            {formatMinutes(Math.round(stats.totalSeconds / 60))}
          </span>
        </div>
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border-2 border-primary/20 shadow-sm">
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-1">
            Money Recovered
          </p>
          <span className="text-2xl font-bold text-gradient">
            ${stats.moneyRecovered.toFixed(2)}
          </span>
        </div>
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-1">
            Open Loops
          </p>
          <span className="text-2xl font-bold text-gradient">
            {stats.openLoops}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          {/* Time Allocation */}
          <section className="bg-white dark:bg-slate-900 p-8 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="mb-6">
              <h3 className="text-lg font-bold">Time Allocation by Category</h3>
              <p className="text-sm text-slate-500">
                Planned vs actual minutes
              </p>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={catChartData}>
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip {...chartTooltipStyle} />
                  <Legend />
                  <Bar
                    dataKey="Planned"
                    fill="rgba(168, 85, 247, 0.3)"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="Actual"
                    fill="url(#barGradient)"
                    radius={[4, 4, 0, 0]}
                  />
                  <defs>
                    <linearGradient
                      id="barGradient"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="0%" stopColor="#a855f7" />
                      <stop offset="100%" stopColor="#ec4899" />
                    </linearGradient>
                  </defs>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Open Loops Trend */}
          <section className="bg-white dark:bg-slate-900 p-8 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-bold">Open Loops Trend</h3>
                <p className="text-sm text-slate-500">
                  Unfinished tasks creating mental drag
                </p>
              </div>
              {stats.openLoops > 10 && (
                <span className="text-xs font-bold px-2 py-1 bg-pink-50 dark:bg-pink-950/30 text-pink-600 rounded">
                  Attention Needed
                </span>
              )}
            </div>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={openLoopsTrend}>
                  <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip {...chartTooltipStyle} />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="#a855f7"
                    strokeWidth={2}
                    dot={{ fill: "#a855f7" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>

        {/* Friction Log */}
        <section className="bg-white dark:bg-slate-900 p-8 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="mb-6">
            <h3 className="text-lg font-bold">Friction Log</h3>
            <p className="text-sm text-slate-500">
              Bottlenecks identified this week
            </p>
          </div>
          <div className="space-y-4">
            {frictionItems.length === 0 && (
              <p className="text-sm text-slate-400 italic">
                No friction points logged yet. Add friction notes to tasks or
                use pause reasons on your timer.
              </p>
            )}
            {frictionItems.map((item, i) => (
              <div
                key={i}
                className={`p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border-l-4 ${typeColors[item.type] ?? "border-slate-300"}`}
              >
                <p
                  className={`text-xs font-bold uppercase tracking-wider mb-1 ${typeLabelColors[item.type] ?? "text-slate-500"}`}
                >
                  {item.type}
                </p>
                <p className="text-sm font-medium">{item.text}</p>
                <p className="text-[10px] text-slate-400 mt-2 italic">
                  {item.note}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <footer className="mt-12 p-8 vibrant-gradient-soft rounded-xl border border-primary/10 flex flex-col md:flex-row items-center gap-6">
        <div className="w-12 h-12 rounded-full bg-gradient-accent flex items-center justify-center shrink-0 text-white shadow-lg shadow-primary/20">
          <span className="material-symbols-outlined text-2xl">
            auto_awesome
          </span>
        </div>
        <div>
          <h4 className="font-bold text-primary">Stabilization Insight</h4>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            You have <strong>{stats.openLoops} open loops</strong> creating
            mental drag. Focus on completing small tasks first to build momentum
            and reduce cognitive load.
          </p>
        </div>
      </footer>
    </div>
  );
}
