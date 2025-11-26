import React, { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAnalysisJobs } from "../lib/analysisJobs";

interface Props {
  children: React.ReactNode;
}

export const Layout: React.FC<Props> = ({ children }) => {
  const { jobs, dismissJob } = useAnalysisJobs();
  const errorJobs = jobs.filter((j) => j.status === "error" && !j.dismissed);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex flex-col">
      {errorJobs.length > 0 && (
        <div className="fixed top-16 inset-x-3 sm:inset-auto sm:right-4 z-50 space-y-2 max-w-md sm:max-w-sm w-full sm:w-auto mx-auto sm:mx-0">
          {errorJobs.map((job) => (
            <div
              key={job.id}
              className="border border-red-700 bg-red-950/80 text-red-100 rounded-xl shadow-lg p-3 space-y-1 backdrop-blur"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide">AI call failed</p>
                  <p className="text-xs text-red-200">{job.label}</p>
                </div>
                <button
                  onClick={() => dismissJob(job.id)}
                  className="text-[11px] px-2 py-1 rounded-md border border-red-700 hover:bg-red-800/60"
                >
                  Dismiss
                </button>
              </div>
              {job.errorMessage && (
                <p className="text-[11px] text-red-100/90 whitespace-pre-wrap">{job.errorMessage}</p>
              )}
            </div>
          ))}
        </div>
      )}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center justify-between px-4 py-3 gap-3">
          <NavLink to="/today" className="flex items-center gap-2 hover:opacity-90">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-500 text-sm font-bold">
              FC
            </span>
            <span className="font-semibold text-slate-100">Food Coach</span>
          </NavLink>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="md:hidden inline-flex items-center gap-2 rounded-lg border border-slate-800 px-3 py-2 text-xs text-slate-200 hover:border-indigo-500"
              onClick={() => setMobileNavOpen((open) => !open)}
            >
              <span className="flex flex-col justify-center gap-[4px]" aria-hidden>
                <span className="block h-0.5 w-5 bg-slate-300 rounded-full" />
                <span className="block h-0.5 w-5 bg-slate-300 rounded-full" />
                <span className="block h-0.5 w-5 bg-slate-300 rounded-full" />
              </span>
              <span>{mobileNavOpen ? "Close" : "Menu"}</span>
            </button>
            <nav className="hidden md:flex items-center gap-3 text-sm">
              <NavLink
                to="/today"
                className={({ isActive }) =>
                  `px-2 py-1 rounded-md ${isActive ? "bg-slate-800 text-indigo-300" : "text-slate-300 hover:text-white"}`
                }
              >
                Today
              </NavLink>
              <NavLink
                to="/history"
                className={({ isActive }) =>
                  `px-2 py-1 rounded-md ${isActive ? "bg-slate-800 text-indigo-300" : "text-slate-300 hover:text-white"}`
                }
              >
                History
              </NavLink>
              <NavLink
                to="/presets"
                className={({ isActive }) =>
                  `px-2 py-1 rounded-md ${isActive ? "bg-slate-800 text-indigo-300" : "text-slate-300 hover:text-white"}`
                }
              >
                Presets
              </NavLink>
              <NavLink
                to="/insights"
                className={({ isActive }) =>
                  `px-2 py-1 rounded-md ${isActive ? "bg-slate-800 text-indigo-300" : "text-slate-300 hover:text-white"}`
                }
              >
                Insights
              </NavLink>
              <NavLink
                to="/jobs"
                className={({ isActive }) =>
                  `px-2 py-1 rounded-md ${isActive ? "bg-slate-800 text-indigo-300" : "text-slate-300 hover:text-white"}`
                }
              >
                Jobs
              </NavLink>
              <NavLink
                to="/settings"
                className={({ isActive }) =>
                  `px-2 py-1 rounded-md ${isActive ? "bg-slate-800 text-indigo-300" : "text-slate-300 hover:text-white"}`
                }
              >
                Settings
              </NavLink>
            </nav>
          </div>
        </div>
        {mobileNavOpen && (
          <nav className="md:hidden border-t border-slate-800 bg-slate-950/95 px-4 pb-4">
            <div className="max-w-4xl mx-auto grid gap-2 pt-3 text-sm">
              {[
                { to: "/today", label: "Today" },
                { to: "/history", label: "History" },
                { to: "/presets", label: "Presets" },
                { to: "/insights", label: "Insights" },
                { to: "/jobs", label: "Jobs" },
                { to: "/settings", label: "Settings" },
              ].map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `px-3 py-2 rounded-lg border ${
                      isActive ? "border-indigo-700 bg-indigo-900/30 text-indigo-200" : "border-slate-800 text-slate-200 hover:border-indigo-500"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          </nav>
        )}
      </header>
      <main className="flex-1">
        <div className="max-w-4xl mx-auto px-4 py-6">{children}</div>
      </main>
      <footer className="border-t border-slate-800 text-xs text-slate-500 py-3 text-center">
        All data is stored locally in your browser. Analyses run with your own API key.
      </footer>
    </div>
  );
};
