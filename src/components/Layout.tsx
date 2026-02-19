import { NavLink, Outlet } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";

const logoSvg = (
  <svg fill="none" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    <path
      d="M42.4379 44C42.4379 44 36.0744 33.9038 41.1692 24C46.8624 12.9336 42.2078 4 42.2078 4L7.01134 4C7.01134 4 11.6577 12.932 5.96912 23.9969C0.876273 33.9029 7.27094 44 7.27094 44L42.4379 44Z"
      fill="url(#logo-gradient)"
    />
    <defs>
      <linearGradient id="logo-gradient" x1="0%" x2="100%" y1="0%" y2="100%">
        <stop offset="0%" stopColor="#a855f7" />
        <stop offset="100%" stopColor="#ec4899" />
      </linearGradient>
    </defs>
  </svg>
);

const navItems = [
  { to: "/", label: "Today", icon: "layers" },
  { to: "/categories", label: "Categories", icon: "category" },
  { to: "/dashboard", label: "Dashboard", icon: "grid_view" },
  { to: "/review", label: "Review", icon: "rate_review" },
  { to: "/settings", label: "Settings", icon: "settings" },
];

export default function Layout() {
  const settings = useLiveQuery(() => db.appSettings.get("default"));
  const isDark = settings?.darkMode ?? false;

  return (
    <div className={isDark ? "dark" : ""}>
      <div className="bg-[#f6f7f8] dark:bg-[#0f1419] text-slate-900 dark:text-slate-100 min-h-screen">
        <header className="flex items-center justify-between border-b border-slate-200 dark:border-[#2a343f] px-6 md:px-10 py-3 bg-white/80 dark:bg-[#0f1419]/80 backdrop-blur-md sticky top-0 z-50">
          <NavLink to="/" className="flex items-center gap-3">
            <div className="size-7">{logoSvg}</div>
            <h1 className="text-lg font-bold tracking-tight">
              Stabilization OS
            </h1>
          </NavLink>

          <nav className="hidden md:flex items-center gap-6">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `text-sm font-medium transition-colors flex items-center gap-1.5 ${
                    isActive
                      ? "text-primary font-semibold"
                      : "text-slate-500 dark:text-slate-400 hover:text-primary"
                  }`
                }
              >
                <span className="material-symbols-outlined text-[18px]">
                  {item.icon}
                </span>
                {item.label}
              </NavLink>
            ))}
          </nav>

          <button
            onClick={async () => {
              await db.appSettings.update("default", {
                darkMode: !isDark,
              });
            }}
            className="flex size-10 cursor-pointer items-center justify-center rounded-lg bg-slate-100 dark:bg-[#181f26] text-slate-600 dark:text-slate-300 hover:bg-primary/10 transition-colors"
            title="Toggle dark mode"
          >
            <span className="material-symbols-outlined">
              {isDark ? "light_mode" : "dark_mode"}
            </span>
          </button>
        </header>

        <main className="flex-1">
          <Outlet />
        </main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-[#0f1419]/90 backdrop-blur-md border-t border-slate-200 dark:border-[#2a343f] flex justify-around py-2 z-50">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 px-3 py-1 text-[10px] font-medium ${
                  isActive
                    ? "text-primary"
                    : "text-slate-400"
                }`
              }
            >
              <span className="material-symbols-outlined text-[22px]">
                {item.icon}
              </span>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
