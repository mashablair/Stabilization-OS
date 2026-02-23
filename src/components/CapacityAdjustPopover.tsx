import { useState, useRef, useEffect } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  currentMinutes: number;
  defaultMinutes: number;
  isOverridden: boolean;
  onSave: (minutes: number) => void;
  onReset: () => void;
}

type Unit = "minutes" | "hours";

export default function CapacityAdjustPopover({
  open,
  onClose,
  currentMinutes,
  defaultMinutes,
  isOverridden,
  onSave,
  onReset,
}: Props) {
  const [unit, setUnit] = useState<Unit>("minutes");
  const [value, setValue] = useState(currentMinutes);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setValue(currentMinutes);
      setUnit(currentMinutes >= 60 && currentMinutes % 60 === 0 ? "hours" : "minutes");
    }
  }, [open, currentMinutes]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const displayValue = unit === "hours" ? value / 60 : value;
  const step = unit === "hours" ? 0.5 : 15;

  const setFromDisplay = (v: number) => {
    const mins = unit === "hours" ? Math.round(v * 60) : v;
    setValue(Math.max(0, mins));
  };

  const increment = () => setFromDisplay(displayValue + step);
  const decrement = () => setFromDisplay(Math.max(0, displayValue - step));

  const handleSave = () => {
    onSave(value);
    onClose();
  };

  const handleReset = () => {
    onReset();
    onClose();
  };

  return (
    <div
      ref={ref}
      className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 w-80 bg-white dark:bg-card-dark rounded-2xl shadow-2xl border border-slate-200 dark:border-border-dark p-5 flex flex-col gap-4"
    >
      <div>
        <h3 className="font-bold text-sm">Adjust today's capacity</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
          How much time do you have available today to get stuff done? Your
          default is <strong>{defaultMinutes} min</strong>. This change only
          applies to today. To change the default permanently, go to{" "}
          <span className="text-primary font-semibold">Settings</span>.
        </p>
      </div>

      {/* Unit toggle */}
      <div className="flex p-0.5 rounded-lg bg-slate-100 dark:bg-background-dark border border-slate-200 dark:border-border-dark self-start">
        {(["minutes", "hours"] as const).map((u) => (
          <button
            key={u}
            type="button"
            onClick={() => {
              setUnit(u);
            }}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
              unit === u
                ? "bg-white dark:bg-card-dark shadow-sm text-primary"
                : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            {u === "minutes" ? "Minutes" : "Hours"}
          </button>
        ))}
      </div>

      {/* Stepper */}
      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={decrement}
          className="size-10 rounded-xl border border-slate-200 dark:border-border-dark flex items-center justify-center text-slate-500 hover:border-primary hover:text-primary transition-all"
        >
          <span className="material-symbols-outlined text-xl">remove</span>
        </button>
        <div className="flex items-baseline gap-1.5">
          <input
            type="number"
            value={displayValue}
            onChange={(e) => setFromDisplay(Number(e.target.value) || 0)}
            className="w-20 text-center text-3xl font-bold bg-transparent border-none focus:ring-0 p-0 focus:outline-none"
            min={0}
            step={step}
          />
          <span className="text-sm font-medium text-slate-400">
            {unit === "hours" ? "hrs" : "min"}
          </span>
        </div>
        <button
          type="button"
          onClick={increment}
          className="size-10 rounded-xl border border-slate-200 dark:border-border-dark flex items-center justify-center text-slate-500 hover:border-primary hover:text-primary transition-all"
        >
          <span className="material-symbols-outlined text-xl">add</span>
        </button>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={handleSave}
          className="w-full bg-gradient-accent text-white font-bold py-2.5 rounded-xl text-sm shadow-lg shadow-primary/20 hover:opacity-90 transition-all"
        >
          Set for today
        </button>
        {isOverridden && (
          <button
            type="button"
            onClick={handleReset}
            className="w-full text-xs text-slate-500 hover:text-primary font-semibold py-1.5 transition-colors"
          >
            Reset to default ({defaultMinutes} min)
          </button>
        )}
      </div>
    </div>
  );
}
