import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db, generateId, nowISO } from "../db";
import { formatMinutes } from "../hooks/useTimer";

const STEPS = [
  { key: "wins", label: "Wins" },
  { key: "overview", label: "Overview" },
  { key: "friction", label: "Friction" },
  { key: "focus", label: "Category Focus" },
  { key: "scary", label: "Smallest Next Step" },
  { key: "done", label: "Complete" },
] as const;

export default function WeeklyReviewPage() {
  const tasks = useLiveQuery(() => db.tasks.toArray()) ?? [];
  const categories = useLiveQuery(() => db.categories.toArray()) ?? [];
  const reviews = useLiveQuery(() => db.weeklyReviews.toArray()) ?? [];
  const allWins = useLiveQuery(() => db.wins.toArray()) ?? [];

  const [step, setStep] = useState(0);
  const [friction, setFriction] = useState("");
  const [categoryFocus, setCategoryFocus] = useState("");
  const [scariestNextStep, setScariestNextStep] = useState("");
  const [saved, setSaved] = useState(false);

  const weekAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d;
  }, []);

  const recentWins = useMemo(() => {
    return tasks
      .filter(
        (t) =>
          (t.status === "DONE" || t.status === "ARCHIVED") &&
          t.completedAt &&
          new Date(t.completedAt) >= weekAgo
      )
      .sort(
        (a, b) =>
          new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime()
      );
  }, [tasks, weekAgo]);

  const winStats = useMemo(() => {
    const totalTime = recentWins.reduce((s, t) => s + t.actualSecondsTotal, 0);
    const totalMoney = recentWins
      .filter((t) => t.moneyImpact && t.moneyImpact > 0)
      .reduce((s, t) => s + (t.moneyImpact ?? 0), 0);
    return { count: recentWins.length, totalMinutes: Math.round(totalTime / 60), totalMoney };
  }, [recentWins]);

  const otherWinsThisWeek = useMemo(() => {
    return allWins
      .filter(
        (w) =>
          new Date(w.date) >= weekAgo
      )
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [allWins, weekAgo]);

  const mismatches = useMemo(() => {
    return tasks
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
      .sort((a, b) => Math.abs(b.ratio - 1) - Math.abs(a.ratio - 1))
      .slice(0, 5);
  }, [tasks]);

  const handleSave = async () => {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    await db.weeklyReviews.add({
      id: generateId(),
      weekStart: weekStart.toISOString(),
      answers: { friction, categoryFocus, scariestNextStep },
      createdAt: nowISO(),
    });
    setSaved(true);
  };

  const pastReviews = [...reviews].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 pb-24 md:pb-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2">
          Weekly Review
        </h1>
        <p className="text-slate-500 dark:text-slate-400">
          A 10-15 minute guided reflection to calibrate your next week.
        </p>
      </div>

      {/* Progress */}
      <div className="flex gap-2 mb-8">
        {STEPS.map((s, i) => (
          <button
            key={s.key}
            onClick={() => !saved && setStep(i)}
            className={`flex-1 h-2 rounded-full transition-all ${
              i <= step ? "bg-gradient-accent" : "bg-slate-200 dark:bg-slate-800"
            }`}
          />
        ))}
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-8 min-h-[400px] flex flex-col">
        {step === 0 && (
          <div className="flex-1 flex flex-col gap-6">
            <h2 className="text-2xl font-bold flex items-center gap-3">
              <span className="material-symbols-outlined text-3xl text-gradient">emoji_events</span>
              This Week's Wins
            </h2>
            <p className="text-slate-500 text-sm">
              Before looking at what's next, let's acknowledge what you've accomplished.
            </p>

            {recentWins.length === 0 && otherWinsThisWeek.length === 0 ? (
              <div className="text-center py-8">
                <span className="material-symbols-outlined text-4xl text-slate-300 mb-2 block">hourglass_empty</span>
                <p className="text-slate-400 italic mb-4">
                  No completed tasks this week — that's okay. Every week is a fresh start.
                </p>
                <Link
                  to="/wins"
                  className="text-sm font-medium text-primary hover:underline inline-flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-base">add_circle</span>
                  Log wins beyond your tasks
                </Link>
              </div>
            ) : (
              <>
                {recentWins.length > 0 && (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-green-50 dark:bg-green-950/20 p-4 rounded-xl border border-green-200 dark:border-green-800/40 text-center">
                        <p className="text-2xl font-bold text-green-600 dark:text-green-400">{winStats.count}</p>
                        <p className="text-xs font-semibold text-green-500 uppercase tracking-wider mt-1">Tasks Done</p>
                      </div>
                      <div className="bg-purple-50 dark:bg-purple-950/20 p-4 rounded-xl border border-purple-200 dark:border-purple-800/40 text-center">
                        <p className="text-2xl font-bold text-gradient">{formatMinutes(winStats.totalMinutes)}</p>
                        <p className="text-xs font-semibold text-purple-500 uppercase tracking-wider mt-1">Time Invested</p>
                      </div>
                      <div className="bg-pink-50 dark:bg-pink-950/20 p-4 rounded-xl border border-pink-200 dark:border-pink-800/40 text-center">
                        <p className="text-2xl font-bold text-pink-600 dark:text-pink-400">
                          {winStats.totalMoney > 0 ? `$${winStats.totalMoney.toFixed(0)}` : "—"}
                        </p>
                        <p className="text-xs font-semibold text-pink-500 uppercase tracking-wider mt-1">Money Recovered</p>
                      </div>
                    </div>

                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                      {recentWins.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg"
                    >
                      <span className="material-symbols-outlined text-green-500 text-sm">check_circle</span>
                      <span className="font-medium text-sm flex-1 truncate">{t.title}</span>
                      {t.completedAt && (
                        <span className="text-xs text-slate-400 shrink-0">
                          {new Date(t.completedAt).toLocaleDateString(undefined, { weekday: "short" })}
                        </span>
                      )}
                    </div>
                      ))}
                    </div>
                  </>
                )}

                {otherWinsThisWeek.length > 0 && (
                  <div>
                    <h4 className="text-sm font-bold text-slate-600 dark:text-slate-300 mb-2 flex items-center gap-2">
                      <span className="material-symbols-outlined text-lg">celebration</span>
                      Other wins this week
                    </h4>
                    <div className="space-y-2 max-h-[120px] overflow-y-auto">
                      {otherWinsThisWeek.map((w) => (
                        <div
                          key={w.id}
                          className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200/50 dark:border-amber-800/30"
                        >
                          <span className="material-symbols-outlined text-amber-500 text-sm">star</span>
                          <span className="font-medium text-sm flex-1">{w.text}</span>
                          {w.tags.length > 0 && (
                            <div className="flex gap-1">
                              {w.tags.map((t) => (
                                <span
                                  key={t}
                                  className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-amber-200/50 dark:bg-amber-800/30 text-amber-700 dark:text-amber-300"
                                >
                                  {t}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <Link
                    to="/wins"
                    className="text-sm font-medium text-primary hover:underline flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-base">add_circle</span>
                    Log wins beyond your tasks
                  </Link>
                </div>

                <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 rounded-xl p-4 border border-green-200/50 dark:border-green-800/30">
                  <p className="text-sm font-medium text-green-700 dark:text-green-300 italic text-center">
                    {recentWins.length >= 5
                      ? "Outstanding week. You're proving that steady progress beats perfection."
                      : recentWins.length >= 3
                        ? "Solid progress. Each task you close lightens the mental load."
                        : recentWins.length > 0
                          ? "Every completed task is evidence of your capability. Build on this."
                          : "You logged wins beyond your tasks — that counts. Celebrate the full picture."}
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="flex-1 flex flex-col gap-6">
            <h2 className="text-2xl font-bold">
              Top Estimate Mismatches
            </h2>
            <p className="text-slate-500 text-sm">
              These tasks had the biggest gap between estimated and actual time.
            </p>
            {mismatches.length === 0 ? (
              <p className="text-slate-400 italic">
                No completed tasks with time data yet. Complete some tasks with
                the timer to see mismatches.
              </p>
            ) : (
              <div className="space-y-3">
                {mismatches.map((m, i) => (
                  <div
                    key={i}
                    className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl flex justify-between items-center"
                  >
                    <span className="font-medium">{m.title}</span>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-slate-400">
                        Est: {formatMinutes(m.est)}
                      </span>
                      <span className="font-bold text-gradient">
                        Actual: {formatMinutes(m.actual)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="flex-1 flex flex-col gap-6">
            <h2 className="text-2xl font-bold">
              What created the most friction?
            </h2>
            <p className="text-slate-500 text-sm">
              Think about interruptions, unclear tasks, missing info, or energy
              drains.
            </p>
            <textarea
              className="flex-1 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border-none focus:ring-2 focus:ring-primary resize-none min-h-[200px]"
              placeholder="Write freely here..."
              value={friction}
              onChange={(e) => setFriction(e.target.value)}
              autoFocus
            />
          </div>
        )}

        {step === 3 && (
          <div className="flex-1 flex flex-col gap-6">
            <h2 className="text-2xl font-bold">
              Which category needs more dedicated blocks?
            </h2>
            <p className="text-slate-500 text-sm">
              Where did you feel most behind? Which domain would benefit from
              focused attention next week?
            </p>
            <div className="grid grid-cols-2 gap-3">
              {categories.map((cat) => (
                <label
                  key={cat.id}
                  className={`cursor-pointer p-5 rounded-xl border-2 transition-all text-center ${
                    categoryFocus === cat.name
                      ? "border-primary bg-primary/5"
                      : "border-slate-200 dark:border-slate-800 hover:border-primary/30"
                  }`}
                >
                  <input
                    type="radio"
                    className="hidden"
                    name="catFocus"
                    checked={categoryFocus === cat.name}
                    onChange={() => setCategoryFocus(cat.name)}
                  />
                  <span className="font-bold text-lg">{cat.name}</span>
                </label>
              ))}
            </div>
            <textarea
              className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border-none focus:ring-2 focus:ring-primary resize-none min-h-[100px]"
              placeholder="Additional thoughts..."
              value={categoryFocus}
              onChange={(e) => setCategoryFocus(e.target.value)}
            />
          </div>
        )}

        {step === 4 && (
          <div className="flex-1 flex flex-col gap-6">
            <h2 className="text-2xl font-bold">
              What's the smallest next step for the scariest task?
            </h2>
            <p className="text-slate-500 text-sm">
              Which task have you been avoiding? What is the absolute tiniest
              action you could take on it?
            </p>
            <textarea
              className="flex-1 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border-none focus:ring-2 focus:ring-primary resize-none min-h-[200px]"
              placeholder="e.g. Open the document and read the first paragraph..."
              value={scariestNextStep}
              onChange={(e) => setScariestNextStep(e.target.value)}
              autoFocus
            />
          </div>
        )}

        {step === 5 && (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-6">
            {saved ? (
              <>
                <div className="size-20 bg-primary/5 rounded-full flex items-center justify-center">
                  <span className="material-symbols-outlined text-5xl text-gradient">
                    auto_awesome
                  </span>
                </div>
                <h2 className="text-2xl font-bold">Review Saved</h2>
                <p className="text-slate-500 max-w-md">
                  Great reflection. Your answers will help calibrate next week's
                  suggestions. Take a breath — you've done the work.
                </p>
              </>
            ) : (
              <>
                <h2 className="text-2xl font-bold">Ready to save?</h2>
                <p className="text-slate-500 max-w-md">
                  Your weekly review captures friction points, focus areas, and
                  your next brave step.
                </p>
                <button
                  onClick={handleSave}
                  className="bg-gradient-accent text-white font-bold px-8 py-4 rounded-xl shadow-lg shadow-primary/20 hover:opacity-90 transition-all"
                >
                  Save Weekly Review
                </button>
              </>
            )}
          </div>
        )}

        {/* Navigation */}
        {!saved && (
          <div className="flex justify-between mt-8 pt-6 border-t border-slate-100 dark:border-slate-800">
            <button
              onClick={() => setStep(Math.max(0, step - 1))}
              disabled={step === 0}
              className="px-6 py-3 rounded-xl border border-slate-200 dark:border-slate-700 font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all disabled:opacity-30"
            >
              Back
            </button>
            <button
              onClick={() => setStep(Math.min(STEPS.length - 1, step + 1))}
              disabled={step === STEPS.length - 1}
              className="px-6 py-3 rounded-xl bg-gradient-accent text-white font-bold shadow-lg shadow-primary/20 hover:opacity-90 transition-all disabled:opacity-30"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Past Reviews */}
      {pastReviews.length > 0 && (
        <div className="mt-12">
          <h3 className="text-lg font-bold mb-4">Past Reviews</h3>
          <div className="space-y-3">
            {pastReviews.map((r) => (
              <div
                key={r.id}
                className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800"
              >
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-bold">
                    Week of{" "}
                    {new Date(r.weekStart).toLocaleDateString()}
                  </span>
                  <span className="text-xs text-slate-400">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </span>
                </div>
                {r.answers.friction && (
                  <p className="text-sm text-slate-500 mb-1">
                    <strong>Friction:</strong> {r.answers.friction}
                  </p>
                )}
                {r.answers.categoryFocus && (
                  <p className="text-sm text-slate-500 mb-1">
                    <strong>Focus:</strong> {r.answers.categoryFocus}
                  </p>
                )}
                {r.answers.scariestNextStep && (
                  <p className="text-sm text-slate-500">
                    <strong>Next step:</strong> {r.answers.scariestNextStep}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
