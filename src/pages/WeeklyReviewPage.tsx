import { useState, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, generateId, nowISO } from "../db";
import { formatMinutes } from "../hooks/useTimer";

const STEPS = [
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

  const [step, setStep] = useState(0);
  const [friction, setFriction] = useState("");
  const [categoryFocus, setCategoryFocus] = useState("");
  const [scariestNextStep, setScariestNextStep] = useState("");
  const [saved, setSaved] = useState(false);

  const mismatches = useMemo(() => {
    return tasks
      .filter(
        (t) =>
          t.status === "DONE" &&
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

        {step === 1 && (
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

        {step === 2 && (
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

        {step === 3 && (
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

        {step === 4 && (
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
