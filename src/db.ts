import Dexie, { type EntityTable } from "dexie";

export type TaskDomain = "LIFE_ADMIN" | "BUSINESS";
export type CategoryKind = "LEGAL" | "MONEY" | "MAINTENANCE" | "CAREGIVER";
export type TaskStatus = "BACKLOG" | "TODAY" | "IN_PROGRESS" | "PENDING" | "DONE" | "ARCHIVED";

export interface Category {
  id: string;
  name: string;
  kind: CategoryKind;
  contextCard: { why: string; winCondition: string; script: string };
}

export interface Task {
  id: string;
  categoryId: string;
  domain: TaskDomain;
  title: string;
  notes?: string;
  status: TaskStatus;
  priority: 1 | 2 | 3 | 4;
  dueDate?: string;
  softDeadline?: string;
  blockedByTaskIds?: string[];
  estimateMinutes?: number;
  actualSecondsTotal: number;
  moneyImpact?: number;
  frictionNote?: string;
  nextActionAt?: string;
  pendingReason?: string;
  contextCard: { why: string; nextMicroStep: string; reframe: string };
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  subtasks: Array<{ id: string; title: string; done: boolean }>;
}

export interface TimeEntry {
  id: string;
  taskId: string;
  startAt: string;
  endAt?: string;
  seconds: number;
  pauseReason?: string;
}

export interface WeeklyReview {
  id: string;
  weekStart: string;
  answers: {
    friction?: string;
    categoryFocus?: string;
    scariestNextStep?: string;
  };
  createdAt: string;
}

export interface TimerState {
  id: string;
  taskId: string;
  timeEntryId: string;
  startedAt: string;
  pausedAt?: string;
  accumulatedSeconds: number;
}

export interface AppSettings {
  id: string;
  role: string;
  availableMinutes: number;
  builderAvailableMinutes: number;
  darkMode: boolean;
}

export interface DailyCapacity {
  id: string;
  date: string;
  domain: TaskDomain;
  minutes: number;
}

export type WinTag = "life" | "biz" | "vitality" | "community";

export interface Win {
  id: string;
  text: string;
  date: string; // YYYY-MM-DD — when the win happened (or when logged if not specified)
  tags: WinTag[];
  createdAt: string;
}

const db = new Dexie("StabilizationOS") as Dexie & {
  categories: EntityTable<Category, "id">;
  tasks: EntityTable<Task, "id">;
  timeEntries: EntityTable<TimeEntry, "id">;
  weeklyReviews: EntityTable<WeeklyReview, "id">;
  timerState: EntityTable<TimerState, "id">;
  appSettings: EntityTable<AppSettings, "id">;
  dailyCapacity: EntityTable<DailyCapacity, "id">;
  wins: EntityTable<Win, "id">;
};

db.version(1).stores({
  categories: "id, kind",
  tasks: "id, categoryId, status, priority, domain",
  timeEntries: "id, taskId",
  weeklyReviews: "id, weekStart",
  timerState: "id",
  appSettings: "id",
});

db.version(2).stores({
  categories: "id, kind",
  tasks: "id, categoryId, status, priority, domain",
  timeEntries: "id, taskId",
  weeklyReviews: "id, weekStart",
  timerState: "id",
  appSettings: "id",
  dailyCapacity: "id, [date+domain]",
}).upgrade(tx => {
  return tx.table("appSettings").toCollection().modify(settings => {
    if (settings.builderAvailableMinutes === undefined) {
      settings.builderAvailableMinutes = 120;
    }
  });
});

db.version(3).stores({
  categories: "id, kind",
  tasks: "id, categoryId, status, priority, domain",
  timeEntries: "id, taskId",
  weeklyReviews: "id, weekStart",
  timerState: "id",
  appSettings: "id",
  dailyCapacity: "id, [date+domain]",
  wins: "id, date, createdAt",
});

export { db };

