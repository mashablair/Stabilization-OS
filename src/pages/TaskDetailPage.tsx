import { useParams, Link, useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db, generateId, nowISO, markTaskDone, unmarkTaskDone } from "../db";
import { useTimer, formatTime, formatMinutes } from "../hooks/useTimer";
import { useState, useEffect } from "react";

const STATUS_OPTIONS = ["BACKLOG", "TODAY", "IN_PROGRESS", "PENDING", "DONE", "ARCHIVED"] as const;
const PRIORITY_LABELS: Record<number, string> = {
  1: "Critical",
  2: "High",
  3: "Medium",
  4: "Low",
};
const PRIORITY_COLORS: Record<number, string> = {
  1: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  2: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  3: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  4: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const task = useLiveQuery(() => (id ? db.tasks.get(id) : undefined), [id]);
  const categories = useLiveQuery(() => db.categories.toArray()) ?? [];
  const timeEntries = useLiveQuery(
    () => (id ? db.timeEntries.where("taskId").equals(id).toArray() : []),
    [id]
  ) ?? [];
  const timer = useTimer();
  const [newSubtask, setNewSubtask] = useState("");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitle, setEditingTitle] = useState("");
  const [addTimeInput, setAddTimeInput] = useState("");

  useEffect(() => {
    setIsEditingTitle(false);
    setEditingTitle("");
  }, [id]);

  if (!task) {
    return (
      <div className="flex justify-center items-center py-20 text-slate-400">
        Loading...
      </div>
    );
  }

  const cat = categories.find((c) => c.id === task.categoryId);
  const isActive = timer.activeTaskId === task.id;
  const isRunning = isActive && timer.isRunning;

  const update = (fields: Partial<typeof task>) =>
    db.tasks.update(task.id, { ...fields, updatedAt: nowISO() });

  const addSubtask = async () => {
    if (!newSubtask.trim()) return;
    const updated = [
      ...task.subtasks,
      { id: generateId(), title: newSubtask.trim(), done: false },
    ];
    await update({ subtasks: updated });
    setNewSubtask("");
  };

  const toggleSubtask = async (subId: string) => {
    const updated = task.subtasks.map((s) =>
      s.id === subId ? { ...s, done: !s.done } : s
    );
    await update({ subtasks: updated });
    if (updated.length > 0 && updated.every((s) => s.done) && task.status !== "DONE") {
      await markTaskDone(task.id);
    }
  };

  const removeSubtask = async (subId: string) => {
    await update({ subtasks: task.subtasks.filter((s) => s.id !== subId) });
  };

  const deleteTask = async () => {
    if (!confirm("Delete this task permanently?")) return;
    await db.tasks.delete(task.id);
    await db.timeEntries.where("taskId").equals(task.id).delete();
    navigate(-1);
  };

  const completedEntries = timeEntries
    .filter((e) => e.endAt)
    .sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime());

  const parseAddTimeInput = (value: string): number | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const match = trimmed.match(/^(\d+):(\d{1,2})$/);
    if (match) {
      const h = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      if (m >= 60) return null;
      return h * 60 + m;
    }
    const mins = parseInt(trimmed, 10);
    if (!Number.isNaN(mins) && mins > 0) return mins;
    return null;
  };

  const addManualTime = async () => {
    const minutes = parseAddTimeInput(addTimeInput);
    if (minutes == null || minutes <= 0) return;
    const seconds = minutes * 60;
    const now = nowISO();
    const startAt = new Date(Date.now() - seconds * 1000).toISOString();
    const entryId = generateId();
    await db.timeEntries.add({
      id: entryId,
      taskId: task.id,
      startAt,
      endAt: now,
      seconds,
    });
    await db.tasks.update(task.id, {
      actualSecondsTotal: task.actualSecondsTotal + seconds,
      updatedAt: now,
    });
    setAddTimeInput("");
  };

  const removeSession = async (entry: (typeof completedEntries)[0]) => {
    await db.timeEntries.delete(entry.id);
    await db.tasks.update(task.id, {
      actualSecondsTotal: Math.max(0, task.actualSecondsTotal - entry.seconds),
      updatedAt: nowISO(),
    });
  };

  return (
    <div className="max-w-7xl mx-auto w-full px-4 lg:px-10 py-8 pb-24 md:pb-8">
      <div className="flex items-center gap-2 mb-6 text-sm">
        <Link to="/categories" className="text-slate-500 hover:text-primary">
          Categories
        </Link>
        <span className="text-slate-300">/</span>
        {cat && (
          <>
            <Link to={`/categories/${cat.id}`} className="text-slate-500 hover:text-primary">
              {cat.name}
            </Link>
            <span className="text-slate-300">/</span>
          </>
        )}
        <span className="font-medium">Task Detail</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Main Column */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          {/* Title & Meta */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-4">
              <button
                onClick={async () => {
                  if (task.status === "DONE") {
                    await unmarkTaskDone(task.id);
                  } else {
                    await markTaskDone(task.id);
                  }
                }}
                className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-colors shrink-0 ${
                  task.status === "DONE"
                    ? "bg-gradient-accent border-transparent"
                    : "border-slate-300 dark:border-slate-600 hover:border-primary"
                }`}
              >
                {task.status === "DONE" && (
                  <span className="material-symbols-outlined text-white text-sm">check</span>
                )}
              </button>
              {isEditingTitle ? (
                <input
                  className="text-3xl lg:text-4xl font-black tracking-tight bg-transparent border-none focus:ring-0 p-0 w-full focus:outline-none border-b-2 border-primary"
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  onBlur={async () => {
                    const trimmed = editingTitle.trim();
                    if (trimmed && trimmed !== task.title) {
                      await update({ title: trimmed });
                    }
                    setIsEditingTitle(false);
                    setEditingTitle("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.currentTarget.blur();
                    }
                    if (e.key === "Escape") {
                      setEditingTitle(task.title);
                      setIsEditingTitle(false);
                    }
                  }}
                  autoFocus
                />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setEditingTitle(task.title);
                    setIsEditingTitle(true);
                  }}
                  className="text-3xl lg:text-4xl font-black tracking-tight p-0 w-full text-left hover:opacity-80 transition-opacity min-h-[1.5em]"
                >
                  {task.title || <span className="text-slate-400 font-normal">Untitled task — click to rename</span>}
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-3 items-center pl-12">
              <span className={`px-2 py-1 rounded-lg text-xs font-bold uppercase tracking-wider ${PRIORITY_COLORS[task.priority]}`}>
                {PRIORITY_LABELS[task.priority]} Priority
              </span>
              {task.status === "PENDING" && (
                <span className="px-2 py-1 rounded-lg text-xs font-bold uppercase tracking-wider bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 flex items-center gap-1">
                  <span className="material-symbols-outlined text-xs">hourglass_top</span>
                  Waiting
                  {task.nextActionAt && (
                    <span className="font-normal ml-1">
                      until {new Date(task.nextActionAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </span>
                  )}
                </span>
              )}
              {task.dueDate && (
                <span className="flex items-center gap-1 text-slate-500 text-sm">
                  <span className="material-symbols-outlined text-sm">calendar_today</span>
                  Due {new Date(task.dueDate).toLocaleDateString()}
                </span>
              )}
              <select
                value={task.status}
                onChange={(e) => update({ status: e.target.value as typeof task.status })}
                className="text-xs font-bold bg-slate-100 dark:bg-slate-800 border-none rounded-lg px-2 py-1"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s.replace("_", " ")}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Context Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-center gap-2 mb-3 text-slate-400">
                <span className="material-symbols-outlined text-xl">psychology</span>
                <h3 className="text-xs font-bold uppercase tracking-widest">The Why</h3>
              </div>
              <textarea
                className="w-full bg-transparent border-none focus:ring-0 p-0 text-sm text-slate-600 dark:text-slate-400 resize-none min-h-[80px] focus:outline-none"
                placeholder="Why does this matter?"
                value={task.contextCard.why}
                onChange={(e) =>
                  update({ contextCard: { ...task.contextCard, why: e.target.value } })
                }
              />
            </div>
            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl shadow-md border-2 border-primary/30">
              <div className="flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-xl text-gradient">play_circle</span>
                <h3 className="text-xs font-bold uppercase tracking-widest text-gradient">Next Micro-step</h3>
              </div>
              <textarea
                className="w-full bg-transparent border-none focus:ring-0 p-0 text-sm font-semibold resize-none min-h-[80px] focus:outline-none"
                placeholder="The absolute smallest step..."
                value={task.contextCard.nextMicroStep}
                onChange={(e) =>
                  update({ contextCard: { ...task.contextCard, nextMicroStep: e.target.value } })
                }
              />
            </div>
            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-center gap-2 mb-3 text-slate-400">
                <span className="material-symbols-outlined text-xl">change_circle</span>
                <h3 className="text-xs font-bold uppercase tracking-widest">Reframe</h3>
              </div>
              <textarea
                className="w-full bg-transparent border-none focus:ring-0 p-0 text-sm text-slate-600 dark:text-slate-400 resize-none min-h-[80px] focus:outline-none"
                placeholder="How can you look at this differently?"
                value={task.contextCard.reframe}
                onChange={(e) =>
                  update({ contextCard: { ...task.contextCard, reframe: e.target.value } })
                }
              />
            </div>
          </div>

          {/* Subtasks */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <h3 className="font-bold">Subtasks</h3>
              <span className="text-xs text-slate-500 font-medium bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg">
                {task.subtasks.filter((s) => s.done).length} / {task.subtasks.length} Complete
              </span>
            </div>
            <div className="p-2">
              {task.subtasks.map((sub) => (
                <div
                  key={sub.id}
                  className="flex items-center gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg group"
                >
                  <button
                    onClick={() => toggleSubtask(sub.id)}
                    className={`size-5 rounded flex items-center justify-center shrink-0 ${
                      sub.done
                        ? "bg-gradient-accent"
                        : "border-2 border-slate-300 dark:border-slate-600 hover:border-primary"
                    }`}
                  >
                    {sub.done && (
                      <span className="material-symbols-outlined text-white text-[14px] font-bold">check</span>
                    )}
                  </button>
                  <span className={`text-sm flex-1 ${sub.done ? "text-slate-400 line-through" : ""}`}>
                    {sub.title}
                  </span>
                  <button
                    onClick={() => removeSubtask(sub.id)}
                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-opacity"
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-2 p-3">
                <span className="material-symbols-outlined text-primary">add</span>
                <input
                  className="flex-1 bg-transparent border-none focus:ring-0 p-0 text-sm placeholder:text-slate-400 focus:outline-none"
                  placeholder="Add a subtask..."
                  value={newSubtask}
                  onChange={(e) => setNewSubtask(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addSubtask()}
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
              <span className="material-symbols-outlined text-slate-400">notes</span>
              <h3 className="font-bold">Notes</h3>
            </div>
            <div className="p-6">
              <textarea
                className="w-full bg-transparent border-none focus:ring-0 p-0 text-slate-700 dark:text-slate-300 leading-relaxed min-h-[120px] focus:outline-none"
                placeholder="Add deeper details, links, or thoughts here..."
                value={task.notes ?? ""}
                onChange={(e) => update({ notes: e.target.value })}
              />
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          {task.status === "PENDING" ? (
            /* Waiting block — replaces timer when PENDING */
            <div className="bg-amber-50 dark:bg-amber-950/20 rounded-2xl border-2 border-amber-300 dark:border-amber-700/50 shadow-sm p-8 flex flex-col items-center gap-5">
              <div className="size-14 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <span className="material-symbols-outlined text-3xl text-amber-600 dark:text-amber-400">hourglass_top</span>
              </div>
              <div className="text-amber-700 dark:text-amber-300 text-xs font-bold uppercase tracking-widest">
                Waiting
              </div>

              <div className="w-full space-y-4">
                <div>
                  <label className="block text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest mb-1.5">
                    Next Action Date
                  </label>
                  <input
                    type="date"
                    value={task.nextActionAt ? task.nextActionAt.slice(0, 10) : ""}
                    onChange={(e) => update({ nextActionAt: e.target.value || undefined })}
                    className="w-full bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800/50 rounded-xl px-4 h-12 text-sm font-bold focus:ring-2 focus:ring-amber-400"
                    autoFocus={!task.nextActionAt}
                  />
                  {!task.nextActionAt && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1.5 flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs">warning</span>
                      Set a date so this task moves to the Waiting list
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest mb-1.5">
                    Reason
                  </label>
                  <input
                    className="w-full bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800/50 rounded-xl px-4 h-12 text-sm focus:ring-2 focus:ring-amber-400"
                    placeholder="e.g. Waiting for response..."
                    value={task.pendingReason ?? ""}
                    onChange={(e) => update({ pendingReason: e.target.value || undefined })}
                  />
                </div>
              </div>

              <button
                onClick={() => update({ status: "BACKLOG", nextActionAt: undefined, pendingReason: undefined })}
                className="w-full mt-2 py-3 rounded-xl border-2 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 font-bold text-sm hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-all flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-sm">play_arrow</span>
                Make Actionable Now
              </button>
            </div>
          ) : (
            /* Focus Timer — shown for all non-PENDING statuses */
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-8 flex flex-col items-center gap-4">
              <div className="text-slate-400 text-xs font-bold uppercase tracking-widest">Focus Timer</div>
              <div className="text-5xl font-black font-mono tabular-nums tracking-tighter">
                {isActive ? formatTime(timer.elapsed) : formatTime(task.actualSecondsTotal)}
              </div>
              <div className="flex gap-3 w-full mt-2">
                {isRunning ? (
                  <>
                    <button
                      onClick={() => timer.pauseTimer()}
                      className="flex-1 bg-gradient-accent text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 hover:opacity-90 shadow-lg shadow-primary/20"
                    >
                      <span className="material-symbols-outlined">pause</span>
                      Pause
                    </button>
                    <button
                      onClick={() => timer.stopTimer()}
                      className="px-5 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <span className="material-symbols-outlined">stop</span>
                    </button>
                  </>
                ) : isActive && timer.isPaused ? (
                  <>
                    <button
                      onClick={() => timer.startTimer(task.id)}
                      className="flex-1 bg-gradient-accent text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 hover:opacity-90 shadow-lg shadow-primary/20"
                    >
                      <span className="material-symbols-outlined">play_arrow</span>
                      Resume
                    </button>
                    <button
                      onClick={() => timer.stopTimer()}
                      className="px-5 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <span className="material-symbols-outlined">stop</span>
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => timer.startTimer(task.id)}
                    className="flex-1 bg-gradient-accent text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 hover:opacity-90 shadow-lg shadow-primary/20"
                  >
                    <span className="material-symbols-outlined">play_arrow</span>
                    Start Focus
                  </button>
                )}
              </div>

              <div className="w-full flex items-center gap-2">
                <span className="text-xs text-slate-500">Add time:</span>
                <input
                  type="text"
                  placeholder="30 or 1:30"
                  value={addTimeInput}
                  onChange={(e) => setAddTimeInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addManualTime()}
                  className="flex-1 w-[100px] min-w-[100px] bg-slate-100 dark:bg-slate-800 border-none rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-primary focus:outline-none"
                />
                <span className="text-xs text-slate-500">min</span>
                <button
                  type="button"
                  onClick={addManualTime}
                  disabled={!parseAddTimeInput(addTimeInput)}
                  className="px-4 py-2 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Add
                </button>
              </div>

              {completedEntries.length > 0 && (
                <div className="w-full pt-6 border-t border-slate-100 dark:border-slate-800 mt-2">
                  <div className="flex justify-between items-center text-xs mb-3">
                    <span className="text-slate-500 font-medium">Session History</span>
                    <span className="font-bold text-gradient">
                      Total: {formatMinutes(Math.round(task.actualSecondsTotal / 60))}
                    </span>
                  </div>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {completedEntries.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex justify-between items-center gap-2 text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg"
                      >
                        <span className="flex-1 min-w-0 truncate">{new Date(entry.startAt).toLocaleString()}</span>
                        <span className="font-mono shrink-0">{formatTime(entry.seconds)}</span>
                        <button
                          type="button"
                          onClick={() => removeSession(entry)}
                          className="shrink-0 p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          title="Remove session"
                        >
                          <span className="material-symbols-outlined text-base">close</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Fields */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-5">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                Time Estimate (min)
              </label>
              <div className="bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center px-4 h-12 border border-transparent focus-within:border-primary transition-all">
                <span className="material-symbols-outlined text-slate-400 text-sm">timer</span>
                <input
                  className="bg-transparent border-none focus:ring-0 text-sm font-bold w-full focus:outline-none pl-2.5"
                  type="number"
                  value={task.estimateMinutes ?? ""}
                  onChange={(e) => update({ estimateMinutes: Number(e.target.value) || undefined })}
                  min={0}
                />
                <span className="text-xs text-slate-500">min</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                Priority
              </label>
              <select
                value={task.priority}
                onChange={(e) => update({ priority: Number(e.target.value) as 1 | 2 | 3 | 4 })}
                className="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-xl px-4 h-12 text-sm font-bold"
              >
                {[1, 2, 3, 4].map((p) => (
                  <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                Due Date
              </label>
              <input
                type="date"
                value={task.dueDate ? task.dueDate.slice(0, 10) : ""}
                onChange={(e) => update({ dueDate: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
                className="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-xl px-4 h-12 text-sm font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                Money Impact ($)
              </label>
              <div className="bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center px-4 h-12 border border-transparent focus-within:border-primary transition-all">
                <span className="material-symbols-outlined text-gradient text-sm">payments</span>
                <input
                  className="bg-transparent border-none focus:ring-0 text-sm font-bold w-full focus:outline-none pl-2.5"
                  type="number"
                  value={task.moneyImpact ?? ""}
                  onChange={(e) => update({ moneyImpact: Number(e.target.value) || undefined })}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                Friction Note
              </label>
              <input
                className="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-xl px-4 h-12 text-sm"
                placeholder="What's making this hard?"
                value={task.frictionNote ?? ""}
                onChange={(e) => update({ frictionNote: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                Domain
              </label>
              <div className="flex gap-2">
                {(["LIFE_ADMIN", "BUSINESS"] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => update({ domain: d })}
                    className={`flex-1 px-3 py-2.5 rounded-xl border text-xs font-bold transition-all ${
                      task.domain === d
                        ? "bg-primary/10 text-primary border-primary"
                        : "border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-400"
                    }`}
                  >
                    {d === "LIFE_ADMIN" ? "Life Admin" : "Business"}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                Category
              </label>
              <select
                value={task.categoryId}
                onChange={(e) => update({ categoryId: e.target.value })}
                className="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-xl px-4 h-12 text-sm font-bold"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <button
            onClick={deleteTask}
            className="w-full text-red-500 font-medium py-3 text-sm flex items-center justify-center gap-2 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-colors"
          >
            <span className="material-symbols-outlined text-sm">delete</span>
            Delete Task
          </button>
        </div>
      </div>
    </div>
  );
}
