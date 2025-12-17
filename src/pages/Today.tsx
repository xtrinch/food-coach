import React, { useEffect, useMemo, useRef, useState } from "react";
import { db, useLiveDailyLog, MealEntry, getTodayId } from "../lib/db";
import { useAnalysisJobs } from "../lib/analysisJobs";
import { runDailyInsightIfNeeded, runMealCaloriesEstimation } from "../lib/openai";
import { ConfirmModal } from "../components/ConfirmModal";
import { compressImageFile, fileToDataUrl } from "../lib/imageCompression";

const ArrowLeftIcon: React.FC<{ className?: string }> = ({ className = "h-4 w-4" }) => (
  <svg
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <path d="M12.5 4.5 7 10l5.5 5.5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ArrowRightIcon: React.FC<{ className?: string }> = ({ className = "h-4 w-4" }) => (
  <svg
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <path d="M7.5 4.5 13 10l-5.5 5.5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const TodayPage: React.FC = () => {
  const { startJob, finishJob, failJob } = useAnalysisJobs();
  const [selectedDate, setSelectedDate] = useState(getTodayId());
  const [autoCreateBlockedDate, setAutoCreateBlockedDate] = useState<string | null>(null);
  const { dailyLog: todayLog, loading } = useLiveDailyLog(selectedDate, {
    createIfMissing: autoCreateBlockedDate !== selectedDate,
  });
  const [now, setNow] = useState(new Date());
  const [newMeal, setNewMeal] = useState("");
  const [noteText, setNoteText] = useState("");
  const [manualInsightRunning, setManualInsightRunning] = useState(false);
  const [editingMealId, setEditingMealId] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState("");
  const [editFinalCalories, setEditFinalCalories] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [mealPhotoDataUrl, setMealPhotoDataUrl] = useState<string | null>(null);
  const [editPhotoDataUrl, setEditPhotoDataUrl] = useState<string | null>(null);
  const catchupStarted = useRef(false);
  const lastDateRequest = useRef<string | null>(null);
  const [pendingDeleteMealId, setPendingDeleteMealId] = useState<string | null>(null);
  const [pendingDeleteDay, setPendingDeleteDay] = useState<string | null>(null);
  const [pendingCreateDate, setPendingCreateDate] = useState<string | null>(null);
  const [basicsOpenMobile, setBasicsOpenMobile] = useState(false);

  const formatDate = (value: Date) => value.toISOString().slice(0, 10);

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

  const fiberStatus = (grams: number) => {
    if (grams < 20) return { label: "Low", color: "text-sky-300" };
    if (grams > 40) return { label: "High", color: "text-amber-300" };
    return { label: "OK", color: "text-emerald-300" };
  };

  const handlePhotoUpload = (file: File, setter: (data: string | null) => void) => {
    const process = async () => {
      try {
        const compressed = await compressImageFile(file);
        setter(compressed);
      } catch (err) {
        console.error("Failed to compress image, falling back to original file", err);
        try {
          const fallback = await fileToDataUrl(file);
          setter(fallback);
        } catch (fallbackErr) {
          console.error("Failed to read image file", fallbackErr);
          setter(null);
        }
      }
    };
    void process();
  };

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const todayId = useMemo(() => now.toISOString().slice(0, 10), [now]);
  const isToday = selectedDate === todayId;

  const requestDateChange = async (value: string) => {
    if (!value) return;
    const targetDate = value > todayId ? todayId : value;
    if (autoCreateBlockedDate && autoCreateBlockedDate !== targetDate) {
      setAutoCreateBlockedDate(null);
    }
    lastDateRequest.current = targetDate;
    if (value > todayId) {
      setSelectedDate(todayId);
      setPendingCreateDate(null);
      return;
    }
    const existing = await db.dailyLogs.get(targetDate);
    if (lastDateRequest.current !== targetDate) return;
    if (existing || targetDate === todayId) {
      setSelectedDate(targetDate);
      setPendingCreateDate(null);
      return;
    }
    setPendingCreateDate(targetDate);
  };

  const shiftSelectedDate = (delta: number) => {
    const base = new Date(`${selectedDate}T00:00:00Z`);
    if (Number.isNaN(base.getTime())) return;
    base.setUTCDate(base.getUTCDate() + delta);
    const nextDate = formatDate(base);
    void requestDateChange(nextDate);
  };

  const handleDateChange = (value: string) => {
    void requestDateChange(value);
  };

  const createBlankLog = async (date: string) => {
    if (!date) return;
    if (date > todayId) return;
    const existing = await db.dailyLogs.get(date);
    if (existing) {
      setAutoCreateBlockedDate(null);
      setSelectedDate(date);
      return;
    }
    const nowIso = new Date().toISOString();
    await db.dailyLogs.add({
      id: date,
      date,
      meals: [],
      notes: [],
      exerciseHours: undefined,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    setAutoCreateBlockedDate(null);
    setSelectedDate(date);
  };

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

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!todayLog) {
    return (
      <div className="space-y-6">
        <section className="space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <h1 className="text-xl font-semibold">Day – {selectedDate}</h1>
              <p className="text-sm text-slate-400">No log exists for this date.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => shiftSelectedDate(-1)}
                className="text-xs px-3 py-2 rounded-md border border-slate-700 text-slate-200 hover:border-indigo-500 flex items-center justify-center"
                aria-label="Previous day"
              >
                <span className="sr-only">Previous day</span>
                <ArrowLeftIcon />
              </button>
              <input
                type="date"
                value={selectedDate}
                max={todayId}
                onChange={(e) => void handleDateChange(e.target.value)}
                className="rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-0"
              />
              <button
                type="button"
                onClick={() => shiftSelectedDate(1)}
                disabled={selectedDate >= todayId}
                className="text-xs px-3 py-2 rounded-md border border-slate-700 text-slate-200 hover:border-indigo-500 disabled:opacity-60 flex items-center justify-center"
                aria-label="Next day"
              >
                <span className="sr-only">Next day</span>
                <ArrowRightIcon />
              </button>
              <button
                type="button"
                onClick={() => handleDateChange(todayId)}
                disabled={selectedDate === todayId}
                className="text-xs px-3 py-2 rounded-md border border-slate-700 text-slate-200 hover:border-indigo-500 disabled:opacity-60"
              >
                Jump to today
              </button>
            </div>
          </div>
        </section>

        <section className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-sm text-slate-300">
            This day has no log. You can create a blank entry or pick another date.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void createBlankLog(selectedDate)}
              className="text-xs px-3 py-2 rounded-md bg-indigo-500 hover:bg-indigo-600 text-slate-50"
            >
              Create blank log
            </button>
            <button
              onClick={() => handleDateChange(todayId)}
              className="text-xs px-3 py-2 rounded-md border border-slate-700 text-slate-200 hover:border-indigo-500"
              disabled={selectedDate === todayId}
            >
              Jump to today
            </button>
          </div>
        </section>
      </div>
    );
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
    setMealPhotoDataUrl(null);
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
    const nowIso = new Date().toISOString();

    const entryBase = {
      id,
      timestamp,
      description,
      photoDataUrl: mealPhotoDataUrl || undefined,
    };

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
      const dayHistory = {
        ...todayLog,
        meals: todayLog.meals.map(({ photoDataUrl, ...rest }) => rest),
      };
      const { calories, explanation, improvements, proteinGrams, carbsGrams, fatGrams, fiberGrams } =
        await runMealCaloriesEstimation(
          description,
          { photoDataUrl: mealPhotoDataUrl || undefined, dayHistory },
          { jobId }
      );
      const updatedLog = await db.dailyLogs.get(todayLog.id);
      const updatedMeals = (updatedLog?.meals ?? []).map((m) =>
        m.id === id
          ? {
              ...m,
              llmCaloriesEstimate: calories,
              llmCaloriesExplanation: explanation,
              llmImprovementSuggestions: improvements && improvements.length > 0 ? improvements : undefined,
              finalCaloriesEstimate: calories,
              llmProteinGrams: proteinGrams,
              llmCarbsGrams: carbsGrams,
              llmFatGrams: fatGrams,
              llmFiberGrams: fiberGrams,
              finalProteinGrams: proteinGrams,
              finalCarbsGrams: carbsGrams,
              finalFatGrams: fatGrams,
              finalFiberGrams: fiberGrams,
            }
          : m
      );
      await db.dailyLogs.update(todayLog.id, {
        meals: updatedMeals,
        updatedAt: new Date().toISOString(),
      });
      finishJob(jobId);
    } catch (e) {
      console.error(e);
      failJob(jobId, (e as Error).message);
    }
  };

  const startEditingMeal = (meal: MealEntry) => {
    setEditingMealId(meal.id);
    setEditDescription(meal.description);
    const initialFinal = meal.finalCaloriesEstimate ?? meal.llmCaloriesEstimate;
    setEditFinalCalories(initialFinal != null ? String(initialFinal) : "");
    setEditPhotoDataUrl(meal.photoDataUrl ?? null);
  };

  const cancelEditingMeal = () => {
    setEditingMealId(null);
    setEditDescription("");
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
    const finalParsed = editFinalCalories.trim() !== "" ? Number(editFinalCalories) : undefined;
    const finalEstimate = Number.isNaN(finalParsed) ? undefined : finalParsed;

    const descChanged = description !== target.description;
    const photoChanged = (editPhotoDataUrl ?? null) !== (target.photoDataUrl ?? null);
    const shouldRerunLLM = descChanged || photoChanged;

    const baseMeal: MealEntry = {
      ...target,
      description,
      photoDataUrl: editPhotoDataUrl || undefined,
    };

    const nowIso = new Date().toISOString();
    const updatedMeals = todayLog.meals.map((m) =>
      m.id === target.id
        ? {
            ...baseMeal,
            llmCaloriesEstimate: shouldRerunLLM ? undefined : m.llmCaloriesEstimate,
            llmCaloriesExplanation: shouldRerunLLM ? undefined : m.llmCaloriesExplanation,
            llmImprovementSuggestions: shouldRerunLLM ? undefined : m.llmImprovementSuggestions,
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
        const latestLog = await db.dailyLogs.get(todayLog.id);
        const historySource = latestLog ?? todayLog;
        const dayHistory = {
          ...historySource,
          meals: (historySource.meals ?? []).map(({ photoDataUrl, ...rest }) => rest),
        };
        const { calories, explanation, improvements, proteinGrams, carbsGrams, fatGrams, fiberGrams } =
          await runMealCaloriesEstimation(description, { photoDataUrl: editPhotoDataUrl || undefined, dayHistory }, { jobId });
        const latest = await db.dailyLogs.get(todayLog.id);
        const refreshedMeals = (latest?.meals ?? []).map((m) =>
          m.id === target.id
            ? {
                ...m,
                llmCaloriesEstimate: calories,
                llmCaloriesExplanation: explanation,
                llmImprovementSuggestions: improvements && improvements.length > 0 ? improvements : undefined,
                finalCaloriesEstimate: calories,
                llmProteinGrams: proteinGrams,
                llmCarbsGrams: carbsGrams,
                llmFatGrams: fatGrams,
                llmFiberGrams: fiberGrams,
                finalProteinGrams: proteinGrams,
                finalCarbsGrams: carbsGrams,
                finalFatGrams: fatGrams,
                finalFiberGrams: fiberGrams,
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

  const deleteDay = async (date: string) => {
    await db.dailyInsights.where("date").equals(date).delete();
    await db.dailyLogs.delete(date);
    setAutoCreateBlockedDate(date);
    if (selectedDate === date) {
      setEditingMealId(null);
      setPendingDeleteMealId(null);
      setPendingCreateDate(null);
      setPendingDeleteDay(null);
      setNewMeal("");
      setNoteText("");
      setMealPhotoDataUrl(null);
      setEditPhotoDataUrl(null);
      setSelectedPresetId("");
      setSaveAsPreset(false);
      setPresetName("");
    }
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
      <section className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold">Today – {todayLog.date}</h1>
            <p className="text-sm text-slate-400">
              Log your day. Daily analysis runs automatically around 22:00 using your recent history.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => shiftSelectedDate(-1)}
              className="text-xs px-3 py-2 rounded-md border border-slate-700 text-slate-200 hover:border-indigo-500 flex items-center justify-center"
              aria-label="Previous day"
            >
              <span className="sr-only">Previous day</span>
              <ArrowLeftIcon />
            </button>
            <input
              type="date"
              value={selectedDate}
              max={todayId}
              onChange={(e) => void handleDateChange(e.target.value)}
              className="rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-0"
            />
            <button
              type="button"
              onClick={() => shiftSelectedDate(1)}
              disabled={selectedDate >= todayId}
              className="text-xs px-3 py-2 rounded-md border border-slate-700 text-slate-200 hover:border-indigo-500 disabled:opacity-60 flex items-center justify-center"
              aria-label="Next day"
            >
              <span className="sr-only">Next day</span>
              <ArrowRightIcon />
            </button>
            <button
              type="button"
              onClick={() => handleDateChange(todayId)}
              disabled={selectedDate === todayId}
              className="text-xs px-3 py-2 rounded-md border border-slate-700 text-slate-200 hover:border-indigo-500 disabled:opacity-60"
            >
              Jump to today
            </button>
            <button
              type="button"
              onClick={() => setPendingDeleteDay(todayLog.date)}
              className="text-xs px-3 py-2 rounded-md border border-red-700 text-red-200 hover:border-red-500 hover:text-red-100"
            >
              Delete this day
            </button>
          </div>
        </div>
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
            const totalFiber = todayLog.meals
              .map((m) => m.finalFiberGrams ?? m.llmFiberGrams ?? 0)
              .reduce((a, b) => a + (b ?? 0), 0);
            const totalKcal = todayLog.meals
              .map((m) => m.finalCaloriesEstimate ?? m.llmCaloriesEstimate ?? 0)
              .reduce((a, b) => a + (b ?? 0), 0);
            const proteinStatus = macroStatus("protein", totalProtein, totalKcal);
            const carbStatus = macroStatus("carbs", totalCarbs, totalKcal);
            const fatStatus = macroStatus("fat", totalFat, totalKcal);
            const fiberTrend = fiberStatus(totalFiber);
            return (
              <>
                <div className="space-y-0.5">
                  <span className="text-xs text-slate-400">Total estimated</span>
                  <div className="font-semibold">{totalKcal} kcal</div>
                </div>
                <div className="space-y-1 text-xs text-slate-400">
                  <span>Macros & fiber (grams)</span>
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
                    <span className={fiberTrend.color}>
                      Fiber: {totalFiber} g
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">Fiber target: roughly 25–35 g/day.</p>
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
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block h-2 w-4 rounded bg-amber-300" />
                    <span>High fiber</span>
                  </span>
                </div>
              </>
            );
          })()}
        </div>
        <div className="flex flex-col gap-3">
          <div className="rounded-xl border border-indigo-900/60 bg-slate-900/50 p-3 space-y-3">
            <div className="space-y-1">
              <label className="text-xs text-slate-400">
                Meal description (include any calorie notes or macros)
              </label>
              <textarea
                className="w-full min-h-[100px]"
                value={newMeal}
                onChange={(e) => setNewMeal(e.target.value)}
                placeholder="e.g. 200g Greek yogurt, 1 banana, 15g walnuts"
              />
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
              <p className="text-[11px] text-slate-500">
                Add as many meals as you want throughout the day. Photos are optional but help with estimates.
              </p>
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
            const finalCalories = meal.finalCaloriesEstimate ?? meal.llmCaloriesEstimate;
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
                              {meal.finalFatGrams ?? meal.llmFatGrams ?? 0}g · Fiber{" "}
                              {meal.finalFiberGrams ?? meal.llmFiberGrams ?? 0}g
                            </span>
                          </span>
                        )}
                        {meal.llmCaloriesExplanation && (
                          <span className="text-[11px] text-slate-500">
                            Calorie breakdown: {meal.llmCaloriesExplanation}
                          </span>
                        )}
                        {meal.llmImprovementSuggestions && meal.llmImprovementSuggestions.length > 0 && (
                          <div className="text-[11px] text-slate-500 flex flex-col gap-1">
                            <span className="text-slate-400">Improvements:</span>
                            <ul className="list-disc pl-4 space-y-0.5">
                              {meal.llmImprovementSuggestions.map((tip, idx) => (
                                <li key={`${meal.id}-improve-${idx}`} className="text-slate-400">
                                  {tip}
                                </li>
                              ))}
                            </ul>
                          </div>
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
                    <div className="space-y-1 max-w-xs">
                      <label className="text-[11px] text-slate-400">Final estimate (editable)</label>
                      <input
                        type="number"
                        className="w-full"
                        value={editFinalCalories}
                        onChange={(e) => setEditFinalCalories(e.target.value)}
                        placeholder="e.g. 480"
                      />
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Editing the description or photo will re-run the LLM and reset the final estimate to the new LLM
                      result.
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
        open={pendingCreateDate !== null}
        title="Create daily log?"
        message={`No daily log exists for ${pendingCreateDate ?? ""}. Create a blank entry for this date?`}
        confirmLabel="Create log"
        cancelLabel="Stay on current day"
        onConfirm={() => {
          if (!pendingCreateDate) return;
          void createBlankLog(pendingCreateDate);
          setPendingCreateDate(null);
        }}
        onCancel={() => setPendingCreateDate(null)}
      />

      <ConfirmModal
        open={pendingDeleteDay !== null}
        title="Delete this day?"
        message={`This will remove all meals, notes, basics, and insights for ${pendingDeleteDay ?? ""}.`}
        confirmLabel="Delete day"
        cancelLabel="Cancel"
        onConfirm={() => {
          if (!pendingDeleteDay) return;
          void deleteDay(pendingDeleteDay);
          setPendingDeleteDay(null);
        }}
        onCancel={() => setPendingDeleteDay(null)}
      />

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
