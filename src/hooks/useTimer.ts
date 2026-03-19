import { useState, useEffect, useCallback, useRef } from "react";
import {
  generateId,
  nowISO,
  addTimeEntry,
  updateTimeEntry,
  updateTask,
  getTimerState,
  putTimerState,
  updateTimerState,
  deleteTimerState,
  type Subtask,
  type TimerState,
} from "../db";
import { useTimerState as useTimerStateQuery } from "./useData";
import { supabase } from "../lib/supabase";
import { rowToTask } from "./useData";
import { queryClient } from "../lib/queryClient";

export function useTimer() {
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

  const sumSubtaskActual = (subtasks: Subtask[]): number =>
    subtasks.reduce((sum, subtask) => sum + (subtask.actualSecondsTotal ?? 0), 0);

  const startTimer = useCallback(
    async (taskId: string, subtaskId?: string) => {
      const currentState = await getTimerState();
      const sameTarget =
        currentState?.taskId === taskId &&
        (currentState?.subtaskId ?? undefined) === (subtaskId ?? undefined);
      if (currentState?.taskId && !sameTarget) {
        await stopTimer();
      }

      const existing = await getTimerState();
      const sameExistingTarget =
        existing?.taskId === taskId &&
        (existing?.subtaskId ?? undefined) === (subtaskId ?? undefined);
      if (existing && sameExistingTarget && existing.pausedAt) {
        await updateTimerState({ startedAt: nowISO(), pausedAt: undefined });
        return;
      }

      const entryId = generateId();
      const now = nowISO();

      await addTimeEntry({
        id: entryId,
        taskId,
        subtaskId,
        startAt: now,
        seconds: 0,
      });

      await updateTask(taskId, { status: "IN_PROGRESS", updatedAt: now });

      await putTimerState({
        id: "active",
        taskId,
        subtaskId,
        timeEntryId: entryId,
        startedAt: now,
        accumulatedSeconds: 0,
      });
    },
    [timerState]
  );

  const pauseTimer = useCallback(
    async (pauseReason?: string) => {
      const state = await getTimerState();
      if (!state || state.pausedAt) return;

      const started = new Date(state.startedAt).getTime();
      const diff = Math.floor((Date.now() - started) / 1000);
      const total = state.accumulatedSeconds + diff;

      await updateTimerState({ pausedAt: nowISO(), accumulatedSeconds: total });

      if (pauseReason) {
        await updateTimeEntry(state.timeEntryId, { pauseReason });
      }
    },
    []
  );

  const stopTimer = useCallback(async () => {
    const state = await getTimerState();
    if (!state) return;

    let totalSeconds = state.accumulatedSeconds;
    if (!state.pausedAt) {
      const started = new Date(state.startedAt).getTime();
      totalSeconds += Math.floor((Date.now() - started) / 1000);
    }

    const maxSeconds = 8 * 3600;
    totalSeconds = Math.min(totalSeconds, maxSeconds);

    const now = nowISO();
    await updateTimeEntry(state.timeEntryId, {
      endAt: now,
      seconds: totalSeconds,
    });

    const { data: taskRow } = await supabase
      .from("tasks")
      .select("*")
      .eq("id", state.taskId)
      .single();
    if (taskRow) {
      const task = rowToTask(taskRow);
      if (state.subtaskId) {
        const updatedSubtasks = task.subtasks.map((subtask) =>
          subtask.id === state.subtaskId
            ? { ...subtask, actualSecondsTotal: (subtask.actualSecondsTotal ?? 0) + totalSeconds }
            : subtask
        );
        const hasSubtask = updatedSubtasks.some((subtask) => subtask.id === state.subtaskId);
        if (hasSubtask) {
          await updateTask(state.taskId, {
            subtasks: updatedSubtasks,
            actualSecondsTotal: sumSubtaskActual(updatedSubtasks),
          });
        } else {
          await updateTask(state.taskId, {
            actualSecondsTotal: task.actualSecondsTotal + totalSeconds,
          });
        }
      } else {
        await updateTask(state.taskId, {
          actualSecondsTotal: task.actualSecondsTotal + totalSeconds,
        });
      }
    }

    await deleteTimerState();
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    queryClient.invalidateQueries({ queryKey: ["timeEntries"] });
  }, []);

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
