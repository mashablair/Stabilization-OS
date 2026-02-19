import Dexie, { type EntityTable } from "dexie";

export interface Category {
  id: string;
  name: string;
  kind: "LEGAL" | "MONEY" | "MAINTENANCE" | "EMOTIONAL";
  contextCard: { why: string; winCondition: string; script: string };
}

export interface Task {
  id: string;
  categoryId: string;
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

export { db };

export function generateId(): string {
  return crypto.randomUUID();
}

export function nowISO(): string {
  return new Date().toISOString();
}

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
      name: "EMOTIONAL",
      kind: "EMOTIONAL",
      contextCard: {
        why: "The internal engine. Stress management and mental clarity are the ultimate performance tools.",
        winCondition:
          "Regulated nervous system, clarity of thought, and meaningful connections maintained.",
        script: "Breathe through the tasks. You are resilient.",
      },
    },
  ];

  await db.categories.bulkAdd(categories);

  const legalId = categories[0].id;
  const moneyId = categories[1].id;
  const maintenanceId = categories[2].id;
  const emotionalId = categories[3].id;

  const tasks: Task[] = [
    {
      id: generateId(),
      categoryId: legalId,
      title: "Passport renewal",
      status: "TODAY",
      priority: 1,
      estimateMinutes: 45,
      actualSecondsTotal: 0,
      contextCard: {
        why: "Valid ID is essential for travel and legal identity.",
        nextMicroStep: "Find the passport renewal form online.",
        reframe:
          "This is one form that protects months of future flexibility.",
      },
      createdAt: now,
      updatedAt: now,
      subtasks: [
        { id: generateId(), title: "Gather required documents", done: false },
        { id: generateId(), title: "Take passport photo", done: false },
        { id: generateId(), title: "Fill out application form", done: false },
        { id: generateId(), title: "Submit at post office", done: false },
      ],
    },
    {
      id: generateId(),
      categoryId: legalId,
      title: "Taxes prep",
      status: "TODAY",
      priority: 1,
      dueDate: new Date(Date.now() + 7 * 86400000).toISOString(),
      estimateMinutes: 120,
      actualSecondsTotal: 0,
      moneyImpact: 2000,
      contextCard: {
        why: "Filing on time avoids penalties and secures refunds.",
        nextMicroStep: "Open tax software and verify last year's return.",
        reframe:
          "Protecting my future self's peace and stability.",
      },
      createdAt: now,
      updatedAt: now,
      subtasks: [
        { id: generateId(), title: "Collect W-2s and 1099s", done: false },
        {
          id: generateId(),
          title: "Organize deduction receipts",
          done: false,
        },
        { id: generateId(), title: "Review tax software", done: false },
      ],
    },
    {
      id: generateId(),
      categoryId: legalId,
      title: "Homeschool application deadline check",
      status: "BACKLOG",
      priority: 2,
      estimateMinutes: 20,
      actualSecondsTotal: 0,
      contextCard: {
        why: "Missing deadlines jeopardizes the kids' education plan.",
        nextMicroStep: "Search the county website for current deadlines.",
        reframe:
          "Knowing the date is the first step to meeting it.",
      },
      createdAt: now,
      updatedAt: now,
      subtasks: [],
    },
    {
      id: generateId(),
      categoryId: moneyId,
      title: "Homeschool reimbursements",
      status: "TODAY",
      priority: 2,
      estimateMinutes: 30,
      actualSecondsTotal: 0,
      moneyImpact: 450,
      contextCard: {
        why: "Recovering money already spent on education materials.",
        nextMicroStep:
          "Gather receipts from the last month into one folder.",
        reframe: "This is money you've already earned back.",
      },
      createdAt: now,
      updatedAt: now,
      subtasks: [
        {
          id: generateId(),
          title: "Collect receipts from email",
          done: false,
        },
        { id: generateId(), title: "Submit reimbursement form", done: false },
      ],
    },
    {
      id: generateId(),
      categoryId: moneyId,
      title: "Categorize January credit card transactions",
      status: "BACKLOG",
      priority: 3,
      estimateMinutes: 40,
      actualSecondsTotal: 0,
      contextCard: {
        why: "Understanding spending patterns prevents financial surprises.",
        nextMicroStep: "Export this month's statement as CSV.",
        reframe: "Clarity is power. Each categorized row is progress.",
      },
      createdAt: now,
      updatedAt: now,
      subtasks: [],
    },
    {
      id: generateId(),
      categoryId: moneyId,
      title: "SunPass charges audit",
      status: "BACKLOG",
      priority: 3,
      estimateMinutes: 25,
      actualSecondsTotal: 0,
      moneyImpact: 50,
      contextCard: {
        why: "Incorrect charges add up. Auditing saves real money.",
        nextMicroStep: "Log into SunPass and download recent statements.",
        reframe: "Every dollar recovered is a dollar earned.",
      },
      createdAt: now,
      updatedAt: now,
      subtasks: [],
    },
    {
      id: generateId(),
      categoryId: maintenanceId,
      title: "Ask brother to take over OpenAI membership",
      status: "BACKLOG",
      priority: 4,
      estimateMinutes: 10,
      actualSecondsTotal: 0,
      moneyImpact: -20,
      contextCard: {
        why: "Reducing unnecessary recurring costs clears financial noise.",
        nextMicroStep: "Send a text message to brother about the transfer.",
        reframe:
          "A 2-minute conversation saves $20/month forever.",
      },
      createdAt: now,
      updatedAt: now,
      subtasks: [],
    },
    {
      id: generateId(),
      categoryId: maintenanceId,
      title: "Deep clean kitchen and meal prep area",
      status: "BACKLOG",
      priority: 2,
      estimateMinutes: 45,
      actualSecondsTotal: 0,
      contextCard: {
        why: "A clean environment reduces daily friction and decision fatigue.",
        nextMicroStep: "Clear the counter and wipe it down.",
        reframe: "A calm space is a gift to tomorrow's version of you.",
      },
      createdAt: now,
      updatedAt: now,
      subtasks: [
        { id: generateId(), title: "Clear countertops", done: false },
        { id: generateId(), title: "Clean out fridge", done: false },
        { id: generateId(), title: "Organize pantry shelf", done: false },
      ],
    },
    {
      id: generateId(),
      categoryId: maintenanceId,
      title: "Schedule car maintenance appointment",
      status: "BACKLOG",
      priority: 2,
      estimateMinutes: 15,
      actualSecondsTotal: 0,
      contextCard: {
        why: "Reliable transportation keeps the whole system running.",
        nextMicroStep: "Open the dealership website and check available times.",
        reframe: "Preventive care is always cheaper than emergency repair.",
      },
      createdAt: now,
      updatedAt: now,
      subtasks: [],
    },
    {
      id: generateId(),
      categoryId: maintenanceId,
      title: "Fix leaking bathroom faucet",
      status: "BACKLOG",
      priority: 3,
      estimateMinutes: 30,
      actualSecondsTotal: 0,
      moneyImpact: 15,
      contextCard: {
        why: "Small repairs prevent bigger (and more expensive) problems.",
        nextMicroStep: "Watch a 2-minute YouTube tutorial on your faucet type.",
        reframe: "You're capable of solving this. One bolt at a time.",
      },
      createdAt: now,
      updatedAt: now,
      subtasks: [],
    },
    {
      id: generateId(),
      categoryId: emotionalId,
      title: "10-minute morning journaling",
      status: "BACKLOG",
      priority: 1,
      estimateMinutes: 10,
      actualSecondsTotal: 0,
      contextCard: {
        why: "Processing thoughts on paper prevents them from looping in your mind.",
        nextMicroStep: "Open your notebook and write one sentence about how you feel.",
        reframe: "You don't need to have the answers. Just write what's true.",
      },
      createdAt: now,
      updatedAt: now,
      subtasks: [],
    },
    {
      id: generateId(),
      categoryId: emotionalId,
      title: "Call a friend or family member",
      status: "BACKLOG",
      priority: 2,
      estimateMinutes: 20,
      actualSecondsTotal: 0,
      contextCard: {
        why: "Connection is medicine. Isolation amplifies stress.",
        nextMicroStep: "Pick one person and send a 'thinking of you' text.",
        reframe: "Reaching out is strength, not weakness.",
      },
      createdAt: now,
      updatedAt: now,
      subtasks: [],
    },
    {
      id: generateId(),
      categoryId: emotionalId,
      title: "Evening wind-down routine",
      status: "BACKLOG",
      priority: 2,
      estimateMinutes: 25,
      actualSecondsTotal: 0,
      contextCard: {
        why: "Quality sleep is the single biggest lever for emotional regulation.",
        nextMicroStep: "Set a phone alarm for 30 minutes before bedtime.",
        reframe: "Rest is not laziness. It's how you recharge your capacity.",
      },
      createdAt: now,
      updatedAt: now,
      subtasks: [
        { id: generateId(), title: "Screens off", done: false },
        { id: generateId(), title: "5-minute stretching", done: false },
        { id: generateId(), title: "Write 3 things that went well today", done: false },
      ],
    },
    {
      id: generateId(),
      categoryId: emotionalId,
      title: "Walk outside for 15 minutes",
      status: "BACKLOG",
      priority: 1,
      estimateMinutes: 15,
      actualSecondsTotal: 0,
      contextCard: {
        why: "Movement and sunlight directly lower cortisol and improve mood.",
        nextMicroStep: "Put on shoes and step outside. That's it.",
        reframe: "You don't need a plan. Just move your body.",
      },
      createdAt: now,
      updatedAt: now,
      subtasks: [],
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
