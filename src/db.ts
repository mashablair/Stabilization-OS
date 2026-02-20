import Dexie, { type EntityTable } from "dexie";

export type TaskDomain = "LIFE_ADMIN" | "BUSINESS";
export type CategoryKind = "LEGAL" | "MONEY" | "MAINTENANCE" | "CAREGIVER";

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
  status: "BACKLOG" | "TODAY" | "IN_PROGRESS" | "DONE";
  priority: 1 | 2 | 3 | 4;
  dueDate?: string;
  softDeadline?: string;
  blockedByTaskIds?: string[];
  estimateMinutes?: number;
  actualSecondsTotal: number;
  moneyImpact?: number;
  frictionNote?: string;
  contextCard: { why: string; nextMicroStep: string; reframe: string };
  createdAt: string;
  updatedAt: string;
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
  darkMode: boolean;
}

const db = new Dexie("StabilizationOS") as Dexie & {
  categories: EntityTable<Category, "id">;
  tasks: EntityTable<Task, "id">;
  timeEntries: EntityTable<TimeEntry, "id">;
  weeklyReviews: EntityTable<WeeklyReview, "id">;
  timerState: EntityTable<TimerState, "id">;
  appSettings: EntityTable<AppSettings, "id">;
};

db.version(1).stores({
  categories: "id, kind",
  tasks: "id, categoryId, status, priority",
  timeEntries: "id, taskId",
  weeklyReviews: "id, weekStart",
  timerState: "id",
  appSettings: "id",
});

db.version(2).stores({
  tasks: "id, categoryId, status, priority, domain",
}).upgrade((tx) => {
  return tx.table("tasks").toCollection().modify((task: any) => {
    if (!task.domain) {
      task.domain = "LIFE_ADMIN";
    }
  });
});

export { db };

export function generateId(): string {
  return crypto.randomUUID();
}

export function nowISO(): string {
  return new Date().toISOString();
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
  const est = task.estimateMinutes ?? 30;
  if (est <= 15) score += 12;
  else if (est <= 30) score += 8;

  if (task.moneyImpact && task.moneyImpact > 0) {
    score += Math.min(20, task.moneyImpact / 20);
  }

  return score;
}

export function buildStabilizerStack(
  tasks: Task[],
  categories: Category[],
  availableMinutes: number,
  maxTasks = 5
): Task[] {
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const pool = tasks.filter(
    (t) => t.domain === "LIFE_ADMIN" && t.status !== "DONE"
  );

  const scored = pool
    .map((t) => ({
      task: t,
      score: scoreTask(t, catMap.get(t.categoryId)?.kind, availableMinutes),
    }))
    .filter((s) => s.score >= 0)
    .sort((a, b) => b.score - a.score);

  const result: Task[] = [];
  const kindCount: Record<string, number> = {};
  let usedMinutes = 0;

  for (const { task } of scored) {
    if (result.length >= maxTasks) break;

    const est = task.estimateMinutes ?? 15;
    if (usedMinutes + est > availableMinutes && usedMinutes > 0) continue;

    const kind = catMap.get(task.categoryId)?.kind ?? "";
    if ((kindCount[kind] ?? 0) >= 2 && scored.length > maxTasks) continue;

    result.push(task);
    usedMinutes += est;
    kindCount[kind] = (kindCount[kind] ?? 0) + 1;
  }

  return result;
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
        nextMicroStep:
          "Confirm renewal path + required documents, then pick the earliest appointment/mail option.",
        reframe:
          "This is competency restoration — one admin step that unlocks future freedom.",
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
      status: "BACKLOG",
      priority: 2,
      estimateMinutes: 10,
      actualSecondsTotal: 0,
      moneyImpact: 275,
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
    darkMode: false,
  });
}
