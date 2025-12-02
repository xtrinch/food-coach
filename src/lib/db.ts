import Dexie, { Table } from "dexie";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect } from "react";

export type AnalysisJobRecord = {
  id: string;
  type: "daily" | "weekly" | "monthly" | "custom";
  label: string;
  status: "pending" | "running" | "success" | "error";
  startedAt: string;
  finishedAt?: string;
  errorMessage?: string;
  dismissed?: boolean;
  prompt?: string;
  response?: string;
};

export type MealEntry = {
  id: string;
  timestamp: string;
  description: string;
  photoDataUrl?: string;        // optional image to replace/augment description
  llmCaloriesEstimate?: number;
  llmCaloriesExplanation?: string;
  llmImprovementSuggestions?: string[];
  llmProteinGrams?: number;
  llmCarbsGrams?: number;
  llmFatGrams?: number;
  llmFiberGrams?: number;
  finalCaloriesEstimate?: number; // editable final estimate, starts from llm estimate
  finalProteinGrams?: number;
  finalCarbsGrams?: number;
  finalFatGrams?: number;
  finalFiberGrams?: number;
};

export type NoteEntry = {
  id: string;
  timestamp: string;
  notes?: string;
};

export type DailyLog = {
  id: string;          // date string YYYY-MM-DD
  date: string;
  weightKg?: number;
  sleepHours?: number;
  stressLevel?: number;
  bloating?: number;
  energy?: number;
  exerciseHours?: number;
  meals: MealEntry[];
  notes: NoteEntry[];
  dailyInsightId?: string;
  createdAt: string;
  updatedAt: string;
};

export type DailyInsight = {
  id?: string;
  date: string;
  generatedAt: string;
  model: string;
  rawJson: string;
  prettyText: string;
  prompt?: string;
};

export type FoodPreset = {
  id?: number;
  key: string;          // normalized description
  label: string;        // user-facing name
  defaultCalories: number;
  createdAt: string;
  updatedAt: string;
};

export class FoodCoachDB extends Dexie {
  dailyLogs!: Table<DailyLog, string>;
  dailyInsights!: Table<DailyInsight, string>;
  foodPresets!: Table<FoodPreset, number>;
  analysisJobs!: Table<AnalysisJobRecord, string>;

  constructor() {
    super("FoodCoachDB");
    this.version(2).stores({
      dailyLogs: "id,date",
      dailyInsights: "++id,date",
      foodPresets: "++id,key"
    });
    this.version(3).stores({
      dailyLogs: "id,date",
      dailyInsights: "++id,date",
      foodPresets: "++id,key",
      analysisJobs: "id,startedAt,status"
    });
    this.version(4).stores({
      dailyLogs: "id,date",
      dailyInsights: "++id,date",
      foodPresets: "++id,key",
      analysisJobs: "id,startedAt,status"
    });
    this.version(5).stores({
      dailyLogs: "id,date",
      dailyInsights: "++id,date",
      foodPresets: "++id,key",
      analysisJobs: "id,startedAt,status"
    });
    this.version(6).stores({
      dailyLogs: "id,date",
      dailyInsights: "++id,date",
      foodPresets: "++id,key",
      analysisJobs: "id,startedAt,status"
    });
    this.version(7)
      .stores({
        dailyLogs: "id,date",
        dailyInsights: "++id,date",
        foodPresets: "++id,key",
        analysisJobs: "id,startedAt,status"
      })
      .upgrade(async (tx) => {
        const logs = tx.table("dailyLogs");
        await logs.toCollection().modify((log: any) => {
          if (log.notes == null && Array.isArray(log.symptoms)) {
            log.notes = log.symptoms;
          }
          delete log.symptoms;
        });
      });
    this.version(8).stores({
      dailyLogs: "id,date",
      dailyInsights: "++id,date",
      foodPresets: "++id,key",
      analysisJobs: "id,startedAt,status"
    });
    this.version(9).stores({
      dailyLogs: "id,date",
      dailyInsights: "++id,date",
      foodPresets: "++id,key",
      analysisJobs: "id,startedAt,status"
    });
    this.version(10)
      .stores({
        dailyLogs: "id,date",
        dailyInsights: "++id,date",
        foodPresets: "++id,key",
        analysisJobs: "id,startedAt,status"
      })
      .upgrade(async (tx) => {
        const logs = tx.table("dailyLogs");
        await logs.toCollection().modify((log: any) => {
          if (!Array.isArray(log.meals)) return;
          log.meals = log.meals.map((meal: any) => {
            const nextFinal =
              meal.finalCaloriesEstimate ??
              meal.llmCaloriesEstimate ??
              meal.userCaloriesEstimate;
            const { userCaloriesEstimate, userCaloriesConfidence, ...rest } = meal;
            return {
              ...rest,
              finalCaloriesEstimate: nextFinal,
            };
          });
        });
      });
    this.version(11)
      .stores({
        dailyLogs: "id,date",
        dailyInsights: "++id,date",
        foodPresets: "++id,key",
        analysisJobs: "id,startedAt,status"
      })
      .upgrade(async (tx) => {
        // Presets are no longer used; clear any existing records.
        try {
          await tx.table("foodPresets").clear();
        } catch (e) {
          console.warn("Failed to clear legacy presets", e);
        }
      });
  }
}

export const db = new FoodCoachDB();

export function getTodayId() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export function useLiveDailyLog(date: string, options?: { createIfMissing?: boolean }) {
  const targetDate = date;
  const createIfMissing = options?.createIfMissing ?? true;

  useEffect(() => {
    if (!targetDate) return;
    if (!createIfMissing) return;
    const todayId = getTodayId();
    if (targetDate > todayId) return;
    let cancelled = false;

    (async () => {
      const existing = await db.dailyLogs.get(targetDate);
      if (existing || cancelled) return;

      const now = new Date().toISOString();
      const log: DailyLog = {
        id: targetDate,
        date: targetDate,
        meals: [],
        notes: [],
        exerciseHours: undefined,
        createdAt: now,
        updatedAt: now,
      };

      await db.dailyLogs.add(log);
    })();

    return () => {
      cancelled = true;
    };
  }, [targetDate, createIfMissing]);

  const dailyLog = useLiveQuery(async () => (targetDate ? db.dailyLogs.get(targetDate) : undefined), [targetDate], null);
  const loading = dailyLog === null;

  return { dailyLog: dailyLog ?? undefined, loading };
}

export function useLiveTodayLog() {
  return useLiveDailyLog(getTodayId());
}

export function useAllDailyLogs() {
  const logs = useLiveQuery(async () => {
    return await db.dailyLogs.orderBy("date").reverse().toArray();
  }, []);
  const loading = !logs;
  return { logs: logs ?? [], loading };
}

export function useAllDailyInsights() {
  const insights = useLiveQuery(async () => {
    return await db.dailyInsights.orderBy("date").reverse().toArray();
  }, []);
  const loading = !insights;
  return { insights: insights ?? [], loading };
}

export function useAllAnalysisJobs() {
  const jobs = useLiveQuery(async () => db.analysisJobs.orderBy("startedAt").reverse().toArray(), []);
  const loading = !jobs;
  return { jobs: jobs ?? [], loading };
}
