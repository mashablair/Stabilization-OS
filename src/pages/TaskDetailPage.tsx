import { useParams, Link, useNavigate } from "react-router-dom";
import { useTask, useCategories, useTimeEntriesForTask } from "../hooks/useData";
import {
  generateId,
  nowISO,
  markTaskDone,
  unmarkTaskDone,
  getCategoriesByDomain,
  getTaskEstimateMinutes,
  updateTask,
  addTimeEntry,
  deleteTimeEntry,
  deleteTask as deleteTaskFn,
  type Task,
  type Subtask,
} from "../db";
import { useTimer, formatTime, formatMinutes } from "../hooks/useTimer";
import { useState, useEffect, useRef } from "react";

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

type TaskDraftField =
  | "notes"
  | "nextActionAt"
  | "pendingReason"
  | "estimateMinutes"
  | "moneyImpact"
  | "subtasks";

function parseOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}

function buildSubtaskEstimateDrafts(subtasks: Subtask[]): Record<string, string> {
  return Object.fromEntries(
    subtasks.map((subtask) => [subtask.id, subtask.estimateMinutes?.toString() ?? ""])
  );
}

function mergeTaskDraft(remoteTask: Task, draftTask: Task, dirtyFields: Set<TaskDraftField>): Task {
  return {
    ...remoteTask,
    notes: dirtyFields.has("notes") ? draftTask.notes : remoteTask.notes,
    nextActionAt: dirtyFields.has("nextActionAt") ? draftTask.nextActionAt : remoteTask.nextActionAt,
    pendingReason: dirtyFields.has("pendingReason") ? draftTask.pendingReason : remoteTask.pendingReason,
    estimateMinutes: dirtyFields.has("estimateMinutes") ? draftTask.estimateMinutes : remoteTask.estimateMinutes,
    moneyImpact: dirtyFields.has("moneyImpact") ? draftTask.moneyImpact : remoteTask.moneyImpact,
    subtasks: dirtyFields.has("subtasks") ? draftTask.subtasks : remoteTask.subtasks,
  };
}

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: remoteTask } = useTask(id);
  const { data: allCategories = [] } = useCategories();
  const { data: timeEntries = [] } = useTimeEntriesForTask(id);
  const timer = useTimer();
  const [draftTask, setDraftTask] = useState<Task | null>(null);
  const [dirtyFields, setDirtyFields] = useState<Set<TaskDraftField>>(new Set());
  const [newSubtask, setNewSubtask] = useState("");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitle, setEditingTitle] = useState("");
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
  const [editingSubtaskTitle, setEditingSubtaskTitle] = useState("");
  const [addTimeInput, setAddTimeInput] = useState("");
  const [selectedSubtaskId, setSelectedSubtaskId] = useState<string | null>(null);
  const [estimateMinutesDraft, setEstimateMinutesDraft] = useState("");
  const [moneyImpactDraft, setMoneyImpactDraft] = useState("");
  const [subtaskEstimateDrafts, setSubtaskEstimateDrafts] = useState<Record<string, string>>({});
  const migratedTaskId = useRef<string | null>(null);
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [showTaskCompletedDatePicker, setShowTaskCompletedDatePicker] = useState(false);
  const [editingSubtaskCompletedId, setEditingSubtaskCompletedId] = useState<string | null>(null);

  useEffect(() => {
    setIsEditingTitle(false);
    setEditingTitle("");
    setEditingSubtaskId(null);
    setEditingSubtaskTitle("");
    setSelectedSubtaskId(null);
    setDraftTask(null);
    setDirtyFields(new Set());
    setEstimateMinutesDraft("");
    setMoneyImpactDraft("");
    setSubtaskEstimateDrafts({});
    setNotesExpanded(false);
    setShowTaskCompletedDatePicker(false);
    setEditingSubtaskCompletedId(null);
  }, [id]);

  useEffect(() => {
    if (!remoteTask) return;
    setDraftTask((prev) => {
      if (!prev || prev.id !== remoteTask.id) return remoteTask;
      return mergeTaskDraft(remoteTask, prev, dirtyFields);
    });
  }, [remoteTask, dirtyFields]);

  useEffect(() => {
    if (!draftTask || dirtyFields.has("estimateMinutes")) return;
    setEstimateMinutesDraft(draftTask.estimateMinutes?.toString() ?? "");
  }, [draftTask, dirtyFields]);

  useEffect(() => {
    if (!draftTask || dirtyFields.has("moneyImpact")) return;
    setMoneyImpactDraft(draftTask.moneyImpact?.toString() ?? "");
  }, [draftTask, dirtyFields]);

  useEffect(() => {
    if (!draftTask || dirtyFields.has("subtasks")) return;
    setSubtaskEstimateDrafts(buildSubtaskEstimateDrafts(draftTask.subtasks));
  }, [draftTask, dirtyFields]);

  const task = draftTask ?? remoteTask;
  const categories = getCategoriesByDomain(allCategories, task?.domain ?? "LIFE_ADMIN");

  useEffect(() => {
    if (!task) return;
    const currentSelectedExists = task.subtasks.some((subtask) => subtask.id === selectedSubtaskId);
    if (timer.activeSubtaskId && task.subtasks.some((subtask) => subtask.id === timer.activeSubtaskId)) {
      if (selectedSubtaskId !== timer.activeSubtaskId) {
        setSelectedSubtaskId(timer.activeSubtaskId);
      }
      return;
    }
    if (!currentSelectedExists) {
      const firstIncomplete = task.subtasks.find((s) => !s.done);
      setSelectedSubtaskId(firstIncomplete?.id ?? task.subtasks[0]?.id ?? null);
    }
  }, [task, selectedSubtaskId, timer.activeSubtaskId]);

  useEffect(() => {
    if (!task || migratedTaskId.current === task.id) return;
    if (task.subtasks.length > 0 && task.timeTrackingMode === "PROJECT") return;
    migratedTaskId.current = task.id;
    const updates: Partial<Task> = { timeTrackingMode: "PROJECT" };
    if (task.subtasks.length === 0) {
      const mainSub: Subtask = {
        id: generateId(),
        title: "Main",
        done: task.status === "DONE",
        estimateMinutes: task.estimateMinutes,
        actualSecondsTotal: task.actualSecondsTotal,
      };
      updates.subtasks = [mainSub];
    } else {
      updates.subtasks = task.subtasks.map((s) => ({
        ...s,
        actualSecondsTotal: s.actualSecondsTotal ?? 0,
      }));
      updates.estimateMinutes = updates.subtasks.reduce((sum, s) => sum + (s.estimateMinutes ?? 0), 0);
      updates.actualSecondsTotal = updates.subtasks.reduce((sum, s) => sum + (s.actualSecondsTotal ?? 0), 0);
    }
    updateTask(task.id, { ...updates, updatedAt: nowISO() });
  }, [task]);

  if (!task) {
    return (
      <div className="flex justify-center items-center py-20 text-slate-400">
        Loading...
      </div>
    );
  }

  const cat = allCategories.find((c) => c.id === task.categoryId);
  const allTasksHref =
    task.domain === "BUSINESS" ? "/today/all?tab=builder" : "/today/all?tab=stabilizer";
  const totalEstimateMinutes = getTaskEstimateMinutes(task);
  const activeSubtask = task.subtasks.find((subtask) => subtask.id === timer.activeSubtaskId);
  const selectedSubtask = task.subtasks.find((subtask) => subtask.id === selectedSubtaskId);
  const firstIncompleteSubtask = task.subtasks.find((s) => !s.done);
  const focusSubtask = activeSubtask ?? selectedSubtask ?? firstIncompleteSubtask ?? task.subtasks[0];
  const isActive = timer.activeTaskId === task.id;
  const isFocusedTimer = isActive && timer.activeSubtaskId === focusSubtask?.id;
  const isRunning = isFocusedTimer && timer.isRunning;
  const isPaused = isFocusedTimer && timer.isPaused;
  const hasUnsavedChanges = dirtyFields.size > 0;

  const markDirty = (...fields: TaskDraftField[]) => {
    if (fields.length === 0) return;
    setDirtyFields((prev) => {
      const next = new Set(prev);
      for (const field of fields) next.add(field);
      return next;
    });
  };

  const clearDirty = (...fields: TaskDraftField[]) => {
    if (fields.length === 0) return;
    setDirtyFields((prev) => {
      const next = new Set(prev);
      for (const field of fields) next.delete(field);
      return next;
    });
  };

  const setLocalTaskFields = (fields: Partial<Task>) => {
    setDraftTask((prev) => (prev ? { ...prev, ...fields } : prev));
  };

  const updateImmediate = async (fields: Partial<Task>) => {
    setLocalTaskFields(fields);
    await updateTask(task.id, { ...fields, updatedAt: nowISO() });
  };

  const sumSubtaskEstimate = (subtasks: Subtask[]) =>
    subtasks.reduce((sum, subtask) => sum + (subtask.estimateMinutes ?? 0), 0);

  const sumSubtaskActual = (subtasks: Subtask[]) =>
    subtasks.reduce((sum, subtask) => sum + (subtask.actualSecondsTotal ?? 0), 0);

  const buildTaskUpdateForFields = (fields: TaskDraftField[]): Partial<Task> => {
    const updates: Partial<Task> = {};
    for (const field of fields) {
      if (field === "notes") updates.notes = task.notes;
      if (field === "nextActionAt") updates.nextActionAt = task.nextActionAt;
      if (field === "pendingReason") updates.pendingReason = task.pendingReason;
      if (field === "estimateMinutes") updates.estimateMinutes = parseOptionalNumber(estimateMinutesDraft);
      if (field === "moneyImpact") updates.moneyImpact = parseOptionalNumber(moneyImpactDraft);
      if (field === "subtasks") {
        updates.subtasks = task.subtasks;
        updates.estimateMinutes = sumSubtaskEstimate(task.subtasks);
      }
    }
    return updates;
  };

  const commitDraftFields = async (...fields: TaskDraftField[]) => {
    const pendingFields = fields.filter((field) => dirtyFields.has(field));
    if (pendingFields.length === 0 || !remoteTask) return;
    const updates = buildTaskUpdateForFields(pendingFields);
    const hasChanges = pendingFields.some((field) => {
      if (field === "notes") return task.notes !== remoteTask.notes;
      if (field === "nextActionAt") return task.nextActionAt !== remoteTask.nextActionAt;
      if (field === "pendingReason") return task.pendingReason !== remoteTask.pendingReason;
      if (field === "estimateMinutes") return updates.estimateMinutes !== remoteTask.estimateMinutes;
      if (field === "moneyImpact") return updates.moneyImpact !== remoteTask.moneyImpact;
      if (field === "subtasks") return JSON.stringify(task.subtasks) !== JSON.stringify(remoteTask.subtasks);
      return false;
    });
    clearDirty(...pendingFields);
    if (!hasChanges) {
      setLocalTaskFields(updates);
      return;
    }
    setLocalTaskFields(updates);
    await updateTask(task.id, { ...updates, updatedAt: nowISO() });
  };

  const addSubtask = async () => {
    if (!newSubtask.trim()) return;
    const updated: Subtask[] = [
      ...task.subtasks,
      {
        id: generateId(),
        title: newSubtask.trim(),
        done: false,
        estimateMinutes: undefined,
        actualSecondsTotal: 0,
      },
    ];
    const updates: Partial<typeof task> = {
      subtasks: updated,
      estimateMinutes: sumSubtaskEstimate(updated),
      actualSecondsTotal: sumSubtaskActual(updated),
    };
    setSubtaskEstimateDrafts(buildSubtaskEstimateDrafts(updated));
    await updateImmediate(updates);
    setSelectedSubtaskId(updated[updated.length - 1]?.id ?? null);
    setNewSubtask("");
  };

  const toggleSubtask = async (subId: string) => {
    const now = nowISO();
    const updated = task.subtasks.map((s) =>
      s.id === subId
        ? { ...s, done: !s.done, completedAt: !s.done ? now : undefined }
        : s
    );
    await updateImmediate({ subtasks: updated });
    if (updated.length > 0 && updated.every((s) => s.done) && task.status !== "DONE") {
      setLocalTaskFields({ status: "DONE", completedAt: now });
      await markTaskDone(task.id);
    }
  };

  const removeSubtask = async (subId: string) => {
    if (task.subtasks.length <= 1) return;
    if (timer.activeTaskId === task.id && timer.activeSubtaskId === subId) {
      await timer.stopTimer();
    }
    const updated = task.subtasks.filter((subtask) => subtask.id !== subId);
    const updates: Partial<typeof task> = {
      subtasks: updated,
      estimateMinutes: sumSubtaskEstimate(updated),
      actualSecondsTotal: sumSubtaskActual(updated),
    };
    setSubtaskEstimateDrafts(buildSubtaskEstimateDrafts(updated));
    await updateImmediate(updates);
    if (selectedSubtaskId === subId) {
      const firstIncomplete = updated.find((s) => !s.done);
      setSelectedSubtaskId(firstIncomplete?.id ?? updated[0]?.id ?? null);
    }
  };

  const updateSubtask = async (subId: string, newTitle: string) => {
    const trimmed = newTitle.trim();
    const sub = task.subtasks.find((s) => s.id === subId);
    if (!sub || trimmed === sub.title) return;
    const updated = task.subtasks.map((s) =>
      s.id === subId ? { ...s, title: trimmed } : s
    );
    await updateImmediate({ subtasks: updated });
  };

  const updateSubtaskEstimateDraft = (subId: string, rawValue: string) => {
    const estimateMinutes = parseOptionalNumber(rawValue);
    const updated = task.subtasks.map((subtask) =>
      subtask.id === subId ? { ...subtask, estimateMinutes } : subtask
    );
    setSubtaskEstimateDrafts((prev) => ({ ...prev, [subId]: rawValue }));
    setLocalTaskFields({
      subtasks: updated,
      estimateMinutes: sumSubtaskEstimate(updated),
    });
    markDirty("subtasks");
  };

  const commitSubtaskEstimates = async () => {
    await commitDraftFields("subtasks");
  };

  const handleDeleteTask = async () => {
    if (!confirm("Delete this task permanently?")) return;
    if (timer.activeTaskId === task.id) {
      await timer.stopTimer();
    }
    await deleteTaskFn(task.id);
    navigate(-1);
  };

  const changeTaskCompletedDate = async (dateStr: string) => {
    if (!dateStr) return;
    const iso = new Date(dateStr + "T12:00:00").toISOString();
    setLocalTaskFields({ completedAt: iso });
    await updateTask(task.id, { completedAt: iso, updatedAt: nowISO() });
    setShowTaskCompletedDatePicker(false);
  };

  const changeSubtaskCompletedDate = async (subId: string, dateStr: string) => {
    if (!dateStr) return;
    const iso = new Date(dateStr + "T12:00:00").toISOString();
    const updated = task.subtasks.map((s) =>
      s.id === subId ? { ...s, completedAt: iso } : s
    );
    await updateImmediate({ subtasks: updated });
    setEditingSubtaskCompletedId(null);
  };

  const completedEntries = timeEntries
    .filter((entry) => entry.subtaskId === focusSubtask?.id)
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
    if (!focusSubtask) return;
    const seconds = minutes * 60;
    const now = nowISO();
    const startAt = new Date(Date.now() - seconds * 1000).toISOString();
    const entryId = generateId();
    await addTimeEntry({
      id: entryId,
      taskId: task.id,
      subtaskId: focusSubtask.id,
      startAt,
      endAt: now,
      seconds,
    });
    const updatedSubtasks = task.subtasks.map((subtask) =>
      subtask.id === focusSubtask.id
        ? { ...subtask, actualSecondsTotal: (subtask.actualSecondsTotal ?? 0) + seconds }
        : subtask
    );
    await updateTask(task.id, {
      subtasks: updatedSubtasks,
      actualSecondsTotal: sumSubtaskActual(updatedSubtasks),
      updatedAt: now,
    });
    setAddTimeInput("");
  };

  const removeSession = async (entry: (typeof completedEntries)[0]) => {
    await deleteTimeEntry(entry.id);
    if (entry.subtaskId) {
      const updatedSubtasks = task.subtasks.map((subtask) =>
        subtask.id === entry.subtaskId
          ? {
              ...subtask,
              actualSecondsTotal: Math.max(0, (subtask.actualSecondsTotal ?? 0) - entry.seconds),
            }
          : subtask
      );
      await updateTask(task.id, {
        subtasks: updatedSubtasks,
        actualSecondsTotal: sumSubtaskActual(updatedSubtasks),
        updatedAt: nowISO(),
      });
      return;
    }
    await updateTask(task.id, {
      actualSecondsTotal: Math.max(0, task.actualSecondsTotal - entry.seconds),
      updatedAt: nowISO(),
    });
  };

  return (
    <div className="max-w-7xl mx-auto w-full px-4 lg:px-8 py-4 pb-20 md:pb-4">
      <div className="nav:hidden flex items-center gap-2 mb-3 text-sm">
        <Link to={allTasksHref} className="text-slate-500 hover:text-primary">
          All Tasks
        </Link>
        <span className="text-slate-300">/</span>
        <span className="font-medium">Task Detail</span>
      </div>
      <div className="hidden nav:flex items-center gap-2 mb-3 text-sm">
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Main Column */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          {/* Title & Meta */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-3">
              <button
                onClick={async () => {
                  if (task.status === "DONE") {
                    setLocalTaskFields({ status: "BACKLOG", completedAt: undefined });
                    await unmarkTaskDone(task.id);
                  } else {
                    setLocalTaskFields({ status: "DONE", completedAt: nowISO() });
                    await markTaskDone(task.id);
                  }
                }}
                className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-colors shrink-0 ${
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
                  className="text-2xl lg:text-3xl font-black tracking-tight bg-transparent border-none focus:ring-0 p-0 w-full focus:outline-none border-b-2 border-primary"
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  onBlur={async () => {
                    const trimmed = editingTitle.trim();
                    if (trimmed && trimmed !== task.title) {
                      setLocalTaskFields({ title: trimmed });
                      await updateTask(task.id, { title: trimmed, updatedAt: nowISO() });
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
                  className="text-2xl lg:text-3xl font-semibold tracking-tight p-0 w-full text-left hover:opacity-80 transition-opacity min-h-[1.5em]"
                >
                  {task.title || <span className="text-slate-400 font-normal">Untitled task — click to rename</span>}
                </button>
              )}
              {task.status === "DONE" && (
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowTaskCompletedDatePicker(!showTaskCompletedDatePicker)}
                    className="size-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-primary hover:bg-primary/10 transition-colors"
                    title={`Completed ${task.completedAt ? new Date(task.completedAt).toLocaleDateString() : "— click to set date"}`}
                  >
                    <span className="material-symbols-outlined text-lg">calendar_month</span>
                  </button>
                  {showTaskCompletedDatePicker && (
                    <div className="absolute top-full right-0 mt-1 z-50 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 p-3 min-w-[200px]">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
                        Completed on
                      </label>
                      <input
                        type="date"
                        value={task.completedAt ? task.completedAt.slice(0, 10) : ""}
                        onChange={(e) => changeTaskCompletedDate(e.target.value)}
                        className="w-full bg-slate-100 dark:bg-slate-700 border-none rounded-lg px-3 h-9 text-sm font-bold focus:ring-2 focus:ring-primary"
                        autoFocus
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2 items-center pl-10">
              <span className={`px-2 py-1 rounded-lg text-xs font-bold uppercase tracking-wider ${PRIORITY_COLORS[task.priority]}`}>
                {PRIORITY_LABELS[task.priority]} Priority
              </span>
              {hasUnsavedChanges && (
                <span className="px-2 py-1 rounded-lg text-xs font-bold uppercase tracking-wider bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                  Unsaved edits
                </span>
              )}
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
                onChange={(e) => updateImmediate({ status: e.target.value as typeof task.status })}
                className="text-xs font-bold bg-slate-100 dark:bg-slate-800 border-none rounded-lg px-2 py-1"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s.replace("_", " ")}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Subtasks */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <h3 className="font-bold text-sm">Subtasks</h3>
              <span className="text-xs text-slate-500 font-medium bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-lg">
                {task.subtasks.filter((s) => s.done).length} / {task.subtasks.length} done
              </span>
            </div>
            <div className="p-1.5">
              {task.subtasks.map((sub) => (
                <div
                  key={sub.id}
                  className="flex items-start gap-2 p-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg group"
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
                  {editingSubtaskId === sub.id ? (
                    <input
                      className="flex-1 text-sm bg-transparent border-none focus:ring-0 p-0 focus:outline-none border-b-2 border-primary min-w-0"
                      value={editingSubtaskTitle}
                      onChange={(e) => setEditingSubtaskTitle(e.target.value)}
                      onBlur={async () => {
                        await updateSubtask(sub.id, editingSubtaskTitle);
                        setEditingSubtaskId(null);
                        setEditingSubtaskTitle("");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.currentTarget.blur();
                        }
                        if (e.key === "Escape") {
                          setEditingSubtaskTitle(sub.title);
                          setEditingSubtaskId(null);
                        }
                      }}
                      autoFocus
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingSubtaskTitle(sub.title);
                        setEditingSubtaskId(sub.id);
                      }}
                      className={`text-sm flex-1 text-left min-w-0 whitespace-normal wrap-break-word ${
                        sub.done ? "text-slate-400 line-through" : ""
                      } hover:opacity-80 transition-opacity`}
                    >
                      {sub.title || <span className="text-slate-400 italic">Click to edit</span>}
                    </button>
                  )}
                  {!sub.done && (
                    <div className="w-[86px] shrink-0">
                      <input
                        type="number"
                        min={0}
                        value={subtaskEstimateDrafts[sub.id] ?? ""}
                        onChange={(e) => updateSubtaskEstimateDraft(sub.id, e.target.value)}
                        onBlur={commitSubtaskEstimates}
                        className="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-lg px-2 py-1.5 text-xs font-semibold text-right focus:ring-2 focus:ring-primary"
                        placeholder="min"
                        title="Subtask estimate in minutes"
                      />
                    </div>
                  )}
                  {!sub.done && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSubtaskId(sub.id);
                        if (timer.activeTaskId === task.id && timer.activeSubtaskId === sub.id) {
                          if (timer.isRunning) {
                            timer.pauseTimer();
                          } else {
                            timer.startTimer(task.id, sub.id);
                          }
                          return;
                        }
                        timer.startTimer(task.id, sub.id);
                      }}
                      className={`size-8 rounded-lg flex items-center justify-center border transition-colors ${
                        timer.activeTaskId === task.id && timer.activeSubtaskId === sub.id
                          ? "border-primary text-primary"
                          : "border-slate-200 dark:border-slate-700 text-slate-400 hover:text-primary hover:border-primary/50"
                      }`}
                      title={
                        timer.activeTaskId === task.id && timer.activeSubtaskId === sub.id && timer.isRunning
                          ? "Pause subtask timer"
                          : "Start subtask timer"
                      }
                    >
                      <span className="material-symbols-outlined text-base">
                        {timer.activeTaskId === task.id &&
                        timer.activeSubtaskId === sub.id &&
                        timer.isRunning
                          ? "pause"
                          : "play_arrow"}
                      </span>
                    </button>
                  )}
                  {sub.done && (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() =>
                          setEditingSubtaskCompletedId(
                            editingSubtaskCompletedId === sub.id ? null : sub.id
                          )
                        }
                        className="size-7 rounded flex items-center justify-center text-slate-400 hover:text-primary hover:bg-primary/10 transition-colors"
                        title={`Completed ${sub.completedAt ? new Date(sub.completedAt).toLocaleDateString() : "— click to set date"}`}
                      >
                        <span className="material-symbols-outlined text-[16px]">calendar_month</span>
                      </button>
                      {editingSubtaskCompletedId === sub.id && (
                        <div className="absolute top-full right-0 mt-1 z-50 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 p-2 min-w-[180px]">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1 block">
                            Completed on
                          </label>
                          <input
                            type="date"
                            value={sub.completedAt ? sub.completedAt.slice(0, 10) : ""}
                            onChange={(e) => changeSubtaskCompletedDate(sub.id, e.target.value)}
                            className="w-full bg-slate-100 dark:bg-slate-700 border-none rounded-lg px-2 h-8 text-xs font-bold focus:ring-2 focus:ring-primary"
                            autoFocus
                          />
                        </div>
                      )}
                    </div>
                  )}
                  {task.subtasks.length > 1 && (
                    <button
                      onClick={() => removeSubtask(sub.id)}
                      className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-opacity"
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  )}
                </div>
              ))}
              <div className="flex items-center gap-2 p-2">
                <span className="material-symbols-outlined text-primary text-base">add</span>
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
            <button
              type="button"
              onClick={() => setNotesExpanded((v) => !v)}
              className="w-full px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-slate-400 text-base">notes</span>
                <h3 className="font-bold text-sm">Notes</h3>
              </div>
              <span className="material-symbols-outlined text-slate-400">
                {notesExpanded ? "expand_less" : "expand_more"}
              </span>
            </button>
            {notesExpanded && (
              <div className="p-4">
                <textarea
                  className="w-full bg-transparent border-none focus:ring-0 p-0 text-sm text-slate-700 dark:text-slate-300 leading-relaxed min-h-[100px] focus:outline-none"
                  placeholder="Add deeper details, links, or thoughts here..."
                  value={task.notes ?? ""}
                  onChange={(e) => {
                    setLocalTaskFields({ notes: e.target.value });
                    markDirty("notes");
                  }}
                  onBlur={() => commitDraftFields("notes")}
                />
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          {task.status === "PENDING" ? (
            /* Waiting block — replaces timer when PENDING */
            <div className="bg-amber-50 dark:bg-amber-950/20 rounded-2xl border-2 border-amber-300 dark:border-amber-700/50 shadow-sm p-5 flex flex-col items-center gap-4">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
                <span className="material-symbols-outlined text-xl text-amber-600 dark:text-amber-400">hourglass_top</span>
                <span className="text-xs font-bold uppercase tracking-widest">Waiting</span>
              </div>

              <div className="w-full space-y-3">
                <div>
                  <label className="block text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest mb-1">
                    Next Action Date
                  </label>
                  <input
                    type="date"
                    value={task.nextActionAt ? task.nextActionAt.slice(0, 10) : ""}
                    onChange={(e) => {
                      setLocalTaskFields({ nextActionAt: e.target.value || undefined });
                      markDirty("nextActionAt");
                    }}
                    onBlur={() => commitDraftFields("nextActionAt")}
                    className="w-full bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800/50 rounded-lg px-3 h-9 text-sm font-bold focus:ring-2 focus:ring-amber-400"
                    autoFocus={!task.nextActionAt}
                  />
                  {!task.nextActionAt && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs">warning</span>
                      Set a date so this task moves to Waiting
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest mb-1">
                    Reason
                  </label>
                  <input
                    className="w-full bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800/50 rounded-lg px-3 h-9 text-sm focus:ring-2 focus:ring-amber-400"
                    placeholder="e.g. Waiting for response..."
                    value={task.pendingReason ?? ""}
                    onChange={(e) => {
                      setLocalTaskFields({ pendingReason: e.target.value || undefined });
                      markDirty("pendingReason");
                    }}
                    onBlur={() => commitDraftFields("pendingReason")}
                  />
                </div>
              </div>

              <button
                onClick={() => {
                  clearDirty("nextActionAt", "pendingReason");
                  updateImmediate({ status: "BACKLOG", nextActionAt: undefined, pendingReason: undefined });
                }}
                className="w-full py-2 rounded-lg border-2 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 font-bold text-sm hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-all flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-sm">play_arrow</span>
                Make Actionable Now
              </button>
            </div>
          ) : (
            /* Focus Timer — shown for all non-PENDING statuses */
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 flex flex-col items-center gap-3">
              <div className="text-slate-400 text-xs font-bold uppercase tracking-widest">
                Subtask Timer
              </div>
              {focusSubtask?.title ? (
                <div className="text-slate-500 dark:text-slate-400 text-xs font-medium">
                  {focusSubtask.title}
                </div>
              ) : null}
              <div className="text-4xl font-black font-mono tabular-nums tracking-tighter">
                {isFocusedTimer
                  ? formatTime(timer.elapsed)
                  : formatTime(focusSubtask?.actualSecondsTotal ?? 0)}
              </div>
              <div className="flex gap-2 w-full">
                {isRunning ? (
                  <>
                    <button
                      onClick={() => timer.pauseTimer()}
                      className="flex-1 bg-gradient-accent text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:opacity-90 shadow-lg shadow-primary/20"
                    >
                      <span className="material-symbols-outlined">pause</span>
                      Pause
                    </button>
                    <button
                      onClick={() => timer.stopTimer()}
                      className="px-4 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <span className="material-symbols-outlined">stop</span>
                    </button>
                  </>
                ) : isPaused ? (
                  <>
                    <button
                      onClick={() => timer.startTimer(task.id, focusSubtask?.id)}
                      className="flex-1 bg-gradient-accent text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:opacity-90 shadow-lg shadow-primary/20"
                    >
                      <span className="material-symbols-outlined">play_arrow</span>
                      Resume
                    </button>
                    <button
                      onClick={() => timer.stopTimer()}
                      className="px-4 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <span className="material-symbols-outlined">stop</span>
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => timer.startTimer(task.id, focusSubtask?.id)}
                    disabled={!focusSubtask}
                    className="flex-1 bg-gradient-accent text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:opacity-90 shadow-lg shadow-primary/20"
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
                  className="flex-1 min-w-0 bg-slate-100 dark:bg-slate-800 border-none rounded-lg px-2.5 py-1.5 text-sm font-mono focus:ring-2 focus:ring-primary focus:outline-none"
                />
                <span className="text-xs text-slate-500">min</span>
                <button
                  type="button"
                  onClick={addManualTime}
                  disabled={!parseAddTimeInput(addTimeInput) || !focusSubtask}
                  className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Add
                </button>
              </div>

              {completedEntries.length > 0 && (
                <div className="w-full pt-4 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex justify-between items-center text-xs mb-2">
                    <span className="text-slate-500 font-medium">Session History</span>
                    <span className="font-bold text-gradient">
                      Total: {formatMinutes(Math.round((focusSubtask?.actualSecondsTotal ?? 0) / 60))}
                    </span>
                  </div>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {completedEntries.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex justify-between items-center gap-2 text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 px-2.5 py-2 rounded-lg"
                      >
                        <span className="flex-1 min-w-0 truncate">{new Date(entry.startAt).toLocaleString()}</span>
                        <span className="font-mono shrink-0">{formatTime(entry.seconds)}</span>
                        <button
                          type="button"
                          onClick={() => removeSession(entry)}
                          className="shrink-0 p-0.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
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
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">
                Time Estimate
              </label>
              <div className="bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center px-3 h-9 border border-transparent transition-all">
                <span className="material-symbols-outlined text-slate-400 text-sm">timer</span>
                <input
                  className="bg-transparent border-none focus:ring-0 text-sm font-bold w-full focus:outline-none pl-2"
                  type="number"
                  value={totalEstimateMinutes}
                  disabled
                  min={0}
                />
                <span className="text-xs text-slate-500">min</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">
                Priority
              </label>
              <select
                value={task.priority}
                onChange={(e) => updateImmediate({ priority: Number(e.target.value) as 1 | 2 | 3 | 4 })}
                className="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-lg px-3 h-9 text-sm font-bold"
              >
                {[1, 2, 3, 4].map((p) => (
                  <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">
                Due Date
              </label>
              <input
                type="date"
                value={task.dueDate ? task.dueDate.slice(0, 10) : ""}
                onChange={(e) => updateImmediate({ dueDate: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
                className="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-lg px-3 h-9 text-sm font-bold"
              />
            </div>

            {cat?.kind === "MONEY" && (
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">
                  Money Impact ($)
                </label>
                <div className="bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center px-3 h-9 border border-transparent focus-within:border-primary transition-all">
                  <span className="material-symbols-outlined text-gradient text-sm">payments</span>
                  <input
                    className="bg-transparent border-none focus:ring-0 text-sm font-bold w-full focus:outline-none pl-2"
                    type="number"
                    value={moneyImpactDraft}
                    onChange={(e) => {
                      setMoneyImpactDraft(e.target.value);
                      setLocalTaskFields({ moneyImpact: parseOptionalNumber(e.target.value) });
                      markDirty("moneyImpact");
                    }}
                    onBlur={() => commitDraftFields("moneyImpact")}
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">
                Domain
              </label>
              <div className="flex gap-2">
                {(["LIFE_ADMIN", "BUSINESS"] as const).map((d) => {
                  const catsForDomain = getCategoriesByDomain(allCategories, d);
                  const defaultCatId = catsForDomain[0]?.id;
                  return (
                  <button
                    key={d}
                    type="button"
                    onClick={() =>
                      updateImmediate({
                        domain: d,
                        ...(defaultCatId && { categoryId: defaultCatId }),
                      })
                    }
                    className={`flex-1 px-3 py-2 rounded-lg border text-xs font-bold transition-all ${
                      task.domain === d
                        ? "bg-primary/10 text-primary border-primary"
                        : "border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-400"
                    }`}
                  >
                    {d === "LIFE_ADMIN" ? "Life" : "Business"}
                  </button>
                );})}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">
                Category
              </label>
              <select
                value={task.categoryId}
                onChange={(e) => updateImmediate({ categoryId: e.target.value })}
                className="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-lg px-3 h-9 text-sm font-bold"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <button
            onClick={handleDeleteTask}
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
