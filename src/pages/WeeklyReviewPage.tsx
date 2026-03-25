import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useTasks, useCategories, useWeeklyReviews, useWins } from "../hooks/useData";
import {
  generateId,
  nowISO,
  addWeeklyReview,
  updateWeeklyReview,
  getMondayOfWeek,
} from "../db";
import type { WeeklyReview } from "../db";
import { formatMinutes } from "../hooks/useTimer";

const STEPS = [
  { key: "wins", label: "Wins" },
  { key: "overview", label: "Overview" },
  { key: "friction", label: "Friction" },
  { key: "focus", label: "Category Focus" },
  { key: "scary", label: "Smallest Next Step" },
  { key: "done", label: "Complete" },
] as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

function getSundayOfWeek(monday: Date): Date {
  const d = new Date(monday);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

function formatWeekRange(monday: Date): string {
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  const fmt = (d: Date) =>
    `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
  return `${fmt(monday)} – ${fmt(sunday)}`;
}

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * Old reviews stored a Sunday-based weekStart; new ones store Monday.
 * Normalize both to Monday so the queue and past-reviews map correctly.
 */
function normalizeWeekStartToMonday(weekStart: string): Date {
  const d = new Date(weekStart);
  if (d.getDay() === 0) {
    d.setDate(d.getDate() + 1);
  }
  d.setHours(0, 0, 0, 0);
  return d;
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function WeeklyReviewPage() {
  const { data: tasks = [] } = useTasks();
  const { data: categories = [] } = useCategories();
  const { data: reviews = [] } = useWeeklyReviews();
  const { data: allWins = [] } = useWins();

  // Wizard state
  const [step, setStep] = useState(0);
  const [friction, setFriction] = useState("");
  const [categoryFocus, setCategoryFocus] = useState("");
  const [scariestNextStep, setScariestNextStep] = useState("");
  const [saved, setSaved] = useState(false);
  const [savedWeekLabel, setSavedWeekLabel] = useState("");
  // Override: review a specific (skipped) week instead of the queue head
  const [overrideWeekKey, setOverrideWeekKey] = useState<string | null>(null);

  const resetWizard = () => {
    setStep(0);
    setFriction("");
    setCategoryFocus("");
    setScariestNextStep("");
    setSaved(false);
    setSavedWeekLabel("");
  };

  // ── Week computations ────────────────────────────────────────────────────

  const currentMonday = useMemo(() => getMondayOfWeek(new Date()), []);

  // Review unlocks Sunday at noon of the reviewed week
  const isSundayAfternoon = useMemo(() => {
    const now = new Date();
    return now.getDay() === 0 && now.getHours() >= 12;
  }, []);

  const nextReviewDate = useMemo(() => {
    const thisSunday = new Date(currentMonday);
    thisSunday.setDate(thisSunday.getDate() + 6);
    thisSunday.setHours(12, 0, 0, 0);

    const now = new Date();
    if (now < thisSunday) return thisSunday;
    const nextSunday = new Date(thisSunday);
    nextSunday.setDate(nextSunday.getDate() + 7);
    return nextSunday;
  }, [currentMonday]);

  // Map: mondayKey → review (excluding dismissed so those weeks re-enter the queue)
  const reviewsByWeek = useMemo(() => {
    const map = new Map<string, WeeklyReview>();
    for (const r of reviews) {
      if (r.status === "dismissed") continue;
      const monday = normalizeWeekStartToMonday(r.weekStart);
      map.set(dateKey(monday), r);
    }
    return map;
  }, [reviews]);

  // Up to 3 past weeks (+ current week on Sunday afternoon) with no review, oldest first
  const pendingWeeks = useMemo(() => {
    const weeks: Date[] = [];
    const startI = isSundayAfternoon ? 0 : 1;
    for (let i = startI; i <= 3; i++) {
      const monday = new Date(currentMonday);
      monday.setDate(monday.getDate() - 7 * i);
      if (!reviewsByWeek.has(dateKey(monday))) {
        weeks.push(monday);
      }
    }
    return weeks.sort((a, b) => a.getTime() - b.getTime());
  }, [currentMonday, reviewsByWeek, isSundayAfternoon]);

  // Active review week: override (re-doing skipped) > queue head > null
  const activeWeek = useMemo(() => {
    if (overrideWeekKey) return parseDateKey(overrideWeekKey);
    return pendingWeeks.length > 0 ? pendingWeeks[0] : null;
  }, [overrideWeekKey, pendingWeeks]);

  const existingReview = activeWeek ? reviewsByWeek.get(dateKey(activeWeek)) : undefined;
  const isRedoingSkipped = !!existingReview && existingReview.status === "skipped";

  // How many more pending AFTER the current one
  const queueRemaining = overrideWeekKey
    ? pendingWeeks.length
    : Math.max(0, pendingWeeks.length - 1);

  // ── Week-scoped data (for the review wizard) ────────────────────────────

  const weekEnd = activeWeek ? getSundayOfWeek(activeWeek) : null;

  const scopedTasks = useMemo(() => {
    if (!activeWeek || !weekEnd) return [];
    return tasks
      .filter(
        (t) =>
          (t.status === "DONE" || t.status === "ARCHIVED") &&
          t.completedAt &&
          new Date(t.completedAt) >= activeWeek &&
          new Date(t.completedAt) <= weekEnd
      )
      .sort(
        (a, b) =>
          new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime()
      );
  }, [tasks, activeWeek, weekEnd]);

  const scopedStats = useMemo(() => {
    const totalTime = scopedTasks.reduce((s, t) => s + t.actualSecondsTotal, 0);
    const totalMoney = scopedTasks
      .filter((t) => t.moneyImpact && t.moneyImpact > 0)
      .reduce((s, t) => s + (t.moneyImpact ?? 0), 0);
    return {
      count: scopedTasks.length,
      totalMinutes: Math.round(totalTime / 60),
      totalMoney,
    };
  }, [scopedTasks]);

  const scopedOtherWins = useMemo(() => {
    if (!activeWeek || !weekEnd) return [];
    return allWins
      .filter((w) => {
        const d = new Date(w.date);
        return d >= activeWeek && d <= weekEnd;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [allWins, activeWeek, weekEnd]);

  const scopedMismatches = useMemo(() => {
    return scopedTasks
      .filter((t) => t.estimateMinutes && t.actualSecondsTotal > 0)
      .map((t) => ({
        title: t.title,
        est: t.estimateMinutes!,
        actual: Math.round(t.actualSecondsTotal / 60),
        ratio: t.actualSecondsTotal / 60 / t.estimateMinutes!,
      }))
      .sort((a, b) => Math.abs(b.ratio - 1) - Math.abs(a.ratio - 1))
      .slice(0, 5);
  }, [scopedTasks]);

  // ── Current-week read-only data ──────────────────────────────────────────

  const currentWeekTasks = useMemo(() => {
    const now = new Date();
    return tasks
      .filter(
        (t) =>
          (t.status === "DONE" || t.status === "ARCHIVED") &&
          t.completedAt &&
          new Date(t.completedAt) >= currentMonday &&
          new Date(t.completedAt) <= now
      )
      .sort(
        (a, b) =>
          new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime()
      );
  }, [tasks, currentMonday]);

  const currentWeekStats = useMemo(() => {
    const totalTime = currentWeekTasks.reduce((s, t) => s + t.actualSecondsTotal, 0);
    const totalMoney = currentWeekTasks
      .filter((t) => t.moneyImpact && t.moneyImpact > 0)
      .reduce((s, t) => s + (t.moneyImpact ?? 0), 0);
    return {
      count: currentWeekTasks.length,
      totalMinutes: Math.round(totalTime / 60),
      totalMoney,
    };
  }, [currentWeekTasks]);

  const currentWeekOtherWins = useMemo(() => {
    const now = new Date();
    return allWins
      .filter((w) => {
        const d = new Date(w.date);
        return d >= currentMonday && d <= now;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [allWins, currentMonday]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!activeWeek) return;
    const answers = { friction, categoryFocus, scariestNextStep };

    if (isRedoingSkipped && existingReview) {
      await updateWeeklyReview(existingReview.id, "completed", answers);
    } else {
      await addWeeklyReview({
        id: generateId(),
        weekStart: activeWeek.toISOString(),
        status: "completed",
        answers,
        createdAt: nowISO(),
      });
    }
    setSavedWeekLabel(formatWeekRange(activeWeek));
    setSaved(true);
  };

  const handleSkip = async () => {
    if (!activeWeek) return;
    await addWeeklyReview({
      id: generateId(),
      weekStart: activeWeek.toISOString(),
      status: "skipped",
      answers: {},
      createdAt: nowISO(),
    });
    resetWizard();
  };

  const handleContinue = () => {
    setOverrideWeekKey(null);
    resetWizard();
  };

  const handleAddReviewToSkipped = (review: WeeklyReview) => {
    const monday = normalizeWeekStartToMonday(review.weekStart);
    setOverrideWeekKey(dateKey(monday));
    resetWizard();
  };

  const handleDismissSkipped = async (reviewId: string) => {
    await updateWeeklyReview(reviewId, "dismissed", {});
  };

  const handleEditReview = async (id: string, answers: WeeklyReview["answers"]) => {
    await updateWeeklyReview(id, "completed", answers);
  };

  const handleCancelOverride = () => {
    setOverrideWeekKey(null);
    resetWizard();
  };

  // ── Past reviews (visible in every view) ─────────────────────────────────

  const pastReviews = useMemo(
    () =>
      [...reviews]
        .filter((r) => r.status !== "dismissed")
        .sort(
          (a, b) =>
            new Date(b.weekStart).getTime() - new Date(a.weekStart).getTime()
        ),
    [reviews]
  );

  // ═══════════════════════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  // ── 1. Saved confirmation ────────────────────────────────────────────────
  if (saved) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6 pb-24 md:pb-6">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 flex flex-col items-center justify-center text-center gap-4">
          <div className="size-14 bg-primary/5 rounded-full flex items-center justify-center">
            <span className="material-symbols-outlined text-4xl text-gradient">
              auto_awesome
            </span>
          </div>
          <h2 className="text-xl font-bold">Review Saved</h2>
          <p className="text-slate-500 text-sm max-w-md">
            Great reflection on week{" "}
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              {savedWeekLabel}
            </span>
            . Your answers will help calibrate your next week.
          </p>
          <button
            onClick={handleContinue}
            className="bg-gradient-accent text-white font-bold px-6 py-2.5 rounded-xl shadow-lg shadow-primary/20 hover:opacity-90 transition-all"
          >
            {pendingWeeks.length > 0 ? "Continue to Next Review" : "Done"}
          </button>
        </div>

        <PastReviewsList
          reviews={pastReviews}
          onAddReview={handleAddReviewToSkipped}
          onDismiss={handleDismissSkipped}
          onEdit={handleEditReview}
        />
      </div>
    );
  }

  // ── 2. Review wizard (queue or override) ─────────────────────────────────
  if (activeWeek) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-5 pb-24 md:pb-5">
        {/* Header */}
        <div className="mb-4">
          <h1 className="text-2xl font-bold tracking-tight mb-1">
          <span className="material-symbols-outlined text-xl text-gradient">
            emoji_events
          </span> Weekly Review
          </h1>
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Reviewing:{" "}
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                Week {formatWeekRange(activeWeek)}
              </span>
            </p>
            {queueRemaining > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                +{queueRemaining} more pending
              </span>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="flex gap-1.5 mb-4">
          {STEPS.map((s, i) => (
            <button
              key={s.key}
              onClick={() => setStep(i)}
              className={`flex-1 h-1.5 rounded-full transition-all ${
                i <= step
                  ? "bg-gradient-accent"
                  : "bg-slate-200 dark:bg-slate-800"
              }`}
            />
          ))}
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 flex flex-col">
          {step === 0 && (
            <WinsStep
              tasks={scopedTasks}
              stats={scopedStats}
              otherWins={scopedOtherWins}
            />
          )}

          {step === 1 && <MismatchesStep mismatches={scopedMismatches} />}

          {step === 2 && (
            <div className="flex-1 flex flex-col gap-4">
              <h2 className="text-xl font-bold">
                What created the most friction?
              </h2>
              <p className="text-slate-500 text-sm">
                Think about interruptions, unclear tasks, missing info, or
                energy drains.
              </p>
              <textarea
                className="flex-1 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border-none focus:ring-2 focus:ring-primary resize-none min-h-[130px]"
                placeholder="Write freely here..."
                value={friction}
                onChange={(e) => setFriction(e.target.value)}
                autoFocus
              />
            </div>
          )}

          {step === 3 && (
            <div className="flex-1 flex flex-col gap-4">
              <h2 className="text-xl font-bold">
                Which category needs more dedicated blocks?
              </h2>
              <p className="text-slate-500 text-sm">
                Where did you feel most behind? Which domain would benefit from
                focused attention next week?
              </p>
              <div className="grid grid-cols-3 gap-2">
                {categories.map((cat) => (
                  <label
                    key={cat.id}
                    className={`cursor-pointer px-3 py-2.5 rounded-xl border-2 transition-all text-center ${
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
                    <span className="font-semibold text-sm">{cat.name}</span>
                  </label>
                ))}
              </div>
              <textarea
                className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border-none focus:ring-2 focus:ring-primary resize-none min-h-[80px]"
                placeholder="Additional thoughts..."
                value={categoryFocus}
                onChange={(e) => setCategoryFocus(e.target.value)}
              />
            </div>
          )}

          {step === 4 && (
            <div className="flex-1 flex flex-col gap-4">
              <h2 className="text-xl font-bold">
                What&rsquo;s the smallest next step for the scariest task?
              </h2>
              <p className="text-slate-500 text-sm">
                Which task have you been avoiding? What is the absolute tiniest
                action you could take on it?
              </p>
              <textarea
                className="flex-1 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border-none focus:ring-2 focus:ring-primary resize-none min-h-[130px]"
                placeholder="e.g. Open the document and read the first paragraph..."
                value={scariestNextStep}
                onChange={(e) => setScariestNextStep(e.target.value)}
                autoFocus
              />
            </div>
          )}

          {step === 5 && (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-4">
              <h2 className="text-xl font-bold">Ready to save?</h2>
              <p className="text-slate-500 text-sm max-w-md">
                Your weekly review for week{" "}
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {formatWeekRange(activeWeek)}
                </span>{" "}
                captures friction points, focus areas, and your next brave step.
              </p>
              <button
                onClick={handleSave}
                className="bg-gradient-accent text-white font-bold px-6 py-3 rounded-xl shadow-lg shadow-primary/20 hover:opacity-90 transition-all"
              >
                Save Weekly Review
              </button>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">
            <div className="flex gap-2">
              <button
                onClick={() => setStep(Math.max(0, step - 1))}
                disabled={step === 0}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-semibold text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all disabled:opacity-30"
              >
                Back
              </button>
              {overrideWeekKey ? (
                <button
                  onClick={handleCancelOverride}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-semibold text-sm text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                >
                  Cancel
                </button>
              ) : (
                <button
                  onClick={handleSkip}
                  className="px-4 py-2 rounded-xl border border-amber-200 dark:border-amber-800/40 font-semibold text-sm text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-all"
                >
                  Skip This Week
                </button>
              )}
            </div>
            <button
              onClick={() => setStep(Math.min(STEPS.length - 1, step + 1))}
              disabled={step === STEPS.length - 1}
              className="px-4 py-2 rounded-xl bg-gradient-accent text-white font-bold text-sm shadow-lg shadow-primary/20 hover:opacity-90 transition-all disabled:opacity-30"
            >
              Next
            </button>
          </div>
        </div>

        <PastReviewsList
          reviews={pastReviews}
          onAddReview={handleAddReviewToSkipped}
          onDismiss={handleDismissSkipped}
          onEdit={handleEditReview}
        />
      </div>
    );
  }

  // ── 3. Current-week read-only view (all caught up) ───────────────────────
  return (
    <div className="max-w-3xl mx-auto px-4 py-5 pb-24 md:pb-5">
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight mb-1">
          Weekly Review
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          This week: {" "}
          <span className="font-semibold text-slate-700 dark:text-slate-200">
            Week {formatWeekRange(currentMonday)}
          </span>
        </p>
      </div>

      {/* Next-review banner */}
      <div className="bg-blue-50 dark:bg-blue-950/20 rounded-xl border border-blue-200 dark:border-blue-800/40 px-4 py-3 mb-4 flex items-center gap-3">
        <span className="material-symbols-outlined text-xl text-blue-500">
          event
        </span>
        <div>
          <p className="font-semibold text-sm text-blue-700 dark:text-blue-300">
            All caught up!
          </p>
          <p className="text-xs text-blue-600/80 dark:text-blue-400/80">
            Next review available{" "}
            <span className="font-bold">
              {nextReviewDate.toLocaleDateString(undefined, {
                weekday: "long",
                month: "short",
                day: "numeric",
                year: "numeric",
              })}{" "}
              at noon
            </span>
          </p>
        </div>
      </div>

      {/* Current-week stats */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5">
        <h2 className="text-base font-bold flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-xl text-gradient">
            emoji_events
          </span>
          This Week So Far
        </h2>

        {currentWeekTasks.length === 0 && currentWeekOtherWins.length === 0 ? (
          <div className="text-center py-6">
            <span className="material-symbols-outlined text-3xl text-slate-300 mb-1 block">
              hourglass_empty
            </span>
            <p className="text-slate-400 text-sm italic mb-3">
              No completed tasks yet this week — you&rsquo;re just getting
              started.
            </p>
            <Link
              to="/wins"
              className="text-sm font-medium text-primary hover:underline inline-flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-base">
                add_circle
              </span>
              Log wins beyond your tasks
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {currentWeekTasks.length > 0 && (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-green-50 dark:bg-green-950/20 p-3 rounded-xl border border-green-200 dark:border-green-800/40 text-center">
                    <p className="text-xl font-bold text-green-600 dark:text-green-400">
                      {currentWeekStats.count}
                    </p>
                    <p className="text-[10px] font-semibold text-green-500 uppercase tracking-wider mt-0.5">
                      Tasks Done
                    </p>
                  </div>
                  <div className="bg-purple-50 dark:bg-purple-950/20 p-3 rounded-xl border border-purple-200 dark:border-purple-800/40 text-center">
                    <p className="text-xl font-bold text-gradient">
                      {formatMinutes(currentWeekStats.totalMinutes)}
                    </p>
                    <p className="text-[10px] font-semibold text-purple-500 uppercase tracking-wider mt-0.5">
                      Time Invested
                    </p>
                  </div>
                  <div className="bg-pink-50 dark:bg-pink-950/20 p-3 rounded-xl border border-pink-200 dark:border-pink-800/40 text-center">
                    <p className="text-xl font-bold text-pink-600 dark:text-pink-400">
                      {currentWeekStats.totalMoney > 0
                        ? `$${currentWeekStats.totalMoney.toFixed(0)}`
                        : "—"}
                    </p>
                    <p className="text-[10px] font-semibold text-pink-500 uppercase tracking-wider mt-0.5">
                      Money Recovered
                    </p>
                  </div>
                </div>

                <div className="space-y-1">
                  {currentWeekTasks.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg"
                    >
                      <span className="material-symbols-outlined text-green-500 text-sm">
                        check_circle
                      </span>
                      <span className="font-medium text-sm flex-1 truncate">
                        {t.title}
                      </span>
                      {t.completedAt && (
                        <span className="text-xs text-slate-400 shrink-0">
                          {new Date(t.completedAt).toLocaleDateString(
                            undefined,
                            { weekday: "short" }
                          )}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            {currentWeekOtherWins.length > 0 && (
              <div>
                <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-base">celebration</span>
                  Other wins this week
                </h4>
                <div className="space-y-1">
                  {currentWeekOtherWins.map((w) => (
                    <div
                      key={w.id}
                      className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200/50 dark:border-amber-800/30"
                    >
                      <span className="material-symbols-outlined text-amber-500 text-sm">
                        star
                      </span>
                      <span className="font-medium text-sm flex-1">
                        {w.text}
                      </span>
                      {w.tags.length > 0 && (
                        <div className="flex gap-1 shrink-0">
                          {w.tags.map((tag) => (
                            <span
                              key={tag}
                              className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-amber-200/50 dark:bg-amber-800/30 text-amber-700 dark:text-amber-300"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Link
              to="/wins"
              className="text-sm font-medium text-primary hover:underline flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-base">
                add_circle
              </span>
              Log wins beyond your tasks
            </Link>
          </div>
        )}
      </div>

      <PastReviewsList
        reviews={pastReviews}
        onAddReview={handleAddReviewToSkipped}
        onDismiss={handleDismissSkipped}
        onEdit={handleEditReview}
      />
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function WinsStep({
  tasks,
  stats,
  otherWins,
}: {
  tasks: Array<{
    id: string;
    title: string;
    completedAt?: string;
  }>;
  stats: { count: number; totalMinutes: number; totalMoney: number };
  otherWins: Array<{
    id: string;
    text: string;
    date: string;
    tags: string[];
  }>;
}) {
  return (
    <div className="flex-1 flex flex-col gap-4">
      <p className="text-slate-500 text-sm">
        Before looking at what&rsquo;s next, let&rsquo;s acknowledge what you
        accomplished.
      </p>

      {tasks.length === 0 && otherWins.length === 0 ? (
        <div className="text-center py-6">
          <span className="material-symbols-outlined text-3xl text-slate-300 mb-1 block">
            hourglass_empty
          </span>
          <p className="text-slate-400 text-sm italic mb-3">
            No completed tasks this week — that&rsquo;s okay. Every week is a
            fresh start.
          </p>
          <Link
            to="/wins"
            className="text-sm font-medium text-primary hover:underline inline-flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-base">
              add_circle
            </span>
            Log wins beyond your tasks
          </Link>
        </div>
      ) : (
        <>
          {tasks.length > 0 && (
            <>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-green-50 dark:bg-green-950/20 p-3 rounded-xl border border-green-200 dark:border-green-800/40 text-center">
                  <p className="text-xl font-bold text-green-600 dark:text-green-400">
                    {stats.count}
                  </p>
                  <p className="text-[10px] font-semibold text-green-500 uppercase tracking-wider mt-0.5">
                    Tasks Done
                  </p>
                </div>
                <div className="bg-purple-50 dark:bg-purple-950/20 p-3 rounded-xl border border-purple-200 dark:border-purple-800/40 text-center">
                  <p className="text-xl font-bold text-gradient">
                    {formatMinutes(stats.totalMinutes)}
                  </p>
                  <p className="text-[10px] font-semibold text-purple-500 uppercase tracking-wider mt-0.5">
                    Time Invested
                  </p>
                </div>
                <div className="bg-pink-50 dark:bg-pink-950/20 p-3 rounded-xl border border-pink-200 dark:border-pink-800/40 text-center">
                  <p className="text-xl font-bold text-pink-600 dark:text-pink-400">
                    {stats.totalMoney > 0
                      ? `$${stats.totalMoney.toFixed(0)}`
                      : "—"}
                  </p>
                  <p className="text-[10px] font-semibold text-pink-500 uppercase tracking-wider mt-0.5">
                    Money Recovered
                  </p>
                </div>
              </div>

              <div className="space-y-1">
                {tasks.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg"
                  >
                    <span className="material-symbols-outlined text-green-500 text-sm">
                      check_circle
                    </span>
                    <span className="font-medium text-sm flex-1 truncate">
                      {t.title}
                    </span>
                    {t.completedAt && (
                      <span className="text-xs text-slate-400 shrink-0">
                        {new Date(t.completedAt).toLocaleDateString(undefined, {
                          weekday: "short",
                        })}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {otherWins.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-base">celebration</span>
                Other wins this week
              </h4>
              <div className="space-y-1">
                {otherWins.map((w) => (
                  <div
                    key={w.id}
                    className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200/50 dark:border-amber-800/30"
                  >
                    <span className="material-symbols-outlined text-amber-500 text-sm">
                      star
                    </span>
                    <span className="font-medium text-sm flex-1">{w.text}</span>
                    {w.tags.length > 0 && (
                      <div className="flex gap-1 shrink-0">
                        {w.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-amber-200/50 dark:bg-amber-800/30 text-amber-700 dark:text-amber-300"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <Link
              to="/wins"
              className="text-sm font-medium text-primary hover:underline flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-base">
                add_circle
              </span>
              Log wins beyond your tasks
            </Link>
          </div>

          <div className="bg-linear-to-r from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 rounded-xl p-3 border border-green-200/50 dark:border-green-800/30">
            <p className="text-sm font-medium text-green-700 dark:text-green-300 italic text-center">
              {tasks.length >= 5
                ? "Outstanding week. You're proving that steady progress beats perfection."
                : tasks.length >= 3
                  ? "Solid progress. Each task you close lightens the mental load."
                  : tasks.length > 0
                    ? "Every completed task is evidence of your capability. Build on this."
                    : "You logged wins beyond your tasks — that counts. Celebrate the full picture."}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function MismatchesStep({
  mismatches,
}: {
  mismatches: Array<{
    title: string;
    est: number;
    actual: number;
    ratio: number;
  }>;
}) {
  return (
    <div className="flex-1 flex flex-col gap-4">
      <h2 className="text-xl font-bold">Top Estimate Mismatches</h2>
      <p className="text-slate-500 text-sm">
        These tasks had the biggest gap between estimated and actual time.
      </p>
      {mismatches.length === 0 ? (
        <p className="text-slate-400 text-sm italic">
          No completed tasks with time data this week.
        </p>
      ) : (
        <div className="space-y-2">
          {mismatches.map((m, i) => (
            <div
              key={i}
              className="px-3 py-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl flex justify-between items-center gap-4"
            >
              <span className="font-medium text-sm flex-1 truncate">{m.title}</span>
              <div className="flex items-center gap-3 text-sm shrink-0">
                <span className="text-slate-400">
                  Est: {formatMinutes(m.est)}
                </span>
                <span className="font-bold text-gradient">
                  {formatMinutes(m.actual)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PastReviewsList({
  reviews,
  onAddReview,
  onDismiss,
  onEdit,
}: {
  reviews: WeeklyReview[];
  onAddReview: (r: WeeklyReview) => void;
  onDismiss: (id: string) => void;
  onEdit: (id: string, answers: WeeklyReview["answers"]) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ friction: "", categoryFocus: "", scariestNextStep: "" });
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (reviews.length === 0) return null;

  const startEdit = (r: WeeklyReview) => {
    setDeletingId(null);
    setEditDraft({
      friction: r.answers.friction ?? "",
      categoryFocus: r.answers.categoryFocus ?? "",
      scariestNextStep: r.answers.scariestNextStep ?? "",
    });
    setEditingId(r.id);
  };

  const saveEdit = () => {
    if (!editingId) return;
    onEdit(editingId, {
      friction: editDraft.friction || undefined,
      categoryFocus: editDraft.categoryFocus || undefined,
      scariestNextStep: editDraft.scariestNextStep || undefined,
    });
    setEditingId(null);
  };

  return (
    <div className="mt-8">
      <h3 className="text-base font-bold mb-3">Past Reviews</h3>
      <div className="space-y-2">
        {reviews.map((r) => {
          const monday = normalizeWeekStartToMonday(r.weekStart);
          const isSkipped = r.status === "skipped";
          const isEditing = editingId === r.id;
          const isDeleting = deletingId === r.id;

          return (
            <div
              key={r.id}
              className="bg-white dark:bg-slate-900 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800"
            >
              {/* Header row */}
              <div className="flex justify-between items-center mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
                    Week {formatWeekRange(monday)}
                  </span>
                  {isSkipped && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
                      Skipped
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-slate-400 mr-1">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </span>
                  {!isSkipped && !isEditing && !isDeleting && (
                    <>
                      <button
                        onClick={() => startEdit(r)}
                        title="Edit review"
                        className="p-1 rounded-lg text-slate-400 hover:text-primary hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      >
                        <span className="material-symbols-outlined text-base">edit</span>
                      </button>
                      <button
                        onClick={() => { setEditingId(null); setDeletingId(r.id); }}
                        title="Delete review"
                        className="p-1 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                      >
                        <span className="material-symbols-outlined text-base">delete</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Delete confirmation */}
              {isDeleting && (
                <div className="mt-1 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/40 p-3">
                  <p className="text-xs font-semibold text-red-700 dark:text-red-300 mb-0.5">
                    Delete this review?
                  </p>
                  <p className="text-xs text-red-600/70 dark:text-red-400/70 mb-3">
                    It won't appear in your history and this week won't be queued again.
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => { setDeletingId(null); startEdit(r); }}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-sm">edit</span>
                      Edit Instead
                    </button>
                    <button
                      onClick={() => setDeletingId(null)}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => { onDismiss(r.id); setDeletingId(null); }}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-all"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}

              {/* Inline edit form */}
              {isEditing && (
                <div className="mt-1 space-y-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Friction</label>
                    <textarea
                      className="w-full mt-0.5 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2 text-xs border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary focus:outline-none resize-none min-h-[56px]"
                      value={editDraft.friction}
                      onChange={(e) => setEditDraft((d) => ({ ...d, friction: e.target.value }))}
                      placeholder="What created the most friction?"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Category Focus</label>
                    <textarea
                      className="w-full mt-0.5 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2 text-xs border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary focus:outline-none resize-none min-h-[56px]"
                      value={editDraft.categoryFocus}
                      onChange={(e) => setEditDraft((d) => ({ ...d, categoryFocus: e.target.value }))}
                      placeholder="Which category needs more focus?"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Smallest Next Step</label>
                    <textarea
                      className="w-full mt-0.5 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2 text-xs border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary focus:outline-none resize-none min-h-[56px]"
                      value={editDraft.scariestNextStep}
                      onChange={(e) => setEditDraft((d) => ({ ...d, scariestNextStep: e.target.value }))}
                      placeholder="Smallest next step for the scariest task?"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveEdit}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-gradient-accent text-white hover:opacity-90 transition-all shadow-sm"
                    >
                      Save
                    </button>
                  </div>
                </div>
              )}

              {/* Normal answers view */}
              {!isSkipped && !isEditing && !isDeleting && (
                <div className="space-y-1">
                  {r.answers.friction && (
                    <p className="text-sm text-slate-900 dark:text-slate-100">
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        Friction:{" "}
                      </span>
                      {r.answers.friction}
                    </p>
                  )}
                  {r.answers.categoryFocus && (
                    <p className="text-sm text-slate-900 dark:text-slate-100">
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        Focus:{" "}
                      </span>
                      {r.answers.categoryFocus}
                    </p>
                  )}
                  {r.answers.scariestNextStep && (
                    <p className="text-sm text-slate-900 dark:text-slate-100">
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        Next step:{" "}
                      </span>
                      {r.answers.scariestNextStep}
                    </p>
                  )}
                </div>
              )}

              {/* Skipped actions */}
              {isSkipped && (
                <div className="flex gap-3">
                  <button
                    onClick={() => onAddReview(r)}
                    className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-sm">edit</span>
                    Add Review
                  </button>
                  <button
                    onClick={() => onDismiss(r.id)}
                    className="text-xs font-medium text-slate-400 hover:text-red-500 hover:underline flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-sm">close</span>
                    Remove
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
