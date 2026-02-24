import { Link } from "react-router-dom";
import AllTasksView from "./AllTasksView";

type Tab = "Life" | "Builder";

interface Props {
  open: boolean;
  onClose: () => void;
  tab: Tab;
}

export default function AllTasksDrawer({ open, onClose, tab }: Props) {
  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-md bg-white dark:bg-background-dark shadow-2xl border-l border-slate-200 dark:border-border-dark overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-label="All tasks"
      >
        <div className="p-6 pb-24">
          <div className="flex items-center justify-end gap-2 mb-4">
            <Link
              to={`/today/all?tab=${tab.toLowerCase()}`}
              onClick={onClose}
              className="text-xs text-slate-500 hover:text-primary flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-sm">open_in_new</span>
              Open as full page
            </Link>
          </div>
          <AllTasksView tab={tab} embedded onClose={onClose} />
        </div>
      </div>
    </>
  );
}
