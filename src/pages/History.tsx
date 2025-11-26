import React, { useState } from "react";
import { db, useAllDailyLogs } from "../lib/db";
import { ConfirmModal } from "../components/ConfirmModal";

export const HistoryPage: React.FC = () => {
  const { logs, loading } = useAllDailyLogs();
  const [pendingDelete, setPendingDelete] = useState<{ logId: string; mealId: string } | null>(null);
  const [editingBasicsFor, setEditingBasicsFor] = useState<string | null>(null);
  const [savingBasics, setSavingBasics] = useState(false);
  const [basicsDraft, setBasicsDraft] = useState({
    weightKg: "",
    sleepHours: "",
    stressLevel: "",
    bloating: "",
    energy: "",
    exerciseHours: "",
  });
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

  const startEditingBasics = (logId: string) => {
    const log = logs.find((l) => l.id === logId);
    if (!log) return;
    setEditingBasicsFor(logId);
    setBasicsDraft({
      weightKg: log.weightKg != null ? String(log.weightKg) : "",
      sleepHours: log.sleepHours != null ? String(log.sleepHours) : "",
      stressLevel: log.stressLevel != null ? String(log.stressLevel) : "",
      bloating: log.bloating != null ? String(log.bloating) : "",
      energy: log.energy != null ? String(log.energy) : "",
      exerciseHours: log.exerciseHours != null ? String(log.exerciseHours) : "",
    });
  };

  const cancelEditingBasics = () => {
    setEditingBasicsFor(null);
    setBasicsDraft({
      weightKg: "",
      sleepHours: "",
      stressLevel: "",
      bloating: "",
      energy: "",
      exerciseHours: "",
    });
    setSavingBasics(false);
  };

  const saveBasics = async (logId: string) => {
    setSavingBasics(true);
    const parseVal = (val: string) => {
      if (!val.trim()) return undefined;
      const num = Number(val);
      return Number.isNaN(num) ? undefined : num;
    };
    await db.dailyLogs.update(logId, {
      weightKg: parseVal(basicsDraft.weightKg),
      sleepHours: parseVal(basicsDraft.sleepHours),
      stressLevel: parseVal(basicsDraft.stressLevel),
      bloating: parseVal(basicsDraft.bloating),
      energy: parseVal(basicsDraft.energy),
      exerciseHours: parseVal(basicsDraft.exerciseHours),
      updatedAt: new Date().toISOString(),
    });
    setSavingBasics(false);
    setEditingBasicsFor(null);
  };

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
            className="border border-slate-800 rounded-xl px-3 py-2 text-sm space-y-3"
          >
            <div className="grid gap-3 md:grid-cols-2 md:items-start">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-100">{log.date}</span>
                  {log.dailyInsightId && <span className="text-[11px] text-indigo-300">Has daily insight</span>}
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-slate-400">
                  {log.weightKg != null && <span>Weight: {log.weightKg} kg</span>}
                  {log.sleepHours != null && <span>Sleep: {log.sleepHours} h</span>}
                  {log.stressLevel != null && <span>Stress: {log.stressLevel}/5</span>}
                  {log.bloating != null && <span>Bloating: {log.bloating}/5</span>}
                  {log.energy != null && <span>Energy: {log.energy}/5</span>}
                  {log.exerciseHours != null && <span>Exercise: {log.exerciseHours} h</span>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => startEditingBasics(log.id)}
                    className="text-xs px-3 py-2 rounded-md border border-slate-700 text-slate-300 hover:border-indigo-500"
                  >
                    Edit basics
                  </button>
                </div>
                {editingBasicsFor === log.id && (
                  <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3 space-y-2">
                    <p className="text-[11px] text-slate-400">Update basics for this day.</p>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="space-y-1">
                        <label className="text-[11px] text-slate-400">Weight (kg)</label>
                        <input
                          type="number"
                          className="w-full"
                          value={basicsDraft.weightKg}
                          onChange={(e) => setBasicsDraft((prev) => ({ ...prev, weightKg: e.target.value }))}
                          placeholder="e.g. 68.4"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] text-slate-400">Sleep (hours)</label>
                        <input
                          type="number"
                          className="w-full"
                          value={basicsDraft.sleepHours}
                          onChange={(e) => setBasicsDraft((prev) => ({ ...prev, sleepHours: e.target.value }))}
                          placeholder="e.g. 7.5"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] text-slate-400">Stress (0–5)</label>
                        <input
                          type="number"
                          min={0}
                          max={5}
                          className="w-full"
                          value={basicsDraft.stressLevel}
                          onChange={(e) => setBasicsDraft((prev) => ({ ...prev, stressLevel: e.target.value }))}
                          placeholder="0-5"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] text-slate-400">Bloating (0–5)</label>
                        <input
                          type="number"
                          min={0}
                          max={5}
                          className="w-full"
                          value={basicsDraft.bloating}
                          onChange={(e) => setBasicsDraft((prev) => ({ ...prev, bloating: e.target.value }))}
                          placeholder="0-5"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] text-slate-400">Energy (0–5)</label>
                        <input
                          type="number"
                          min={0}
                          max={5}
                          className="w-full"
                          value={basicsDraft.energy}
                          onChange={(e) => setBasicsDraft((prev) => ({ ...prev, energy: e.target.value }))}
                          placeholder="0-5"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] text-slate-400">Exercise (hours)</label>
                        <input
                          type="number"
                          step="0.1"
                          min={0}
                          className="w-full"
                          value={basicsDraft.exerciseHours}
                          onChange={(e) => setBasicsDraft((prev) => ({ ...prev, exerciseHours: e.target.value }))}
                          placeholder="e.g. 0.5"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                      <button
                        onClick={() => saveBasics(log.id)}
                        disabled={savingBasics}
                        className="w-full sm:w-auto text-xs px-3 py-2 rounded-md bg-indigo-500 hover:bg-indigo-600 disabled:opacity-60"
                      >
                        {savingBasics ? "Saving..." : "Save basics"}
                      </button>
                      <button
                        onClick={cancelEditingBasics}
                        className="w-full sm:w-auto text-xs px-3 py-2 rounded-md border border-slate-700 text-slate-300 hover:border-slate-500"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div className="space-y-1 text-xs text-slate-400 md:text-right">
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
                        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border border-slate-800 rounded-lg px-2 py-1"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1">
                          {m.photoDataUrl && (
                            <img
                              src={m.photoDataUrl}
                              alt="Meal"
                              className="h-12 w-12 object-cover rounded-md border border-slate-800"
                            />
                          )}
                          <div className="flex flex-col">
                            <span className="text-slate-200 text-sm whitespace-pre-wrap break-words">{m.description}</span>
                            <div className="text-[11px] text-slate-500 flex flex-wrap gap-3">
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
                          className="w-full sm:w-auto text-xs px-3 py-2 text-center rounded-md border border-slate-700 text-slate-300 hover:border-red-500 hover:text-red-200"
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
