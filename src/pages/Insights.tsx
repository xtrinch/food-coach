import React, { useState } from "react";
import { useAllDailyInsights, db } from "../lib/db";
import { useAnalysisJobs } from "../lib/analysisJobs";
import { runDailyInsightIfNeeded } from "../lib/openai";

export const InsightsPage: React.FC = () => {
  const { insights, loading } = useAllDailyInsights();
  const { startJob, finishJob, failJob } = useAnalysisJobs();
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [customPrompt, setCustomPrompt] = useState("");

  const rerunDaily = async (date: string) => {
    const jobId = startJob({ type: "daily", label: `Re-run daily – ${date}` });
    try {
      const old = await db.dailyInsights.where("date").equals(date).toArray();
      await Promise.all(old.map((i) => db.dailyInsights.delete(String(i.id))));
      await runDailyInsightIfNeeded(date, { jobId });
      finishJob(jobId);
    } catch (e) {
      console.error(e);
      failJob(jobId, (e as Error).message);
    }
  };

  const runCustomAnalysis = async () => {
    if (!customFrom || !customTo) return;
    const jobId = startJob({
      type: "custom",
      label: `Custom ${customFrom} → ${customTo}`,
    });
    try {
      // Placeholder: real custom analysis would go here
      await runDailyInsightIfNeeded(customTo, { jobId });
      finishJob(jobId);
    } catch (e) {
      console.error(e);
      failJob(jobId, (e as Error).message);
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h1 className="text-xl font-semibold">Insights</h1>
        <p className="text-sm text-slate-400">
          Daily insights are generated automatically around 22:00 when you use the app. You can also re-run or trigger custom analyses.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-200">Daily insights</h2>
        {insights.length === 0 && (
          <p className="text-sm text-slate-500">No insights yet. Log a few days and they will appear here.</p>
        )}
        <div className="space-y-3">
          {insights.map((insight) => (
            <div
              key={insight.id}
              className="border border-slate-800 rounded-xl px-3 py-2 text-sm space-y-1"
            >
              <div className="flex justify_between items-center">
                <span className="font-medium text-slate-100">Daily – {insight.date}</span>
                <button
                  onClick={() => rerunDaily(insight.date)}
                  className="text-xs px-2 py-1 rounded-md border border-slate-700 hover:border-indigo-500"
                >
                  Re-run
                </button>
              </div>
              <p className="text-xs text-slate-500">
                Generated at {new Date(insight.generatedAt).toLocaleString()} · Model {insight.model}
              </p>
              <pre className="mt-2 max-h-40 overflow-auto text-[10px] bg-slate-950/60 p-2 rounded-lg border border-slate-900">
                {insight.prettyText}
              </pre>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-200">Custom analysis (placeholder)</h2>
        <p className="text-xs text-slate-400">
          Select a period and add an optional prompt. Current demo will simply generate a daily insight for the end date.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <label className="text-xs text-slate-400">From</label>
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-400">To</label>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
          </div>
          <div className="space-y-1 sm:col-span-3">
            <label className="text-xs text-slate-400">Focus (optional)</label>
            <textarea
              className="w-full min-h-[60px]"
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="e.g. Focus on bloating and weekends."
            />
          </div>
        </div>
        <button
          onClick={runCustomAnalysis}
          className="px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-sm"
        >
          Run custom analysis
        </button>
      </section>
    </div>
  );
};
