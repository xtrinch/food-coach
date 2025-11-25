import React from "react";
import { useAllAnalysisJobs } from "../lib/db";

const statusBadge = (status: string) => {
  const base = "text-[11px] px-2 py-0.5 rounded-md border";
  if (status === "success") return `${base} border-emerald-700 text-emerald-300`;
  if (status === "error") return `${base} border-red-700 text-red-300`;
  if (status === "running" || status === "pending") return `${base} border-indigo-700 text-indigo-300`;
  return `${base} border-slate-700 text-slate-300`;
};

export const JobsPage: React.FC = () => {
  const { jobs, loading } = useAllAnalysisJobs();

  if (loading) return <div>Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">AI job history</h1>
        <p className="text-sm text-slate-400">
          All AI calls, including calorie estimates and insights. Stored locally in your browser.
        </p>
      </div>

      {jobs.length === 0 && <p className="text-sm text-slate-500">No jobs recorded yet.</p>}

      <div className="space-y-2">
        {jobs.map((job) => (
          <div
            key={job.id}
            className="border border-slate-800 rounded-xl px-3 py-2 flex flex-col gap-1"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-0.5">
                <div className="text-sm text-slate-100">{job.label}</div>
                <div className="text-[11px] text-slate-500">
                  Started {new Date(job.startedAt).toLocaleString()}
                  {job.finishedAt ? ` · Finished ${new Date(job.finishedAt).toLocaleString()}` : ""}
                </div>
              </div>
              <span className={statusBadge(job.status)}>{job.status}</span>
            </div>
            {job.errorMessage && (
              <p className="text-[11px] text-red-200 whitespace-pre-wrap">
                {job.errorMessage}
              </p>
            )}
            {job.prompt && (
              <details className="text-[11px] text-slate-400">
                <summary className="cursor-pointer text-slate-300">Show full prompt</summary>
                <pre className="mt-1 bg-slate-950/60 border border-slate-900 rounded-lg p-2 whitespace-pre-wrap text-[10px] text-slate-200">
                  {job.prompt}
                </pre>
              </details>
            )}
            {job.response && (
              <details className="text-[11px] text-slate-400">
                <summary className="cursor-pointer text-slate-300">Show AI response</summary>
                <pre className="mt-1 bg-slate-950/60 border border-slate-900 rounded-lg p-2 whitespace-pre-wrap text-[10px] text-slate-200">
                  {job.response}
                </pre>
              </details>
            )}
            <div className="text-[11px] text-slate-500">
              Type: <span className="font-mono">{job.type}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
