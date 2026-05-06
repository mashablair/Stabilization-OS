import { useState, useEffect, useCallback, useRef } from "react";
import {
  generateId,
  nowISO,
  addTimeEntry,
  updateTimeEntry,
  updateTask,
  putTimerState,
  updateTimerState,
  deleteTimerState,
  invalidateTaskTimeQueriesForTask,
  invalidateTimerStateQuery,
  type Task,
  type Subtask,
  type TimerState,
} from "../db";
import { useTimerState as useTimerStateQuery } from "./useData";
import { supabase } from "../lib/supabase";
import { rowToTask } from "./useData";
import { queryClient } from "../lib/queryClient";
import { useAuth } from "../lib/AuthContext";

const MAX_SESSION_SECONDS = 8 * 3600;

function sumSubtaskActual(subtasks: Subtask[]): number {
  return subtasks.reduce((sum, subtask) => sum + (subtask.actualSecondsTotal ?? 0), 0);
}

function timerStateKey(userId: string): readonly unknown[] {
  return ["timerState", userId];
}

function readTimerStateFromCache(userId: string): TimerState | undefined {
  return queryClient.getQueryData<TimerState | undefined>(timerStateKey(userId));
}

function writeTimerStateToCache(userId: string, next: TimerState | undefined): void {
  queryClient.setQueryData<TimerState | undefined>(timerStateKey(userId), next);
}

function getCachedTask(userId: string, taskId: string): Task | undefined {
  const single = queryClient.getQueryData<Task | undefined>(["tasks", userId, taskId]);
  if (single) return single;
  const list = queryClient.getQueryData<Task[] | undefined>(["tasks", userId]);
  return list?.find((t) => t.id === taskId);
}

function computeTotalSeconds(state: TimerState): number {
  let total = state.accumulatedSeconds;
  if (!state.pausedAt) {
    const started = new Date(state.startedAt).getTime();
    total += Math.floor((Date.now() - started) / 1000);
  }
  return Math.min(total, MAX_SESSION_SECONDS);
}

// Module-level serial queue for timer writes. UI updates are optimistic and
// instant via React Query cache; the actual Supabase writes are routed through
// this queue so that a later click (e.g. "start B") cannot race ahead of an
// earlier click's writes (e.g. "stop A") and end up clobbering them.
let timerWriteQueue: Promise<unknown> = Promise.resolve();

function enqueueTimerWrite<T>(work: () => Promise<T>): Promise<T> {
  const next = timerWriteQueue.catch(() => undefined).then(work);
  timerWriteQueue = next;
  return next;
}

