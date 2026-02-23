import { useSearchParams, Link } from "react-router-dom";
import AllTasksView from "../components/AllTasksView";

type Tab = "Stabilizer" | "Builder";

export default function AllTasksPage() {
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get("tab")?.toLowerCase();
  const tab: Tab =
    tabParam === "builder" ? "Builder" : "Stabilizer";

  return (
    <div className="max-w-[800px] mx-auto w-full px-6 py-10 pb-24 md:pb-10">
      <div className="flex items-center gap-2 mb-6 text-sm">
        <Link to="/" className="text-slate-500 hover:text-primary">
          Today
        </Link>
        <span className="text-slate-300">/</span>
        <span className="font-medium">All Tasks</span>
      </div>

      <div className="flex gap-2 mb-6">
        <Link
          to="/today/all?tab=stabilizer"
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
            tab === "Stabilizer"
              ? "bg-primary/10 text-primary border border-primary"
              : "border border-slate-200 dark:border-border-dark text-slate-500 hover:border-slate-400"
          }`}
        >
          Stabilizer
        </Link>
        <Link
          to="/today/all?tab=builder"
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
            tab === "Builder"
              ? "bg-primary/10 text-primary border border-primary"
              : "border border-slate-200 dark:border-border-dark text-slate-500 hover:border-slate-400"
          }`}
        >
          Builder
        </Link>
      </div>

      <AllTasksView tab={tab} embedded={false} />
    </div>
  );
}
