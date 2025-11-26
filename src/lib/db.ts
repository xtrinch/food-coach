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
  userCaloriesEstimate?: number;
  userCaloriesConfidence?: number; // 1-5 self-reported confidence
  llmCaloriesEstimate?: number;
  llmCaloriesExplanation?: string;
  finalCaloriesEstimate?: number; // editable final estimate, starts from llm estimate
  presetKey?: string;
  presetLabel?: string;
  wantsPreset?: boolean;
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
};

export type FoodPreset = {
  id?: number;
  key: string;          // normalized description
  label: string;        // user-facing name
  defaultCalories: number;
  createdAt: string;
  updatedAt: string;
};

export function normalizeFoodKey(text: string): string {
  return text.trim().toLowerCase();
}

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
  }
}

export const db = new FoodCoachDB();

export function getTodayId() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export function useLiveTodayLog() {
  const todayId = getTodayId();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const existing = await db.dailyLogs.get(todayId);
      if (existing || cancelled) return;

      const now = new Date().toISOString();
      const log: DailyLog = {
        id: todayId,
        date: todayId,
        meals: [],
        notes: [],
        createdAt: now,
        updatedAt: now,
      };

      await db.dailyLogs.add(log);
    })();

    return () => {
      cancelled = true;
    };
  }, [todayId]);

  const todayLog = useLiveQuery(async () => db.dailyLogs.get(todayId), [todayId]);
  const loading = !todayLog;

  return { todayLog, loading };
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

export function useAllFoodPresets() {
  const presets = useLiveQuery(async () => db.foodPresets.orderBy("id").reverse().toArray(), []);
  const loading = !presets;
  return { presets: presets ?? [], loading };
}

export function useAllAnalysisJobs() {
  const jobs = useLiveQuery(async () => db.analysisJobs.orderBy("startedAt").reverse().toArray(), []);
  const loading = !jobs;
  return { jobs: jobs ?? [], loading };
}