export function generateId(): string {
  return crypto.randomUUID();
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function todayDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getEffectiveMinutes(
  settings: AppSettings | undefined,
  dailyOverride: DailyCapacity | undefined,
  domain: TaskDomain
): number {
  if (dailyOverride && dailyOverride.date === todayDateStr()) {
    return dailyOverride.minutes;
  }
  if (domain === "BUSINESS") {
    return settings?.builderAvailableMinutes ?? 120;
  }
  return settings?.availableMinutes ?? 120;
}

export async function setDailyCapacity(domain: TaskDomain, minutes: number): Promise<void> {
  const date = todayDateStr();
  const existing = await db.dailyCapacity
    .where("[date+domain]")
    .equals([date, domain])
    .first();
  if (existing) {
    await db.dailyCapacity.update(existing.id, { minutes });
  } else {
    await db.dailyCapacity.add({ id: generateId(), date, domain, minutes });
  }
}

export async function clearDailyCapacity(domain: TaskDomain): Promise<void> {
  const date = todayDateStr();
  const existing = await db.dailyCapacity
    .where("[date+domain]")
    .equals([date, domain])
    .first();
  if (existing) {
    await db.dailyCapacity.delete(existing.id);
  }
}

// --- Waiting / actionable helpers ---

export function isWaiting(task: Task, now = Date.now()): boolean {
  return (
    task.status === "PENDING" &&
    !!task.nextActionAt &&
    new Date(task.nextActionAt).getTime() > now
  );
}

export function isActionable(task: Task, now = Date.now()): boolean {
  if (task.status === "DONE" || task.status === "ARCHIVED") return false;
  if (task.status !== "PENDING") return true;
  return !task.nextActionAt || new Date(task.nextActionAt).getTime() <= now;
}

export async function transitionDuePendingTasks(): Promise<number> {
  const now = nowISO();
  const pending = await db.tasks.where("status").equals("PENDING").toArray();
  let count = 0;
  for (const task of pending) {
    if (task.nextActionAt && new Date(task.nextActionAt).getTime() <= Date.now()) {
      await db.tasks.update(task.id, { status: "BACKLOG", updatedAt: now });
      count++;
    }
  }
  return count;
}

export async function markTaskDone(taskId: string): Promise<void> {
  const now = nowISO();
  await db.tasks.update(taskId, { status: "DONE", completedAt: now, updatedAt: now });
}

export async function markTaskArchived(taskId: string): Promise<void> {
  const now = nowISO();
  const task = await db.tasks.get(taskId);
  await db.tasks.update(taskId, {
    status: "ARCHIVED",
    completedAt: task?.completedAt ?? now,
    updatedAt: now,
  });
}

export async function unmarkTaskDone(taskId: string): Promise<void> {
  const now = nowISO();
  await db.tasks.update(taskId, { status: "BACKLOG", completedAt: undefined, updatedAt: now });
}

// --- Scoring ---

const KIND_WEIGHTS: Record<string, number> = {
  LEGAL: 40,
  MONEY: 30,
  MAINTENANCE: 10,
  CAREGIVER: 5,
};

export function scoreTask(
  task: Task,
  categoryKind: CategoryKind | undefined,
  availableMinutesRemaining: number
): number {
  if (!isActionable(task)) return -1;
  if (task.blockedByTaskIds && task.blockedByTaskIds.length > 0) return -1;
  if (
    task.estimateMinutes &&
    task.estimateMinutes > availableMinutesRemaining &&
    availableMinutesRemaining > 0
  )
    return -1;

  let score = 0;

  score += KIND_WEIGHTS[categoryKind ?? ""] ?? 0;

  if (task.dueDate) {
    const days = (new Date(task.dueDate).getTime() - Date.now()) / 86_400_000;
    if (days <= 3) score += 35;
    else if (days <= 7) score += 25;
  }
  if (task.softDeadline) {
    const days =
      (new Date(task.softDeadline).getTime() - Date.now()) / 86_400_000;
    if (days <= 7) score += 15;
  }

  if (task.status === "IN_PROGRESS") score += 20;
  // Explicitly pinned-for-today tasks always get priority (so they show in Today view)
  if (task.status === "TODAY") score += 50;
  const est = task.estimateMinutes ?? 30;
  if (est <= 15) score += 12;
  else if (est <= 30) score += 8;

  if (task.moneyImpact && task.moneyImpact > 0) {
    score += Math.min(20, task.moneyImpact / 20);
  }

  return score;
}

/** Pinned = user chose TODAY; Suggested = algorithm fills remaining slots */
export function buildStabilizerStackSplit(
  tasks: Task[],
  categories: Category[],
  availableMinutes: number,
  maxTasks = 5
): { pinned: Task[]; suggested: Task[] } {
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const pool = tasks.filter(
    (t) => t.domain === "LIFE_ADMIN" && isActionable(t)
  );

  const pinned = pool.filter((t) => t.status === "TODAY").slice(0, maxTasks);
  const pinnedIds = new Set(pinned.map((t) => t.id));
  const pinnedMins = pinned.reduce((s, t) => s + (t.estimateMinutes ?? 15), 0);

  const scored = pool
    .filter((t) => !pinnedIds.has(t.id))
    .map((t) => ({
      task: t,
      score: scoreTask(t, catMap.get(t.categoryId)?.kind, availableMinutes),
    }))
    .filter((s) => s.score >= 0)
    .sort((a, b) => b.score - a.score);

  const fillFromScored = (
    scoredList: { task: Task; score: number }[],
    cap: number,
    minsLeft: number
  ): Task[] => {
    const result: Task[] = [];
    const kindCount: Record<string, number> = {};
    let usedMinutes = 0;
    for (const { task } of scoredList) {
      if (result.length >= cap) continue;
      const est = task.estimateMinutes ?? 15;
      if (usedMinutes + est > minsLeft && usedMinutes > 0) continue;
      const kind = catMap.get(task.categoryId)?.kind ?? "";
      if ((kindCount[kind] ?? 0) >= 2 && scoredList.length > cap) continue;
      result.push(task);
      usedMinutes += est;
      kindCount[kind] = (kindCount[kind] ?? 0) + 1;
    }
    return result;
  };

  const suggested = fillFromScored(
    scored,
    maxTasks - pinned.length,
    Math.max(0, availableMinutes - pinnedMins)
  );

  return { pinned, suggested };
}

export function buildStabilizerStack(
  tasks: Task[],
  categories: Category[],
  availableMinutes: number,
  maxTasks = 5
): Task[] {
  const { pinned, suggested } = buildStabilizerStackSplit(
    tasks,
    categories,
    availableMinutes,
    maxTasks
  );
  return [...pinned, ...suggested];
}

export function getWaitingTasks(tasks: Task[], domain: TaskDomain): Task[] {
  return tasks
    .filter((t) => t.domain === domain && isWaiting(t))
    .sort((a, b) => {
      const aDate = a.nextActionAt ? new Date(a.nextActionAt).getTime() : Infinity;
      const bDate = b.nextActionAt ? new Date(b.nextActionAt).getTime() : Infinity;
      return aDate - bDate;
    });
}

// --- Seed ---

export async function seedDatabase() {
  const catCount = await db.categories.count();
  if (catCount > 0) return;

  const now = nowISO();
  const categories: Category[] = [
    {
      id: generateId(),
      name: "LEGAL",
      kind: "LEGAL",
      contextCard: {
        why: "Fundamental security and peace of mind. Ensures your life and business have a protected foundation.",
        winCondition:
          "Every crucial document is filed, deadlines met, and you are 100% compliant.",
        script: "One step at a time. You are protected.",
      },
    },
    {
      id: generateId(),
      name: "MONEY",
      kind: "MONEY",
      contextCard: {
        why: "The fuel for your projects and family. Financial clarity removes the weight of the unknown.",
        winCondition:
          "Runway is known, bills are automated, and cash flow supports your current state.",
        script: "You are handling the essentials. You are in control.",
      },
    },
    {
      id: generateId(),
      name: "MAINTENANCE",
      kind: "MAINTENANCE",
      contextCard: {
        why: "Your environment and body. Small leaks sink great ships; keeping the baseline prevents chaos.",
        winCondition:
          "Physical spaces are clear, systems are operational, and health is actively sustained.",
        script: "Focus on the process. Your space is ready for you.",
      },
    },
    {
      id: generateId(),
      name: "CAREGIVER",
      kind: "CAREGIVER",
      contextCard: {
        why: "People and relationships. Caregiving, family, and connection are the foundation of stability.",
        winCondition:
          "Key relationships nurtured, dependents cared for, and your capacity to show up is sustained.",
        script: "Breathe through the tasks. You are resilient.",
      },
    },
  ];

  await db.categories.bulkAdd(categories);

  const legalId = categories[0].id;
  const moneyId = categories[1].id;
  const maintenanceId = categories[2].id;
  const caregiverId = categories[3].id;

  const tasks: Task[] = [
    {
      id: generateId(),
      categoryId: legalId,
      domain: "LIFE_ADMIN",
      title: "Renew U.S. passport (expired)",
      status: "BACKLOG",
      priority: 1,
      estimateMinutes: 30,
      actualSecondsTotal: 0,
      contextCard: {
        why: "Restores legal travel/ID flexibility and removes a major background stressor.",
        nextMicroStep: "Confirm renewal path + required documents, then pick the earliest appointment/mail option.",
        reframe: "This is competency restoration — one admin step that unlocks future freedom.",
      },
      createdAt: now,
      updatedAt: now,
      subtasks: [
        { id: generateId(), title: "Confirm renewal method (mail vs appointment)", done: false },
        { id: generateId(), title: "Gather required documents", done: false },
        { id: generateId(), title: "Take/obtain passport photo", done: false },
        { id: generateId(), title: "Complete DS-82 / required form", done: false },
        { id: generateId(), title: "Pay fee + submit", done: false },
      ],
    },
    {
      id: generateId(),
      categoryId: legalId,
      domain: "LIFE_ADMIN",
      title: "Homeschool application: check deadline + submit if due",
      status: "BACKLOG",
      priority: 1,
      estimateMinutes: 20,
      actualSecondsTotal: 0,
      contextCard: {
        why: "Protects Sophie's schooling compliance and prevents last-minute panic.",
        nextMicroStep: "Open the official site and write down the exact deadline date.",
        reframe: "Clarity first. Once I know the date, this becomes a simple checklist.",
      },
      createdAt: now,
      updatedAt: now,
      subtasks: [
        { id: generateId(), title: "Find the official deadline date", done: false },
        { id: generateId(), title: "If due: complete and submit application", done: false },
        { id: generateId(), title: "Save confirmation / receipt", done: false },
      ],
    },
    {
      id: generateId(),
      categoryId: legalId,
      domain: "LIFE_ADMIN",
      title: "Taxes prep: gather docs + decide filing status",
      status: "BACKLOG",
      priority: 1,
      estimateMinutes: 60,
      actualSecondsTotal: 0,
      contextCard: {
        why: "Early prep reduces stress and avoids the seasonal rush with your tax preparer.",
        nextMicroStep: "Make a short list of missing items needed from your husband and request them.",
        reframe: "This is runway protection: clean taxes = fewer surprises later.",
      },
      createdAt: now,
      updatedAt: now,
      subtasks: [
        { id: generateId(), title: "Confirm: file jointly vs separately (note questions for tax pro)", done: false },
        { id: generateId(), title: "Request missing tax papers from husband", done: false },
        { id: generateId(), title: "Upload/organize all docs for tax preparer", done: false },
      ],
    },
    {
      id: generateId(),
      categoryId: moneyId,
      domain: "LIFE_ADMIN",
      title: "Unemployment: submit final request (after waiting period)",
      status: "PENDING",
      priority: 2,
      estimateMinutes: 10,
      actualSecondsTotal: 0,
      moneyImpact: 275,
      nextActionAt: "2026-03-02",
      pendingReason: "Earliest request date",
      contextCard: {
        why: "Small task, real money — closes the loop and reduces financial pressure.",
        nextMicroStep: "Add the eligibility date to this task, then set a reminder for that morning.",
        reframe: "This is not paperwork — it's cash recovery.",
      },
      createdAt: now,
      updatedAt: now,
      subtasks: [
        { id: generateId(), title: "Confirm date you can submit", done: false },
        { id: generateId(), title: "Submit claim request", done: false },
        { id: generateId(), title: "Save confirmation screenshot", done: false },
      ],
    },
    {
      id: generateId(),
      categoryId: moneyId,
      domain: "LIFE_ADMIN",
      title: "Categorize January credit card transactions + mark business",
      status: "BACKLOG",
      priority: 2,
      estimateMinutes: 60,
      actualSecondsTotal: 0,
      contextCard: {
        why: "Creates clean financial clarity for taxes and business tracking.",
        nextMicroStep: "Export January statement (CSV/PDF) and do the first 10 transactions.",
        reframe: "Momentum beats perfection. Ten rows is a win.",
      },
      createdAt: now,
      updatedAt: now,
      subtasks: [
        { id: generateId(), title: "Export January statement", done: false },
        { id: generateId(), title: "Mark business transactions", done: false },
        { id: generateId(), title: "Finish categorization", done: false },
      ],
    },
    {
      id: generateId(),
      categoryId: moneyId,
      domain: "LIFE_ADMIN",
      title: "Select homeschool charges from statements (prep for PEP reimbursement)",
      status: "BACKLOG",
      priority: 2,
      estimateMinutes: 45,
      actualSecondsTotal: 0,
      contextCard: {
        why: "Turns past spending into recoverable funds and reduces money anxiety.",
        nextMicroStep: "Filter statements for homeschool vendors and copy items into a draft list.",
        reframe: "This is a treasure hunt for money already spent.",
      },
      createdAt: now,
      updatedAt: now,
      subtasks: [
        { id: generateId(), title: "Identify homeschool purchases in statements", done: false },
        { id: generateId(), title: "Create reimbursement list (vendor, date, amount)", done: false },
      ],
    },
    {
      id: generateId(),
      categoryId: moneyId,
      domain: "LIFE_ADMIN",
      title: "Submit homeschool reimbursements (15 items) + request missing proof",
      status: "BACKLOG",
      priority: 2,
      estimateMinutes: 90,
      actualSecondsTotal: 0,
      contextCard: {
        why: "Direct cash recovery — reduces panic and extends runway.",
        nextMicroStep: "Submit the easiest 3 reimbursements first to build momentum.",
        reframe: "This isn't a 'big scary task' — it's 15 small wins.",
      },
      createdAt: now,
      updatedAt: now,
      subtasks: [
        { id: generateId(), title: "Create list of 15 reimbursements", done: false },
        { id: generateId(), title: "Submit 3 easiest first", done: false },
        { id: generateId(), title: "Request missing proof/docs", done: false },
        { id: generateId(), title: "Submit remaining items", done: false },
        { id: generateId(), title: "Save confirmations", done: false },
      ],
    },
    {
      id: generateId(),
      categoryId: moneyId,
      domain: "LIFE_ADMIN",
      title: "SunPass: investigate charges tied to old pass",
      status: "BACKLOG",
      priority: 3,
      estimateMinutes: 20,
      actualSecondsTotal: 0,
      contextCard: {
        why: "Stops recurring leaks and prevents surprise fees.",
        nextMicroStep: "Log in and locate the account/pass that's generating charges.",
        reframe: "Fixing leaks is earning money.",
      },
      createdAt: now,
      updatedAt: now,
      subtasks: [
        { id: generateId(), title: "Log into SunPass", done: false },
        { id: generateId(), title: "Identify old pass + associated vehicle/plate", done: false },
        { id: generateId(), title: "Resolve/close/transfer and confirm charges stop", done: false },
      ],
    },
    {
      id: generateId(),
      categoryId: caregiverId,
      domain: "LIFE_ADMIN",
      title: "Divorce paperwork: decide urgency + outline next steps",
      status: "BACKLOG",
      priority: 3,
      estimateMinutes: 30,
      actualSecondsTotal: 0,
      contextCard: {
        why: "Closes a long-running open loop and protects future legal/financial clarity.",
        nextMicroStep: "Write down 3 questions (timing, filing, implications) to ask a professional.",
        reframe: "This is clarity work — not drama.",
      },
      createdAt: now,
      updatedAt: now,
      subtasks: [
        { id: generateId(), title: "List questions for lawyer/mediator (timing, costs, implications)", done: false },
        { id: generateId(), title: "Collect key documents (marriage date, assets list basics)", done: false },
        { id: generateId(), title: "Decide: file now vs later", done: false },
      ],
    },
    {
      id: generateId(),
      categoryId: maintenanceId,
      domain: "LIFE_ADMIN",
      title: "Ask brother to take over OpenAI membership for sister",
      status: "BACKLOG",
      priority: 4,
      estimateMinutes: 5,
      actualSecondsTotal: 0,
      contextCard: {
        why: "Clears recurring admin and prevents avoidable subscription confusion.",
        nextMicroStep: "Send a single text with exactly what you need him to do.",
        reframe: "One message removes a repeating headache.",
      },
      createdAt: now,
      updatedAt: now,
      subtasks: [
        { id: generateId(), title: "Send brother the request + instructions", done: false },
        { id: generateId(), title: "Confirm it's transferred", done: false },
      ],
    },
  ];

  await db.tasks.bulkAdd(tasks);

  await db.appSettings.put({
    id: "default",
    role: "Stabilizer",
    availableMinutes: 120,
    builderAvailableMinutes: 120,
    darkMode: false,
  });
}
