import React, { useState } from "react";
import { db, useAllDailyLogs } from "../lib/db";
import { ConfirmModal } from "../components/ConfirmModal";

export const HistoryPage: React.FC = () => {
  const { logs, loading } = useAllDailyLogs();
  const [pendingDelete, setPendingDelete] = useState<{ logId: string; mealId: string } | null>(null);
  const macroStatus = (type: "protein" | "carbs" | "fat", grams: number, totalKcal: number) => {
    const kcalFromMacro = grams * (type === "fat" ? 9 : 4);
    const pct = totalKcal > 0 ? (kcalFromMacro / totalKcal) * 100 : 0;
    if (type === "protein") {
      if (pct < 10) return { label: "Low", color: "text-sky-300" };
      if (pct > 35) return { label: "High", color: "text-red-300" };
      return { label: "OK", color: "text-emerald-300" };
    }
    if (type === "carbs") {
      if (pct < 40) return { label: "Low", color: "text-sky-300" };
      if (pct > 60) return { label: "High", color: "text-red-300" };
      return { label: "OK", color: "text-emerald-300" };
    }
    if (pct < 20) return { label: "Low", color: "text-sky-300" };
    if (pct > 35) return { label: "High", color: "text-red-300" };
    return { label: "OK", color: "text-emerald-300" };
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">History</h1>
      <p className="text-sm text-slate-400">
        Browse all your past days, including meals, notes, and basics.
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
              <div className="text-right text-xs text-slate-400 space-y-0.5">
                <div>Meals: {log.meals.length} · Notes: {log.notes.length}</div>
                <div className="text-slate-300 font-semibold">
                  Total kcal:{" "}
                  {log.meals
                    .map((m) => m.finalCaloriesEstimate ?? m.llmCaloriesEstimate ?? m.userCaloriesEstimate ?? 0)
                    .reduce((a, b) => a + (b ?? 0), 0)}
                </div>
                <div className="text-slate-300 font-semibold">
                  {(() => {
                    const totalProtein = log.meals
                      .map((m) => m.finalProteinGrams ?? m.llmProteinGrams ?? 0)
                      .reduce((a, b) => a + (b ?? 0), 0);
                    const totalCarbs = log.meals
                      .map((m) => m.finalCarbsGrams ?? m.llmCarbsGrams ?? 0)
                      .reduce((a, b) => a + (b ?? 0), 0);
                    const totalFat = log.meals
                      .map((m) => m.finalFatGrams ?? m.llmFatGrams ?? 0)
                      .reduce((a, b) => a + (b ?? 0), 0);
                    const totalKcal = log.meals
                      .map((m) => m.finalCaloriesEstimate ?? m.llmCaloriesEstimate ?? m.userCaloriesEstimate ?? 0)
                      .reduce((a, b) => a + (b ?? 0), 0);
                    const proteinStatus = macroStatus("protein", totalProtein, totalKcal);
                    const carbStatus = macroStatus("carbs", totalCarbs, totalKcal);
                    const fatStatus = macroStatus("fat", totalFat, totalKcal);
                    return (
                      <span>
                        Macros:{" "}
                        <span className={proteinStatus.color}>
                          Protein {totalProtein} g
                        </span>{" "}
                        ·{" "}
                        <span className={carbStatus.color}>
                          Carbs {totalCarbs} g
                        </span>{" "}
                        ·{" "}
                        <span className={fatStatus.color}>
                          Fat {totalFat} g
                        </span>
                      </span>
                    );
                  })()}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-slate-400">
              {log.weightKg != null && <span>Weight: {log.weightKg} kg</span>}
              {log.sleepHours != null && <span>Sleep: {log.sleepHours} h</span>}
              {log.stressLevel != null && <span>Stress: {log.stressLevel}/5</span>}
              {log.bloating != null && <span>Bloating: {log.bloating}/5</span>}
              {log.energy != null && <span>Energy: {log.energy}/5</span>}
              {log.exerciseHours != null && <span>Exercise: {log.exerciseHours} h</span>}
              {log.dailyInsightId && <span className="text-indigo-300">Has daily insight</span>}
            </div>
            <details className="text-xs text-slate-300">
              <summary className="cursor-pointer text-slate-400">Show details</summary>
              <div className="mt-2 space-y-2">
                <div>
                  <div className="font-semibold text-slate-200 mb-1">Meals</div>
                  {log.meals.length === 0 && <div className="text-slate-500">No meals.</div>}
                  {log.meals.map((m) => {
                    const calories = m.finalCaloriesEstimate ?? m.llmCaloriesEstimate ?? m.userCaloriesEstimate;
                    return (
                      <div
                        key={m.id}
                        className="flex items-center justify-between gap-3 border border-slate-800 rounded-lg px-2 py-1"
                      >
                        <div className="flex items-center gap-2">
                          {m.photoDataUrl && (
                            <img
                              src={m.photoDataUrl}
                              alt="Meal"
                              className="h-12 w-12 object-cover rounded-md border border-slate-800"
                            />
                          )}
                          <div className="flex flex-col">
                            <span className="text-slate-200 text-sm whitespace-pre-wrap">{m.description}</span>
                            <div className="text-[11px] text-slate-500 flex gap-3">
                              <span>
                                {new Date(m.timestamp).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                              {calories != null && <span>Final: {calories} kcal</span>}
                              {(m.finalProteinGrams ?? m.llmProteinGrams) != null && (
                                <span>
                                  Protein {m.finalProteinGrams ?? m.llmProteinGrams ?? 0}g · Carbs{" "}
                                  {m.finalCarbsGrams ?? m.llmCarbsGrams ?? 0}g · Fat{" "}
                                  {m.finalFatGrams ?? m.llmFatGrams ?? 0}g
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => setPendingDelete({ logId: log.id, mealId: m.id })}
                          className="text-[11px] px-2 py-1 rounded-md border border-slate-700 text-slate-400 hover:border-red-500 hover:text-red-200"
                        >
                          Delete
                        </button>
                      </div>
                    );
                  })}
                </div>
                <div>
                  <div className="font-semibold text-slate-200 mb-1">Notes</div>
                  {log.notes.length === 0 && <div className="text-slate-500">No notes.</div>}
                  {log.notes.map((s) => (
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
      <ConfirmModal
        open={pendingDelete !== null}
        title="Delete meal?"
        message="This will remove the meal from history permanently."
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!pendingDelete) return;
          const { logId, mealId } = pendingDelete;
          const log = logs.find((l) => l.id === logId);
          if (log) {
            const updatedMeals = log.meals.filter((meal) => meal.id !== mealId);
            await db.dailyLogs.update(logId, {
              meals: updatedMeals,
              updatedAt: new Date().toISOString(),
            });
          }
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
};
