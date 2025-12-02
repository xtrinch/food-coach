import { db, DailyInsight, DailyLog, AnalysisJobRecord } from "./db";

export type BackupPayload = {
  version: 1;
  generatedAt: string;
  dailyLogs: DailyLog[];
  dailyInsights: DailyInsight[];
  analysisJobs: AnalysisJobRecord[];
};

type LegacyBackup = {
  logs?: DailyLog[];
  insights?: DailyInsight[];
  analysisJobs?: AnalysisJobRecord[];
  generatedAt?: string;
};

export function backupFileName(date = new Date()) {
  return `food-coach-backup-${date.toISOString().slice(0, 10)}.json`;
}

export async function buildBackup(): Promise<BackupPayload> {
  const [dailyLogs, dailyInsights, analysisJobs] = await Promise.all([
    db.dailyLogs.toArray(),
    db.dailyInsights.toArray(),
    db.analysisJobs.toArray(),
  ]);

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    dailyLogs,
    dailyInsights,
    analysisJobs,
  };
}

export function normalizeBackupPayload(raw: unknown): BackupPayload {
  const data = (raw ?? {}) as Partial<BackupPayload & LegacyBackup>;

  // Support both the new shape (dailyLogs…) and the legacy export shape (logs…).
  const dailyLogs = (data.dailyLogs ?? data.logs ?? []) as DailyLog[];
  const dailyInsights = (data.dailyInsights ?? data.insights ?? []) as DailyInsight[];
  const analysisJobs = (data.analysisJobs ?? []) as AnalysisJobRecord[];

  const normalizedLogs = dailyLogs.map((log) => {
    const notes = (log as any).notes ?? (log as any).symptoms ?? [];
    const cleaned = { ...log, notes };
    delete (cleaned as any).symptoms;
    return cleaned;
  });

  return {
    version: 1,
    generatedAt: data.generatedAt ?? new Date().toISOString(),
    dailyLogs: normalizedLogs,
    dailyInsights,
    analysisJobs,
  };
}

export async function restoreBackup(raw: unknown): Promise<void> {
  const payload = normalizeBackupPayload(raw);

  await db.transaction("rw", [db.dailyLogs, db.dailyInsights, db.foodPresets, db.analysisJobs], async () => {
    await Promise.all([
      db.dailyLogs.clear(),
      db.dailyInsights.clear(),
      db.foodPresets.clear(),
      db.analysisJobs.clear(),
    ]);

    if (payload.dailyLogs.length) {
      await db.dailyLogs.bulkAdd(payload.dailyLogs);
    }
    if (payload.dailyInsights.length) {
      await db.dailyInsights.bulkAdd(payload.dailyInsights);
    }
    if (payload.analysisJobs.length) {
      await db.analysisJobs.bulkAdd(payload.analysisJobs);
    }
  });
}
