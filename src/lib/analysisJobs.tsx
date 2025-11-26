import React, { createContext, useContext } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, AnalysisJobRecord } from "./db";

export type AnalysisType = AnalysisJobRecord["type"];
export type AnalysisJob = AnalysisJobRecord;

type Ctx = {
  jobs: AnalysisJob[];
  loading: boolean;
  startJob: (job: { type: AnalysisType; label: string }) => string;
  finishJob: (id: string) => void;
  failJob: (id: string, errorMessage: string) => void;
  dismissJob: (id: string) => void;
  deleteJob: (id: string) => void;
};

const AnalysisJobsContext = createContext<Ctx | null>(null);

export const AnalysisJobsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const jobs = useLiveQuery(async () => {
    return db.analysisJobs.orderBy("startedAt").reverse().toArray();
  }, []);
  const loading = !jobs;

  const startJob: Ctx["startJob"] = (job) => {
    const id = crypto.randomUUID();
    const newJob: AnalysisJobRecord = {
      id,
      type: job.type,
      label: job.label,
      status: "running",
      startedAt: new Date().toISOString(),
      dismissed: false,
    };
    void db.analysisJobs.add(newJob).catch((e) => console.error("Failed to persist job start", e));
    return id;
  };

  const finishJob: Ctx["finishJob"] = (id) => {
    void db.analysisJobs
      .update(id, { status: "success", finishedAt: new Date().toISOString(), dismissed: false })
      .catch((e) => console.error("Failed to persist job finish", e));
  };

  const failJob: Ctx["failJob"] = (id, errorMessage) => {
    void db.analysisJobs
      .update(id, {
        status: "error",
        finishedAt: new Date().toISOString(),
        errorMessage,
        dismissed: false,
      })
      .catch((e) => console.error("Failed to persist job failure", e));
  };

  const dismissJob: Ctx["dismissJob"] = (id) => {
    void db.analysisJobs.update(id, { dismissed: true }).catch((e) => console.error("Failed to dismiss job", e));
  };

  const deleteJob: Ctx["deleteJob"] = (id) => {
    void db.analysisJobs.delete(id).catch((e) => console.error("Failed to delete job", e));
  };

  return (
    <AnalysisJobsContext.Provider
      value={{ jobs: jobs ?? [], loading, startJob, finishJob, failJob, dismissJob, deleteJob }}
    >
      {children}
    </AnalysisJobsContext.Provider>
  );
};

export function useAnalysisJobs() {
  const ctx = useContext(AnalysisJobsContext);
  if (!ctx) throw new Error("useAnalysisJobs must be used within AnalysisJobsProvider");
  return ctx;
}
