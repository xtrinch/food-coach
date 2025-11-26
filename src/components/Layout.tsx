import React from "react";
import { NavLink } from "react-router-dom";
import { useAnalysisJobs } from "../lib/analysisJobs";

interface Props {
  children: React.ReactNode;
}

export const Layout: React.FC<Props> = ({ children }) => {
  const { jobs, dismissJob } = useAnalysisJobs();
  const runningCount = jobs.filter((j) => j.status === "running" || j.status === "pending").length;
  const errorJobs = jobs.filter((j) => j.status === "error" && !j.dismissed);

  return (
    <div className="min-h-screen flex flex-col">
      {errorJobs.length > 0 && (
        <div className="fixed top-16 right-4 z-50 space-y-2 max-w-xs sm:max-w-sm">
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
        <div className="max-w-4xl mx-auto flex items-center justify-between px-4 py-3">
          <NavLink to="/today" className="flex items-center gap-2 hover:opacity-90">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-500 text-sm font-bold">
              FC
            </span>
            <span className="font-semibold text-slate-100">Food Coach</span>
          </NavLink>
          <nav className="flex items-center gap-4 text-sm">
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
            <div className="relative">
              <span className="text-xs text-slate-400">
                Analyses: {runningCount}
              </span>
            </div>
          </nav>
        </div>
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
