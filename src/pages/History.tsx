import React from "react";
import { useAllDailyLogs } from "../lib/db";

export const HistoryPage: React.FC = () => {
  const { logs, loading } = useAllDailyLogs();

  if (loading) return <div>Loading...</div>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">History</h1>
      <p className="text-sm text-slate-400">
        Browse all your past days, including meals, symptoms, and basics.
      </p>
      {logs.length === 0 && (
        <p className="text-sm text-slate-500">No logs yet. Start by logging today.</p>
      )}
      <div className="space-y-3">
        {logs.map((log) => (
          <div
            key={log.id}
            className="border border-slate-800 rounded-xl px-3 py-2 text-sm space-y-1"
          >
            <div className="flex justify-between items-center">
              <span className="font-medium text-slate-100">{log.date}</span>
              <span className="text-xs text-slate-500">
                Meals: {log.meals.length} · Symptoms: {log.symptoms.length}
              </span>
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-slate-400">
              {log.weightKg != null && <span>Weight: {log.weightKg} kg</span>}
              {log.sleepHours != null && <span>Sleep: {log.sleepHours} h</span>}
              {log.stressLevel != null && <span>Stress: {log.stressLevel}/5</span>}
              {log.bloating != null && <span>Bloating: {log.bloating}/5</span>}
              {log.energy != null && <span>Energy: {log.energy}/5</span>}
              {log.dailyInsightId && <span className="text-indigo-300">Has daily insight</span>}
            </div>
            <details className="text-xs text-slate-300">
              <summary className="cursor-pointer text-slate-400">Show details</summary>
              <div className="mt-2 space-y-2">
                <div>
                  <div className="font-semibold text-slate-200 mb-1">Meals</div>
                  {log.meals.length === 0 && <div className="text-slate-500">No meals.</div>}
                  {log.meals.map((m) => (
                    <div key={m.id} className="flex justify-between gap-2">
                      <span>{m.description}</span>
                      <span className="text-[10px] text-slate-500">
                        {new Date(m.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="font-semibold text-slate-200 mb-1">Symptoms</div>
                  {log.symptoms.length === 0 && <div className="text-slate-500">No symptoms.</div>}
                  {log.symptoms.map((s) => (
                    <div key={s.id} className="space-y-1">
                      <span className="text-[10px] text-slate-500">
                        {new Date(s.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {s.notes && <p className="text-slate-400">{s.notes}</p>}
                    </div>
                  ))}
                </div>
              </div>
            </details>
          </div>
        ))}
      </div>
    </div>
  );
};
