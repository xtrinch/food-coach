import React, { useEffect, useMemo, useRef, useState } from "react";
import { db, useLiveTodayLog, normalizeFoodKey, useAllFoodPresets, MealEntry, getTodayId } from "../lib/db";
import { useAnalysisJobs } from "../lib/analysisJobs";
import { runDailyInsightIfNeeded, runMealCaloriesEstimation } from "../lib/openai";
import { ConfirmModal } from "../components/ConfirmModal";

export const TodayPage: React.FC = () => {
  const { todayLog, loading } = useLiveTodayLog();
  const { startJob, finishJob, failJob } = useAnalysisJobs();
  const { presets: savedPresets } = useAllFoodPresets();
  const [now, setNow] = useState(new Date());
  const [newMeal, setNewMeal] = useState("");
  const [manualCalories, setManualCalories] = useState("");
  const [calorieConfidence, setCalorieConfidence] = useState("3");
  const [saveAsPreset, setSaveAsPreset] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [selectedPresetId, setSelectedPresetId] = useState<string>("");
  const [noteText, setNoteText] = useState("");
  const [manualInsightRunning, setManualInsightRunning] = useState(false);
  const [editingMealId, setEditingMealId] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState("");
  const [editUserCalories, setEditUserCalories] = useState("");
  const [editConfidence, setEditConfidence] = useState("");
  const [editFinalCalories, setEditFinalCalories] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [mealPhotoDataUrl, setMealPhotoDataUrl] = useState<string | null>(null);
  const [editPhotoDataUrl, setEditPhotoDataUrl] = useState<string | null>(null);
  const catchupStarted = useRef(false);
  const [pendingDeleteMealId, setPendingDeleteMealId] = useState<string | null>(null);
  const [basicsOpenMobile, setBasicsOpenMobile] = useState(false);
  const macroStatus = (type: "protein" | "carbs" | "fat", grams: number, totalKcal: number) => {
    const kcalFromMacro = grams * (type === "fat" ? 9 : 4);
    const pct = totalKcal > 0 ? (kcalFromMacro / totalKcal) * 100 : 0;
    // Rough guide ranges (based on general dietary splits)
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

  const handlePhotoUpload = (file: File, setter: (data: string | null) => void) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        setter(result);
      }
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const isToday = useMemo(() => {
    const d = new Date();
    return todayLog?.date === d.toISOString().slice(0, 10);
  }, [todayLog]);

  useEffect(() => {
    if (!todayLog) return;
    if (!isToday) return;

    const hour = now.getHours();
    if (hour >= 22 && !todayLog.dailyInsightId) {
      (async () => {
      const jobId = startJob({
        type: "daily",
        label: `Daily – ${todayLog.date}`,
      });
      try {
        await runDailyInsightIfNeeded(todayLog.date, { jobId });
        finishJob(jobId);
      } catch (e) {
        console.error(e);
        failJob(jobId, (e as Error).message);
      }
      })();
    }
  }, [now, todayLog, isToday, startJob, finishJob, failJob]);

  useEffect(() => {
    if (!todayLog) return;
    const sorted = [...todayLog.meals].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    const alreadySorted =
      sorted.length === todayLog.meals.length && sorted.every((m, idx) => m.id === todayLog.meals[idx].id);
    if (alreadySorted) return;
    db.dailyLogs.update(todayLog.id, {
      meals: sorted,
      updatedAt: new Date().toISOString(),
    });
  }, [todayLog]);

  // Catch up a missed daily insight (e.g., yesterday) if one is absent.
  useEffect(() => {
    if (catchupStarted.current) return;
    catchupStarted.current = true;
    let cancelled = false;

    (async () => {
      const todayId = getTodayId();
      const missing = await db.dailyLogs
        .orderBy("date")
        .filter((log) => !log.dailyInsightId && log.date < todayId)
        .last();
      if (!missing || cancelled) return;

      const jobId = startJob({
        type: "daily",
        label: `Daily – ${missing.date} (catch-up)`,
      });
      try {
        await runDailyInsightIfNeeded(missing.date, { jobId });
        finishJob(jobId);
      } catch (e) {
        console.error(e);
        failJob(jobId, (e as Error).message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [startJob, finishJob, failJob]);

  if (loading || !todayLog) {
    return <div>Loading...</div>;
  }

  const handleWeightChange = async (value: string) => {
    const weight = value ? Number(value) : undefined;
    await db.dailyLogs.update(todayLog.id, {
      weightKg: Number.isNaN(weight) ? undefined : weight,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleSleepChange = async (value: string) => {
    const hours = value ? Number(value) : undefined;
    await db.dailyLogs.update(todayLog.id, {
      sleepHours: Number.isNaN(hours) ? undefined : hours,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleStressChange = async (value: string) => {
    const lvl = value ? Number(value) : undefined;
    await db.dailyLogs.update(todayLog.id, {
      stressLevel: Number.isNaN(lvl) ? undefined : lvl,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleBloatingChange = async (value: string) => {
    const lvl = value ? Number(value) : undefined;
    await db.dailyLogs.update(todayLog.id, {
      bloating: Number.isNaN(lvl) ? undefined : lvl,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleEnergyChange = async (value: string) => {
    const lvl = value ? Number(value) : undefined;
    await db.dailyLogs.update(todayLog.id, {
      energy: Number.isNaN(lvl) ? undefined : lvl,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleExerciseChange = async (value: string) => {
    const hrs = value ? Number(value) : undefined;
    await db.dailyLogs.update(todayLog.id, {
      exerciseHours: Number.isNaN(hrs) ? undefined : hrs,
      updatedAt: new Date().toISOString(),
    });
  };

  const resetMealForm = () => {
    setNewMeal("");
    setPresetName("");
    setSaveAsPreset(false);
    setManualCalories("");
    setCalorieConfidence("3");
    setSelectedPresetId("");
    setMealPhotoDataUrl(null);
  };

  const insertPresetIntoMeal = () => {
    if (!selectedPresetId) return;
    const preset = savedPresets.find((p) => String(p.id) === selectedPresetId);
    if (!preset) return;
    const snippet = `- ${preset.label} (from preset, fixed precalculated calories at ${preset.defaultCalories} kcal)`;
    const nextText = newMeal.trim() ? `${newMeal.trim()}\n${snippet}` : snippet;
    setNewMeal(nextText);

    const currentCalories = Number(manualCalories);
    const base = !Number.isNaN(currentCalories) ? currentCalories : 0;
    const nextCalories = base + preset.defaultCalories;
    setManualCalories(String(nextCalories));
    setCalorieConfidence("5");
  };

  const runManualDailyAnalysis = async () => {
    if (!todayLog) return;
    setManualInsightRunning(true);
    const jobId = startJob({
      type: "daily",
      label: `Daily – ${todayLog.date} (manual)`,
    });
    try {
      const existing = await db.dailyInsights.where("date").equals(todayLog.date).toArray();
      await Promise.all(existing.map((i) => db.dailyInsights.delete(String(i.id))));
      await runDailyInsightIfNeeded(todayLog.date, { jobId, force: true });
      finishJob(jobId);
    } catch (e) {
      console.error(e);
      failJob(jobId, (e as Error).message);
    } finally {
      setManualInsightRunning(false);
    }
  };

  const addMeal = async () => {
    if (!newMeal.trim() && !mealPhotoDataUrl) return;
    const description = newMeal.trim() || "(Photo meal)";
    const id = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    const presetKey = normalizeFoodKey(description);
    const nowIso = new Date().toISOString();

    const manualCaloriesValue = Number(manualCalories);
    const hasManualCalories = manualCalories.trim() !== "" && !Number.isNaN(manualCaloriesValue);
    const confidenceValue = Number(calorieConfidence);
    const entryBase = {
      id,
      timestamp,
      description,
      wantsPreset: saveAsPreset,
      presetKey,
      presetLabel: saveAsPreset ? (presetName.trim() || description) : undefined,
      photoDataUrl: mealPhotoDataUrl || undefined,
      userCaloriesEstimate: hasManualCalories ? manualCaloriesValue : undefined,
      userCaloriesConfidence:
        hasManualCalories && !Number.isNaN(confidenceValue) ? confidenceValue : undefined,
    };

    const existingPreset = await db.foodPresets.where("key").equals(presetKey).first();

    if (existingPreset) {
      const entry = {
        ...entryBase,
        llmCaloriesEstimate: existingPreset.defaultCalories,
        finalCaloriesEstimate: existingPreset.defaultCalories,
        presetLabel: existingPreset.label,
      };
      await db.dailyLogs.update(todayLog.id, {
        meals: [entry, ...todayLog.meals],
        updatedAt: nowIso,
      });

      if (saveAsPreset && presetName.trim() && presetName.trim() !== existingPreset.label) {
        await db.foodPresets.update(existingPreset.id!, {
          label: presetName.trim(),
          updatedAt: nowIso,
        });
      }

      resetMealForm();
      return;
    }

    await db.dailyLogs.update(todayLog.id, {
      meals: [entryBase, ...todayLog.meals],
      updatedAt: nowIso,
    });
    resetMealForm();

    const jobId = startJob({
      type: "custom",
      label: `Calories – ${description.slice(0, 24)}`,
    });
    try {
      const { calories, explanation, proteinGrams, carbsGrams, fatGrams } = await runMealCaloriesEstimation(
        description,
        {
          userEstimate: hasManualCalories ? manualCaloriesValue : undefined,
          userConfidence: hasManualCalories && !Number.isNaN(confidenceValue) ? confidenceValue : undefined,
          photoDataUrl: mealPhotoDataUrl || undefined,
        },
        { jobId }
      );
      const updatedLog = await db.dailyLogs.get(todayLog.id);
      const updatedMeals = (updatedLog?.meals ?? []).map((m) =>
        m.id === id
          ? {
              ...m,
              llmCaloriesEstimate: calories,
              llmCaloriesExplanation: explanation,
              finalCaloriesEstimate: calories,
              llmProteinGrams: proteinGrams,
              llmCarbsGrams: carbsGrams,
              llmFatGrams: fatGrams,
              finalProteinGrams: proteinGrams,
              finalCarbsGrams: carbsGrams,
              finalFatGrams: fatGrams,
            }
          : m
      );
      await db.dailyLogs.update(todayLog.id, {
        meals: updatedMeals,
        updatedAt: new Date().toISOString(),
      });

      const meal = updatedMeals.find((m) => m.id === id);
      if (meal?.wantsPreset && calories) {
        const nowPresetIso = new Date().toISOString();
        const key = meal.presetKey ?? normalizeFoodKey(meal.description);
        const label = meal.presetLabel || meal.description;
        const existingPreset = await db.foodPresets.where("key").equals(key).first();
        if (!existingPreset) {
          await db.foodPresets.add({
            key,
            label,
            defaultCalories: calories,
            createdAt: nowPresetIso,
            updatedAt: nowPresetIso,
          });
        } else {
          await db.foodPresets.update(existingPreset.id!, {
            defaultCalories: calories,
            label,
            updatedAt: nowPresetIso,
          });
        }
      }

      finishJob(jobId);
    } catch (e) {
      console.error(e);
      failJob(jobId, (e as Error).message);
    }
  };

  const startEditingMeal = (meal: MealEntry) => {
    setEditingMealId(meal.id);
    setEditDescription(meal.description);
    setEditUserCalories(meal.userCaloriesEstimate != null ? String(meal.userCaloriesEstimate) : "");
    setEditConfidence(meal.userCaloriesConfidence != null ? String(meal.userCaloriesConfidence) : "");
    const initialFinal =
      meal.finalCaloriesEstimate ??
      meal.llmCaloriesEstimate ??
      meal.userCaloriesEstimate
    setEditFinalCalories(initialFinal != null ? String(initialFinal) : "");
    setEditPhotoDataUrl(meal.photoDataUrl ?? null);
  };

  const cancelEditingMeal = () => {
    setEditingMealId(null);
    setEditDescription("");
    setEditUserCalories("");
    setEditConfidence("");
    setEditFinalCalories("");
    setEditBusy(false);
    setEditPhotoDataUrl(null);
  };

  const saveMealEdits = async () => {
    if (!editingMealId || !todayLog) return;
    const target = todayLog.meals.find((m) => m.id === editingMealId);
    if (!target) {
      cancelEditingMeal();
      return;
    }

    setEditBusy(true);
    const description = (editDescription || target.description).trim() || "(Photo meal)";
    const userEstimateParsed = editUserCalories.trim() !== "" ? Number(editUserCalories) : undefined;
    const userEstimate = Number.isNaN(userEstimateParsed) ? undefined : userEstimateParsed;
    const userConfidenceParsed = editConfidence.trim() !== "" ? Number(editConfidence) : undefined;
    const userConfidence = Number.isNaN(userConfidenceParsed) ? undefined : userConfidenceParsed;
    const finalParsed = editFinalCalories.trim() !== "" ? Number(editFinalCalories) : undefined;
    const finalEstimate = Number.isNaN(finalParsed) ? undefined : finalParsed;

    const descChanged = description !== target.description;
    const userChanged = (userEstimate ?? undefined) !== (target.userCaloriesEstimate ?? undefined);
    const confChanged = (userConfidence ?? undefined) !== (target.userCaloriesConfidence ?? undefined);
    const photoChanged = (editPhotoDataUrl ?? null) !== (target.photoDataUrl ?? null);
    const shouldRerunLLM = descChanged || userChanged || confChanged || photoChanged;

    const baseMeal: MealEntry = {
      ...target,
      description,
      userCaloriesEstimate: userEstimate,
      userCaloriesConfidence: userConfidence,
      presetKey: normalizeFoodKey(description),
      photoDataUrl: editPhotoDataUrl || undefined,
    };

    const nowIso = new Date().toISOString();
    const updatedMeals = todayLog.meals.map((m) =>
      m.id === target.id
        ? {
            ...baseMeal,
            llmCaloriesEstimate: shouldRerunLLM ? undefined : m.llmCaloriesEstimate,
            llmCaloriesExplanation: shouldRerunLLM ? undefined : m.llmCaloriesExplanation,
            finalCaloriesEstimate: shouldRerunLLM ? undefined : finalEstimate,
          }
        : m
    );

    await db.dailyLogs.update(todayLog.id, {
      meals: updatedMeals,
      updatedAt: nowIso,
    });

    if (shouldRerunLLM) {
      const jobId = startJob({
        type: "custom",
        label: `Calories – ${description.slice(0, 24)}`,
      });
      try {
        const { calories, explanation, proteinGrams, carbsGrams, fatGrams } = await runMealCaloriesEstimation(
          description,
          {
            userEstimate,
            userConfidence,
            photoDataUrl: editPhotoDataUrl || undefined,
          },
          { jobId }
        );
        const latest = await db.dailyLogs.get(todayLog.id);
        const refreshedMeals = (latest?.meals ?? []).map((m) =>
          m.id === target.id
            ? {
                ...m,
                llmCaloriesEstimate: calories,
                llmCaloriesExplanation: explanation,
                finalCaloriesEstimate: calories,
                llmProteinGrams: proteinGrams,
                llmCarbsGrams: carbsGrams,
                llmFatGrams: fatGrams,
                finalProteinGrams: proteinGrams,
                finalCarbsGrams: carbsGrams,
                finalFatGrams: fatGrams,
              }
            : m
        );
        await db.dailyLogs.update(todayLog.id, {
          meals: refreshedMeals,
          updatedAt: new Date().toISOString(),
        });
        finishJob(jobId);
      } catch (e) {
        console.error(e);
        failJob(jobId, (e as Error).message);
      }
    }

    cancelEditingMeal();
    setEditBusy(false);
  };

  const deleteMeal = async (mealId: string) => {
    const updatedMeals = todayLog.meals.filter((m) => m.id !== mealId);
    await db.dailyLogs.update(todayLog.id, {
      meals: updatedMeals,
      updatedAt: new Date().toISOString(),
    });
  };

  const addNoteEntry = async () => {
    if (!noteText.trim()) return;
    const entry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      notes: noteText.trim(),
    };
    await db.dailyLogs.update(todayLog.id, {
      notes: [...todayLog.notes, entry],
      updatedAt: new Date().toISOString(),
    });
    setNoteText("");
  };

  const nowHour = now.getHours();
  const canSetStress = !isToday || nowHour >= 19;

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h1 className="text-xl font-semibold">Today – {todayLog.date}</h1>
        <p className="text-sm text-slate-400">
          Log your day. Daily analysis runs automatically around 22:00 using your recent history.
        </p>
        <button
          onClick={runManualDailyAnalysis}
          disabled={manualInsightRunning}
          className="w-full sm:w-auto text-xs px-3 py-2 rounded-md border border-slate-700 hover:border-indigo-500 disabled:opacity-60"
        >
          {manualInsightRunning ? "Running daily analysis..." : "Run daily analysis now"}
        </button>
      </section>

      <section className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-slate-200">Daily basics</h2>
            <p className="text-[11px] text-slate-500">Once per day: weight, sleep, stress, bloating, energy.</p>
          </div>
          <button
            type="button"
            onClick={() => setBasicsOpenMobile((prev) => !prev)}
            className="sm:hidden text-[11px] px-3 py-2 rounded-md border border-slate-700 text-slate-300 hover:border-indigo-500"
            aria-expanded={basicsOpenMobile}
            aria-controls="daily-basics-grid"
          >
            {basicsOpenMobile ? "Hide basics" : "Show basics"}
          </button>
        </div>
        <div
          id="daily-basics-grid"
          className={`${basicsOpenMobile ? "grid" : "hidden"} sm:grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5`}
        >
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-400">Weight (kg)</label>
            <input
              type="number"
              step="0.1"
              className="w-full"
              value={todayLog.weightKg ?? ""}
              onChange={(e) => handleWeightChange(e.target.value)}
              placeholder="e.g. 68.4"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-400">Sleep (hours)</label>
            <input
              type="number"
              step="0.1"
              className="w-full"
              value={todayLog.sleepHours ?? ""}
              onChange={(e) => handleSleepChange(e.target.value)}
              placeholder="e.g. 7.5"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-400">
              Stress (0–5){isToday && !canSetStress ? " – after 19:00" : ""}
            </label>
            <input
              type="number"
              min={0}
              max={5}
              className="w-full"
              value={todayLog.stressLevel ?? ""}
              onChange={(e) => handleStressChange(e.target.value)}
              disabled={!canSetStress}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-400">Bloating (0–5)</label>
            <input
              type="number"
              min={0}
              max={5}
              className="w-full"
              value={todayLog.bloating ?? ""}
              onChange={(e) => handleBloatingChange(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-400">Energy (0–5)</label>
            <input
              type="number"
              min={0}
              max={5}
              className="w-full"
              value={todayLog.energy ?? ""}
              onChange={(e) => handleEnergyChange(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-400">Exercise (hours)</label>
            <input
              type="number"
              step="0.1"
              min={0}
              className="w-full"
              value={todayLog.exerciseHours ?? ""}
              onChange={(e) => handleExerciseChange(e.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-indigo-900/70 bg-indigo-950/30 p-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-sm font-semibold text-slate-200">Meals</h2>
          <p className="text-[11px] text-slate-500">Add throughout the day. Photos optional.</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 grid gap-3 text-sm text-slate-200 sm:grid-cols-2 lg:grid-cols-3">
          {(() => {
            const totalProtein = todayLog.meals
              .map((m) => m.finalProteinGrams ?? m.llmProteinGrams ?? 0)
              .reduce((a, b) => a + (b ?? 0), 0);
            const totalCarbs = todayLog.meals
              .map((m) => m.finalCarbsGrams ?? m.llmCarbsGrams ?? 0)
              .reduce((a, b) => a + (b ?? 0), 0);
            const totalFat = todayLog.meals
              .map((m) => m.finalFatGrams ?? m.llmFatGrams ?? 0)
              .reduce((a, b) => a + (b ?? 0), 0);
            const totalKcal = todayLog.meals
              .map((m) => m.finalCaloriesEstimate ?? m.llmCaloriesEstimate ?? m.userCaloriesEstimate ?? 0)
              .reduce((a, b) => a + (b ?? 0), 0);
            const proteinStatus = macroStatus("protein", totalProtein, totalKcal);
            const carbStatus = macroStatus("carbs", totalCarbs, totalKcal);
            const fatStatus = macroStatus("fat", totalFat, totalKcal);
            return (
              <>
                <div className="space-y-0.5">
                  <span className="text-xs text-slate-400">Total estimated</span>
                  <div className="font-semibold">{totalKcal} kcal</div>
                </div>
                <div className="space-y-1 text-xs text-slate-400">
                  <span>Macros (grams)</span>
                  <div className="text-sm text-slate-200 font-semibold flex flex-wrap gap-3">
                    <span className={proteinStatus.color}>
                      Protein: {totalProtein} g
                    </span>
                    <span className={carbStatus.color}>
                      Carbs: {totalCarbs} g
                    </span>
                    <span className={fatStatus.color}>
                      Fat: {totalFat} g
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                  <span>Legend:</span>
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block h-2 w-4 rounded bg-sky-300" />
                    <span>Low</span>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block h-2 w-4 rounded bg-emerald-300" />
                    <span>OK</span>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block h-2 w-4 rounded bg-red-300" />
                    <span>High</span>
                  </span>
                </div>
              </>
            );
          })()}
        </div>
        <div className="flex flex-col gap-3">
          <div className="rounded-xl border border-indigo-900/60 bg-slate-900/50 p-3 space-y-3">
            <div className="space-y-1">
              <label className="text-xs text-slate-400">Meal description</label>
              <textarea
                className="w-full min-h-[100px]"
                value={newMeal}
                onChange={(e) => setNewMeal(e.target.value)}
                placeholder="e.g. 200g Greek yogurt, 1 banana, 15g walnuts"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="space-y-1 min-w-[150px] flex-1">
                <label className="text-xs text-slate-400">Kcal estimate (optional)</label>
                <input
                  type="number"
                  className="w-full"
                  value={manualCalories}
                  onChange={(e) => setManualCalories(e.target.value)}
                  placeholder="e.g. 420"
                />
              </div>
              <div className="space-y-1 min-w-[150px] flex-1">
                <label className="text-xs text-slate-400">Confidence (1–5)</label>
                <select
                  className="w-full"
                  value={calorieConfidence}
                  onChange={(e) => setCalorieConfidence(e.target.value)}
                  disabled={!manualCalories.trim()}
                >
                  <option value="1">1 – Not confident</option>
                  <option value="2">2</option>
                  <option value="3">3 – Moderate</option>
                  <option value="4">4</option>
                  <option value="5">5 – Very confident</option>
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-400">
                Optional photo (stored locally; sent to AI for calorie estimation)
              </label>
              <div className="flex items-start gap-3 flex-wrap w-full sm:flex-nowrap">
                <input
                  type="file"
                  accept="image/*"
                  className="w-full sm:w-auto max-w-full text-xs sm:text-sm file:mr-2 file:rounded-md file:border-0 file:bg-slate-700 file:px-3 file:py-1.5 file:text-xs sm:file:text-sm file:text-slate-50"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handlePhotoUpload(f, setMealPhotoDataUrl);
                  }}
                />
                {mealPhotoDataUrl && (
                  <button
                    type="button"
                    onClick={() => setMealPhotoDataUrl(null)}
                    className="text-xs px-3 py-2 rounded-md border border-slate-700 text-slate-300 hover:border-red-500 hover:text-red-200"
                  >
                    Remove photo
                  </button>
                )}
              </div>
              {mealPhotoDataUrl && (
                <img
                  src={mealPhotoDataUrl}
                  alt="Meal preview"
                  className="max-h-40 rounded-lg border border-slate-800 object-cover"
                />
              )}
            </div>
            <div className="border-t border-slate-800 pt-2 space-y-2">
              <details>
                <summary className="text-xs text-slate-400 cursor-pointer">Insert preset into description</summary>
                <div className="mt-2 space-y-1">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <select
                      value={selectedPresetId}
                      onChange={(e) => setSelectedPresetId(e.target.value)}
                      className="flex-1 w-full"
                    >
                      <option value="">Choose a preset</option>
                      {savedPresets.map((p) => (
                        <option key={p.id ?? p.key} value={String(p.id)}>
                          {p.label} – {p.defaultCalories} kcal
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={insertPresetIntoMeal}
                      className="text-xs w-full sm:w-auto px-3 py-2 rounded-md border border-slate-700 hover:border-indigo-500"
                    >
                      Insert
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Adds preset text with exact calories into the meal so AI treats it as certain.
                  </p>
                </div>
              </details>
              <label className="flex items-center gap-2 text-xs text-slate-400">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-600"
                  checked={saveAsPreset}
                  onChange={(e) => setSaveAsPreset(e.target.checked)}
                />
                Save this as a reusable preset
              </label>
              {saveAsPreset && (
                <input
                  type="text"
                  className="text-xs w-full sm:w-56"
                  placeholder="Preset name (e.g. Standard cappuccino)"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                />
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={addMeal}
              className="w-full sm:w-auto px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-sm"
            >
              Add meal
            </button>
          </div>
        </div>
        <div className="space-y-2">
          {todayLog.meals.length === 0 && (
            <p className="text-xs text-slate-500">No meals logged yet.</p>
          )}
          {todayLog.meals.map((meal) => {
            const finalCalories = meal.finalCaloriesEstimate ?? meal.llmCaloriesEstimate ?? meal.userCaloriesEstimate;
            const calories = finalCalories;
            const isEditing = editingMealId === meal.id;
            return (
              <div key={meal.id} className="border border-slate-800 rounded-xl px-3 py-2 flex flex-col gap-2 bg-slate-900/50">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex-1">
                    {isEditing ? (
                      <textarea
                        className="w-full text-sm"
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                      />
                    ) : (
                      <div className="text-sm text-slate-100 whitespace-pre-wrap">{meal.description}</div>
                    )}
                    {!isEditing && calories != null && (
                      <div className="text-sm font-semibold text-indigo-100 mt-1">
                        Final estimate: {calories} kcal
                      </div>
                    )}
                    {!isEditing && (
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mt-1">
                        {meal.presetLabel && (
                          <span className="text-emerald-400">
                            Preset: {meal.presetLabel}
                          </span>
                        )}
                        {meal.userCaloriesEstimate != null && (
                          <span>
                            Your estimate:{" "}
                            <span className="text-amber-300 font-medium">
                              {meal.userCaloriesEstimate} kcal
                            </span>
                            {meal.userCaloriesConfidence ? ` (${meal.userCaloriesConfidence}/5 confidence)` : ""}
                          </span>
                        )}
                        {meal.llmCaloriesEstimate != null && (
                          <span>
                            LLM estimate:{" "}
                            <span className="text-indigo-300 font-medium">
                              {meal.llmCaloriesEstimate} kcal
                            </span>
                          </span>
                        )}
                        {meal.finalCaloriesEstimate != null && (
                          <span>
                            Final estimate:{" "}
                            <span className="text-slate-100 font-medium">
                              {meal.finalCaloriesEstimate} kcal
                            </span>
                          </span>
                        )}
                        {(meal.finalProteinGrams ?? meal.llmProteinGrams) != null && (
                          <span>
                            Macros:{" "}
                            <span className="text-slate-100 font-medium">
                              Protein {meal.finalProteinGrams ?? meal.llmProteinGrams ?? 0}g · Carbs{" "}
                              {meal.finalCarbsGrams ?? meal.llmCarbsGrams ?? 0}g · Fat{" "}
                              {meal.finalFatGrams ?? meal.llmFatGrams ?? 0}g
                            </span>
                          </span>
                        )}
                        {meal.llmCaloriesExplanation && (
                          <span className="text-[11px] text-slate-500">
                            Reason: {meal.llmCaloriesExplanation}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400 w-full sm:w-auto sm:justify-end">
                    <span className="text-[10px] text-slate-500 sm:text-right w-full sm:w-auto">
                      {new Date(meal.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    {isEditing ? (
                      <button
                        onClick={cancelEditingMeal}
                        className="text-xs px-3 py-2 rounded-md border border-slate-700 text-slate-300 hover:border-slate-500"
                      >
                        Cancel
                      </button>
                    ) : (
                      <button
                        onClick={() => startEditingMeal(meal)}
                        className="text-xs px-3 py-2 rounded-md border border-slate-700 text-slate-300 hover:border-indigo-400"
                      >
                        Edit
                      </button>
                    )}
                    <button
                      onClick={() => setPendingDeleteMealId(meal.id)}
                      className="text-xs px-3 py-2 rounded-md border border-slate-700 text-slate-300 hover:border-red-500 hover:text-red-200"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                {isEditing ? (
                  <div className="space-y-2">
                    <div className="space-y-1">
                      <label className="text-[11px] text-slate-400">Photo (optional)</label>
                      <div className="flex items-start gap-3 flex-wrap w-full sm:flex-nowrap">
                        <input
                          type="file"
                          accept="image/*"
                          className="w-full sm:w-auto max-w-full text-xs sm:text-sm file:mr-2 file:rounded-md file:border-0 file:bg-slate-700 file:px-3 file:py-1.5 file:text-xs sm:file:text-sm file:text-slate-50"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handlePhotoUpload(f, setEditPhotoDataUrl);
                          }}
                        />
                        {editPhotoDataUrl && (
                          <button
                            type="button"
                            onClick={() => setEditPhotoDataUrl(null)}
                            className="text-xs px-3 py-2 rounded-md border border-slate-700 text-slate-300 hover:border-red-500 hover:text-red-200"
                          >
                            Remove photo
                          </button>
                        )}
                      </div>
                      {editPhotoDataUrl && (
                        <img
                          src={editPhotoDataUrl}
                          alt="Meal preview"
                          className="max-h-32 rounded-lg border border-slate-800 object-cover ml-auto"
                        />
                      )}
                    </div>
                    <div className="grid sm:grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <label className="text-[11px] text-slate-400">Your estimate</label>
                        <input
                          type="number"
                          className="w-full"
                          value={editUserCalories}
                          onChange={(e) => setEditUserCalories(e.target.value)}
                          placeholder="e.g. 420"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] text-slate-400">Confidence (1–5)</label>
                        <select className="w-full" value={editConfidence} onChange={(e) => setEditConfidence(e.target.value)}>
                          <option value="">Not set</option>
                          <option value="1">1</option>
                          <option value="2">2</option>
                          <option value="3">3</option>
                          <option value="4">4</option>
                          <option value="5">5</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] text-slate-400">Final estimate (editable)</label>
                        <input
                          type="number"
                          className="w-full"
                          value={editFinalCalories}
                          onChange={(e) => setEditFinalCalories(e.target.value)}
                          placeholder="e.g. 480"
                        />
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Editing the description, your estimate, or confidence will re-run the LLM and reset the final
                      estimate to the new LLM result.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                      <button
                        onClick={saveMealEdits}
                        disabled={editBusy}
                        className="w-full sm:w-auto text-xs px-3 py-2 rounded-md bg-indigo-500 hover:bg-indigo-600 disabled:opacity-60"
                      >
                        {editBusy ? "Saving..." : "Save meal"}
                      </button>
                      <button
                        onClick={cancelEditingMeal}
                        className="w-full sm:w-auto text-xs px-3 py-2 rounded-md border border-slate-700 hover:border-slate-500 text-slate-300"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-start sm:justify-end">
                    {meal.photoDataUrl && (
                      <img
                        src={meal.photoDataUrl}
                        alt="Meal"
                        className="max-h-24 rounded-lg border border-slate-800 object-cover"
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <ConfirmModal
        open={pendingDeleteMealId !== null}
        title="Delete meal?"
        message="This will remove the meal entry permanently."
        confirmLabel="Delete"
        onConfirm={() => {
          if (!pendingDeleteMealId) return;
          void deleteMeal(pendingDeleteMealId);
          setPendingDeleteMealId(null);
        }}
        onCancel={() => setPendingDeleteMealId(null)}
      />

      <section className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-sm font-semibold text-slate-200">Notes</h2>
          <p className="text-[11px] text-slate-500">Log anything you notice throughout the day.</p>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-slate-400">Notes</label>
          <textarea
            className="w-full min-h-[60px]"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="e.g. gassy in the evening, upper stomach pressure"
          />
        </div>
        <button
          onClick={addNoteEntry}
          className="w-full sm:w-auto px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm"
        >
          Add note
        </button>
        <div className="space-y-1">
          {todayLog.notes.length === 0 && (
            <p className="text-xs text-slate-500">No notes logged yet.</p>
          )}
          {todayLog.notes.map((s) => (
            <div
              key={s.id}
              className="border border-slate-800 rounded-xl px-3 py-2 flex flex-col gap-1 text-xs text-slate-300"
            >
              <div className="flex justify-between">
                <span className="text-[10px] text-slate-500">
                  {new Date(s.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              {s.notes && <p className="text-slate-400">{s.notes}</p>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
