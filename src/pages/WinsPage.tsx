import { useState, useMemo } from "react";
import { useWins } from "../hooks/useData";
import { generateId, nowISO, todayDateStr, addWin, updateWin, type Win, type WinTag } from "../db";

const WIN_TAGS: WinTag[] = ["life", "biz", "vitality", "community"];

type PeriodView = "week" | "month" | "quarter" | "year";

function getWeekStart(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() - d.getDay());
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getMonthKey(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function getQuarterKey(dateStr: string): string {
  const d = new Date(dateStr);
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `Q${q} ${d.getFullYear()}`;
}

function getYearKey(dateStr: string): string {
  return new Date(dateStr).getFullYear().toString();
}

function formatWeekLabel(weekStart: string): string {
  return `Week of ${new Date(weekStart).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
}

function groupWinsByPeriod(wins: Win[], period: PeriodView): Map<string, Win[]> {
  const map = new Map<string, Win[]>();
  const getKey = period === "week" ? getWeekStart : period === "month" ? getMonthKey : period === "quarter" ? getQuarterKey : getYearKey;
  for (const win of wins) {
    const key = getKey(win.date);
    const list = map.get(key) ?? [];
    list.push(win);
    map.set(key, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }
  return map;
}

function sortPeriodKeys(keys: string[], period: PeriodView): string[] {
  if (period === "week") return keys.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  if (period === "month" || period === "quarter") {
    return keys.sort((a, b) => {
      const [aPart, aYear] = a.split(" ");
      const [bPart, bYear] = b.split(" ");
      const yearCompare = Number(bYear) - Number(aYear);
      if (yearCompare !== 0) return yearCompare;
      const qOrder: Record<string, number> = { Q1: 0, Q2: 1, Q3: 2, Q4: 3, January: 0, February: 1, March: 2, April: 3, May: 4, June: 5, July: 6, August: 7, September: 8, October: 9, November: 10, December: 11 };
      return (qOrder[bPart] ?? 0) - (qOrder[aPart] ?? 0);
    });
  }
  return keys.sort((a, b) => Number(b) - Number(a));
}

export default function WinsPage() {
  const { data: wins = [] } = useWins();
  const [period, setPeriod] = useState<PeriodView>("week");
  const [search, setSearch] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newText, setNewText] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newTags, setNewTags] = useState<WinTag[]>([]);
  const [editingWinId, setEditingWinId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editTags, setEditTags] = useState<WinTag[]>([]);

  const filteredWins = useMemo(() => {
    if (!search.trim()) return wins;
    const q = search.toLowerCase().trim();
    return wins.filter((w) => w.text.toLowerCase().includes(q) || w.tags.some((t) => t.toLowerCase().includes(q)));
  }, [wins, search]);

  const grouped = useMemo(() => {
    const map = groupWinsByPeriod(filteredWins, period);
    const keys = sortPeriodKeys([...map.keys()], period);
    return { map, keys };
  }, [filteredWins, period]);

  const handleAddWin = async () => {
    if (!newText.trim()) return;
    const date = newDate.trim() || todayDateStr();
    await addWin({ id: generateId(), text: newText.trim(), date, tags: newTags, createdAt: nowISO() });
    setNewText(""); setNewDate(""); setNewTags([]); setShowAddForm(false);
  };

  const toggleTag = (tag: WinTag) => setNewTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]);

  const startEditing = (win: Win) => { setEditingWinId(win.id); setEditText(win.text); setEditDate(win.date); setEditTags(win.tags); };
  const cancelEditing = () => { setEditingWinId(null); setEditText(""); setEditDate(""); setEditTags([]); };

  const handleUpdateWin = async () => {
    if (!editingWinId || !editText.trim()) return;
    await updateWin(editingWinId, { text: editText.trim(), date: editDate.trim() || todayDateStr(), tags: editTags });
    cancelEditing();
  };

  const toggleEditTag = (tag: WinTag) => setEditTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]);

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 pb-24 md:pb-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2 flex items-center gap-3">
          <span className="material-symbols-outlined text-3xl text-gradient">emoji_events</span>
          Wins
        </h1>
        <p className="text-slate-500 dark:text-slate-400">Accomplishments beyond your tracked tasks. Revisit when you need a boost.</p>
      </div>

      <div className="flex flex-col gap-4 mb-8">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex-1 min-w-[200px] relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xl">search</span>
            <input type="text" placeholder="Search wins..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border-0 focus:ring-2 focus:ring-primary" />
          </div>
          <div className="flex rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700">
            {(["week", "month", "quarter", "year"] as const).map((p) => (
              <button key={p} onClick={() => setPeriod(p)} className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${period === p ? "bg-primary text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"}`}>{p}</button>
            ))}
          </div>
          <button onClick={() => setShowAddForm(!showAddForm)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-accent text-white font-bold text-sm shadow-lg shadow-primary/20 hover:opacity-90 transition-all">
            <span className="material-symbols-outlined text-lg">add</span>Log a win
          </button>
        </div>

        {showAddForm && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <h3 className="font-bold text-lg">Add a win</h3>
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 block mb-1">What did you accomplish?</label>
              <input type="text" placeholder="e.g. Started building this app, Did a face mask..." value={newText} onChange={(e) => setNewText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAddWin()} className="w-full px-4 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 border-0 focus:ring-2 focus:ring-primary" autoFocus />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 block mb-1">Date (optional — defaults to today)</label>
              <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border-0 focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 block mb-2">Tags</label>
              <div className="flex flex-wrap gap-2">
                {WIN_TAGS.map((tag) => (
                  <button key={tag} type="button" onClick={() => toggleTag(tag)} className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${newTags.includes(tag) ? "bg-primary/20 text-primary border border-primary/40" : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 border border-transparent"}`}>{tag}</button>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={handleAddWin} disabled={!newText.trim()} className="px-5 py-2.5 rounded-xl bg-gradient-accent text-white font-bold disabled:opacity-40 hover:opacity-90 transition-all">Add</button>
              <button onClick={() => { setShowAddForm(false); setNewText(""); setNewDate(""); setNewTags([]); }} className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-all">Cancel</button>
            </div>
          </div>
        )}
      </div>

      {grouped.keys.length === 0 ? (
        <div className="text-center py-16 px-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
          <span className="material-symbols-outlined text-5xl text-slate-300 dark:text-slate-600 mb-4 block">emoji_events</span>
          <h3 className="text-xl font-bold mb-2">{search.trim() ? "No wins match your search" : "No wins yet"}</h3>
          <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm mx-auto">{search.trim() ? "Try a different search or clear the search to see all wins." : "Log a win when you accomplish something that feels great — even if it wasn't on your task list."}</p>
          {!search.trim() && (
            <button onClick={() => setShowAddForm(true)} className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-accent text-white font-bold text-sm shadow-lg shadow-primary/20 hover:opacity-90">
              <span className="material-symbols-outlined">add</span>Log your first win
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.keys.map((key) => (
            <section key={key}>
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">{period === "week" ? formatWeekLabel(key) : key}</h3>
              <div className="space-y-1.5">
                {(grouped.map.get(key) ?? []).map((win) => (
                  <div key={win.id} className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 flex items-center justify-between gap-3">
                    {editingWinId === win.id ? (
                      <div className="flex-1 space-y-4">
                        <div>
                          <label className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 block mb-1">What did you accomplish?</label>
                          <input type="text" value={editText} onChange={(e) => setEditText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleUpdateWin()} className="w-full px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border-0 focus:ring-2 focus:ring-primary" autoFocus />
                        </div>
                        <div>
                          <label className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 block mb-1">Date</label>
                          <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border-0 focus:ring-2 focus:ring-primary" />
                        </div>
                        <div>
                          <label className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 block mb-1">Tags</label>
                          <div className="flex flex-wrap gap-2">
                            {WIN_TAGS.map((tag) => (
                              <button key={tag} type="button" onClick={() => toggleEditTag(tag)} className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${editTags.includes(tag) ? "bg-primary/20 text-primary border border-primary/40" : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 border border-transparent"}`}>{tag}</button>
                            ))}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={handleUpdateWin} disabled={!editText.trim()} className="px-4 py-2 rounded-xl bg-gradient-accent text-white font-bold text-sm disabled:opacity-40 hover:opacity-90 transition-all">Save</button>
                          <button onClick={cancelEditing} className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-medium text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-all">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="font-medium text-sm flex-1">{win.text}</p>
                        <div className="flex items-center gap-2 shrink-0">
                          {win.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {win.tags.map((t) => (
                                <span key={t} className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-primary/10 text-primary">{t}</span>
                              ))}
                            </div>
                          )}
                          <span className="text-xs text-slate-400">{new Date(win.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                          <button onClick={() => startEditing(win)} className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:text-slate-300 dark:hover:bg-slate-800 transition-colors" title="Edit win">
                            <span className="material-symbols-outlined text-base">edit</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
