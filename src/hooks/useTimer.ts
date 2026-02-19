import { useState, useEffect, useCallback, useRef } from "react";
import { db, generateId, nowISO, type TimerState, type TimeEntry } from "../db";
import { useLiveQuery } from "dexie-react-hooks";

export function useTimer() {
  const timerState = useLiveQuery(() => db.timerState.get("active"));
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

  const startTimer = useCallback(
    async (taskId: string) => {
      if (timerState?.taskId && timerState.taskId !== taskId) {
        await stopTimer();
      }

      const existing = await db.timerState.get("active");
      if (existing && existing.taskId === taskId && existing.pausedAt) {
        await db.timerState.update("active", {
          startedAt: nowISO(),
          pausedAt: undefined,
        });
        return;
      }

      const entryId = generateId();
      const now = nowISO();

      await db.timeEntries.add({
        id: entryId,
        taskId,
        startAt: now,
        seconds: 0,
      });

      await db.tasks.update(taskId, { status: "IN_PROGRESS", updatedAt: now });

      await db.timerState.put({
        id: "active",
        taskId,
        timeEntryId: entryId,
        startedAt: now,
        accumulatedSeconds: 0,
      });
    },
    [timerState]
  );

  const pauseTimer = useCallback(
    async (pauseReason?: string) => {
      const state = await db.timerState.get("active");
      if (!state || state.pausedAt) return;

      const started = new Date(state.startedAt).getTime();
      const diff = Math.floor((Date.now() - started) / 1000);
      const total = state.accumulatedSeconds + diff;

      await db.timerState.update("active", {
        pausedAt: nowISO(),
        accumulatedSeconds: total,
      });

      if (pauseReason) {
        await db.timeEntries.update(state.timeEntryId, { pauseReason });
      }
    },
    []
  );

  const stopTimer = useCallback(async () => {
    const state = await db.timerState.get("active");
    if (!state) return;

    let totalSeconds = state.accumulatedSeconds;
    if (!state.pausedAt) {
      const started = new Date(state.startedAt).getTime();
      totalSeconds += Math.floor((Date.now() - started) / 1000);
    }

    const maxSeconds = 8 * 3600;
    totalSeconds = Math.min(totalSeconds, maxSeconds);

    const now = nowISO();
    await db.timeEntries.update(state.timeEntryId, {
      endAt: now,
      seconds: totalSeconds,
    });

    const task = await db.tasks.get(state.taskId);
    if (task) {
      await db.tasks.update(state.taskId, {
        actualSecondsTotal: task.actualSecondsTotal + totalSeconds,
        updatedAt: now,
      });
    }

    await db.timerState.delete("active");
  }, []);

  return {
    timerState,
    elapsed,
    isRunning: !!timerState && !timerState.pausedAt,
    isPaused: !!timerState?.pausedAt,
    activeTaskId: timerState?.taskId ?? null,
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