async function persistStop(
  state: TimerState,
  totalSeconds: number,
  cachedTask: Task | undefined
): Promise<void> {
  const now = nowISO();
  await updateTimeEntry(
    state.timeEntryId,
    { endAt: now, seconds: totalSeconds },
    { skipInvalidate: true }
  );

  let task = cachedTask;
  if (!task) {
    const { data: taskRow, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("id", state.taskId)
      .single();
    if (error) throw new Error(error.message || "Could not load task to save time");
    if (taskRow) task = rowToTask(taskRow);
  }

  if (task) {
    if (state.subtaskId) {
      const updatedSubtasks = task.subtasks.map((subtask) =>
        subtask.id === state.subtaskId
          ? { ...subtask, actualSecondsTotal: (subtask.actualSecondsTotal ?? 0) + totalSeconds }
          : subtask
      );
      const hasSubtask = updatedSubtasks.some((subtask) => subtask.id === state.subtaskId);
      if (hasSubtask) {
        await updateTask(
          state.taskId,
          {
            subtasks: updatedSubtasks,
            actualSecondsTotal: sumSubtaskActual(updatedSubtasks),
          },
          { skipInvalidate: true }
        );
      } else {
        await updateTask(
          state.taskId,
          { actualSecondsTotal: task.actualSecondsTotal + totalSeconds },
          { skipInvalidate: true }
        );
      }
    } else {
      await updateTask(
        state.taskId,
        { actualSecondsTotal: task.actualSecondsTotal + totalSeconds },
        { skipInvalidate: true }
      );
    }
  }

  await deleteTimerState({ skipInvalidate: true });
}

export function useTimer() {
  const { user } = useAuth();
  const userId = user?.id;
  const { data: timerState } = useTimerStateQuery();
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    if (timerState && timerState.startedAt && !timerState.pausedAt) {
      const update = () => {
        const started = new Date(timerState.startedAt).getTime();
        const diff = Math.floor((Date.now() - started) / 1000);
        setElapsed(timerState.accumulatedSeconds + diff);
      };
      update();
      intervalRef.current = setInterval(update, 1000);
    } else if (timerState) {
      setElapsed(timerState.accumulatedSeconds);
    } else {
      setElapsed(0);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [timerState]);

  // Stop the timer.
  // - UI clears instantly (optimistic).
  // - Returns a promise that resolves once the writes have been persisted
  //   (so callers that follow up with their own task writes can `await` it
  //   to avoid races).
  // - Resolves to `true` on success, `false` on persistence failure.
  const stopTimer = useCallback(async (): Promise<boolean> => {
    if (!userId) {
      window.alert("Sign in to use the timer.");
      return false;
    }

    const state = readTimerStateFromCache(userId);
    if (!state) return true;

    const totalSeconds = computeTotalSeconds(state);
    const cachedTask = getCachedTask(userId, state.taskId);

    writeTimerStateToCache(userId, undefined);

    return enqueueTimerWrite(async () => {
      try {
        await persistStop(state, totalSeconds, cachedTask);
        invalidateTaskTimeQueriesForTask(userId, state.taskId);
        return true;
      } catch (err) {
        invalidateTaskTimeQueriesForTask(userId, state.taskId);
        invalidateTimerStateQuery(userId);
        window.alert(
          `Could not save your focus session.\n\n${
            err instanceof Error ? err.message : String(err)
          }`
        );
        return false;
      }
    });
  }, [userId]);

  // Pause the timer.
  // - UI flips to paused instantly (optimistic).
  // - Persistence happens in the background queue.
  const pauseTimer = useCallback(
    async (pauseReason?: string) => {
      if (!userId) {
        window.alert("Sign in to use the timer.");
        return;
      }

      const state = readTimerStateFromCache(userId);
      if (!state || state.pausedAt) return;

      const pausedAt = nowISO();
      const accumulated = computeTotalSeconds(state);
      writeTimerStateToCache(userId, { ...state, pausedAt, accumulatedSeconds: accumulated });

      enqueueTimerWrite(async () => {
        try {
          await updateTimerState(
            { pausedAt, accumulatedSeconds: accumulated },
            { skipInvalidate: true }
          );
          if (pauseReason) {
            await updateTimeEntry(
              state.timeEntryId,
              { pauseReason },
              { skipInvalidate: true }
            );
            invalidateTaskTimeQueriesForTask(userId, state.taskId);
          }
        } catch (err) {
          invalidateTimerStateQuery(userId);
          window.alert(
            `Could not pause the timer.\n\n${err instanceof Error ? err.message : String(err)}`
          );
        }
      });
    },
    [userId]
  );

  // Start (or resume / switch) the timer.
  // - UI flips to running instantly (optimistic).
  // - If switching from another target, the previous segment is closed out
  //   inside the same queued op so writes stay in click order.
  // - Returns a promise that resolves once the writes have been persisted.
  const startTimer = useCallback(
    async (taskId: string, subtaskId?: string) => {
      if (!userId) {
        window.alert("Sign in to start the focus timer.");
        return;
      }

      const cached = readTimerStateFromCache(userId);
      const sameTarget =
        cached?.taskId === taskId &&
        (cached?.subtaskId ?? undefined) === (subtaskId ?? undefined);

      // Already running on this exact target — nothing to do.
      if (cached && sameTarget && !cached.pausedAt) return;

      // Resume the existing paused timer for the same target.
      if (cached && sameTarget && cached.pausedAt) {
        const startedAt = nowISO();
        writeTimerStateToCache(userId, { ...cached, startedAt, pausedAt: undefined });

        await enqueueTimerWrite(async () => {
          try {
            await updateTimerState(
              { startedAt, pausedAt: undefined },
              { skipInvalidate: true }
            );
          } catch (err) {
            invalidateTimerStateQuery(userId);
            window.alert(
              `Could not resume the timer.\n\n${
                err instanceof Error ? err.message : String(err)
              }`
            );
          }
        });
        return;
      }

      // New session, possibly switching from a different running/paused timer.
      const previous = cached;
      const previousTotalSeconds = previous ? computeTotalSeconds(previous) : 0;
      const previousCachedTask = previous ? getCachedTask(userId, previous.taskId) : undefined;
      const isSwitch = !!previous;

      const entryId = generateId();
      const now = nowISO();
      const optimistic: TimerState = {
        id: "active",
        taskId,
        subtaskId,
        timeEntryId: entryId,
        startedAt: now,
        accumulatedSeconds: 0,
      };
      writeTimerStateToCache(userId, optimistic);

      await enqueueTimerWrite(async () => {
        try {
          if (isSwitch && previous) {
            await persistStop(previous, previousTotalSeconds, previousCachedTask);
            invalidateTaskTimeQueriesForTask(userId, previous.taskId);
          }

          await addTimeEntry(
            { id: entryId, taskId, subtaskId, startAt: now, seconds: 0 },
            { skipInvalidate: true }
          );
          await putTimerState(optimistic, { skipInvalidate: true });
          await updateTask(
            taskId,
            { status: "IN_PROGRESS", updatedAt: now },
            { skipInvalidate: true }
          );
          invalidateTaskTimeQueriesForTask(userId, taskId);
        } catch (err) {
          invalidateTaskTimeQueriesForTask(userId, taskId);
          if (previous) invalidateTaskTimeQueriesForTask(userId, previous.taskId);
          invalidateTimerStateQuery(userId);
          window.alert(
            `Could not start focus.\n\n${err instanceof Error ? err.message : String(err)}`
          );
        }
      });
    },
    [userId]
  );

  return {
    timerState,
    elapsed,
    isRunning: !!timerState && !timerState.pausedAt,
    isPaused: !!timerState?.pausedAt,
    activeTaskId: timerState?.taskId ?? null,
    activeSubtaskId: timerState?.subtaskId ?? null,
    startTimer,
    pauseTimer,
    stopTimer,
  };
}

export function formatTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) {
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function formatMinutes(mins: number): string {
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${mins}m`;
}
