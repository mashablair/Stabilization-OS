import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db, generateId, nowISO, todayDateStr, type Win, type WinTag } from "../db";

const WIN_TAGS: WinTag[] = ["life", "biz", "vitality", "community"];

interface Props {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

export default function LogWinPopover({ open, onClose, anchorRef }: Props) {
  const [text, setText] = useState("");
  const [date, setDate] = useState("");
  const [tags, setTags] = useState<WinTag[]>([]);
  const popoverRef = useRef<HTMLDivElement>(null);

  const today = todayDateStr();
  const winsToday = useLiveQuery(
    () => db.wins.where("date").equals(today).sortBy("createdAt"),
    [today, open]
  ) ?? [];

  useEffect(() => {
    if (open) {
      setText("");
      setDate("");
      setTags([]);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        anchorRef.current &&
        !anchorRef.current.contains(target)
      ) {
        onClose();
      }
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
  }, [open, onClose, anchorRef]);

  const handleSubmit = async () => {
    if (!text.trim()) return;
    const winDate = date.trim() || today;
    await db.wins.add({
      id: generateId(),
      text: text.trim(),
      date: winDate,
      tags,
      createdAt: nowISO(),
    });
    setText("");
    setDate("");
    setTags([]);
  };

  const toggleTag = (tag: WinTag) => {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  if (!open) return null;

  return (
    <div
      ref={popoverRef}
      className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-50 w-[min(360px,calc(100vw-2rem))] bg-white dark:bg-card-dark rounded-2xl shadow-2xl border border-slate-200 dark:border-border-dark overflow-hidden"
    >
      <div className="p-5 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">emoji_events</span>
            Log a win
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Add form */}
        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 block mb-1">
              What did you accomplish?
            </label>
            <input
              type="text"
              placeholder="e.g. Started building this app..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border-0 focus:ring-2 focus:ring-primary text-sm"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 block mb-1">
              Date (optional)
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border-0 focus:ring-2 focus:ring-primary text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 block mb-1.5">
              Tags
            </label>
            <div className="flex flex-wrap gap-1.5">
              {WIN_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                    tags.includes(tag)
                      ? "bg-primary/20 text-primary border border-primary/40"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 border border-transparent"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={handleSubmit}
            disabled={!text.trim()}
            className="w-full py-2.5 rounded-xl bg-gradient-accent text-white font-bold text-sm disabled:opacity-40 hover:opacity-90 transition-all"
          >
            Add win
          </button>
        </div>

        {/* Today's wins */}
        <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
          <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">
            Wins today
          </h4>
          {winsToday.length === 0 ? (
            <p className="text-sm text-slate-400 italic">No wins logged for today yet.</p>
          ) : (
            <ul className="space-y-2">
              {winsToday.map((win) => (
                <li
                  key={win.id}
                  className="flex items-center gap-2 text-sm p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50"
                >
                  <span className="material-symbols-outlined text-green-500 text-base">check_circle</span>
                  <span className="flex-1 font-medium">{win.text}</span>
                  {win.tags.length > 0 && (
                    <div className="flex gap-1">
                      {win.tags.map((t) => (
                        <span
                          key={t}
                          className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-primary/10 text-primary"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <Link
          to="/wins"
          onClick={onClose}
          className="text-center text-sm font-medium text-primary hover:underline"
        >
          View all wins →
        </Link>
      </div>
    </div>
  );
}
