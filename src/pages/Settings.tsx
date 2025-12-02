import React, { useEffect, useState } from "react";
import { backupFileName, buildBackup, normalizeBackupPayload, restoreBackup } from "../lib/backup";
import { getDriveClientId, getLastDriveSync, importBackupFromDrive, syncBackupToDrive } from "../lib/driveSync";

export const SettingsPage: React.FC = () => {
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [driveStatus, setDriveStatus] = useState<string | null>(null);
  const [driveBusy, setDriveBusy] = useState(false);
  const [lastDriveSync, setLastDriveSync] = useState<string | null>(null);
  const driveClientId = getDriveClientId();

  useEffect(() => {
    const stored = localStorage.getItem("openai_api_key");
    if (stored) setApiKey(stored);
    setLastDriveSync(getLastDriveSync());
  }, []);

  const saveKey = () => {
    localStorage.setItem("openai_api_key", apiKey.trim());
    setStatus("Saved API key locally.");
  };

  const clearAllData = () => {
    if (!confirm("This will clear all local data (logs, insights, settings). Continue?")) return;
    indexedDB.databases?.().then((dbs) => {
      dbs?.forEach((db) => {
        if (db.name) indexedDB.deleteDatabase(db.name);
      });
    });
    localStorage.clear();
    setStatus("All local data cleared. Reload the page.");
  };

  const exportData = async () => {
    const backup = await buildBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const generatedAt = backup.generatedAt ? new Date(backup.generatedAt) : new Date();
    a.href = url;
    a.download = backupFileName(generatedAt);
    a.click();
    URL.revokeObjectURL(url);
  };

  const runDriveSync = async () => {
    if (!driveClientId.trim()) {
      setDriveStatus("Add your Google Drive OAuth client ID first.");
      return;
    }
    setDriveBusy(true);
    setDriveStatus("Syncing data to Google Drive…");
    try {
      await syncBackupToDrive();
      setDriveStatus("Synced backup to Google Drive.");
      setLastDriveSync(getLastDriveSync());
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setDriveStatus(`Drive sync failed: ${msg}`);
    } finally {
      setDriveBusy(false);
    }
  };

  const importFromDrive = async () => {
    if (!driveClientId.trim()) {
      setDriveStatus("Add your Google Drive OAuth client ID first.");
      return;
    }
    const ok = confirm(
      "This will replace ALL local data with the latest Drive backup. Continue?"
    );
    if (!ok) return;
    setDriveBusy(true);
    setDriveStatus("Importing backup from Google Drive…");
    try {
      const payload = await importBackupFromDrive();
      setDriveStatus(
        `Imported backup from Drive. ${payload.dailyLogs.length} logs, ${payload.dailyInsights.length} insights.`
      );
      setLastDriveSync(getLastDriveSync());
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setDriveStatus(`Drive import failed: ${msg}`);
    } finally {
      setDriveBusy(false);
    }
  };

  const importFromFile = async () => {
    setDriveBusy(true);
    setDriveStatus("Importing backup from file…");
    try {
      const file = await new Promise<File>((resolve, reject) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "application/json";
        input.onchange = () => {
          const selected = input.files?.[0];
          if (!selected) {
            reject(new Error("No file selected"));
            return;
          }
          resolve(selected);
        };
        input.onerror = () => reject(new Error("File selection failed"));
        input.click();
      });

      const text = await file.text();
      const json = JSON.parse(text);
      const payload = normalizeBackupPayload(json);
      await restoreBackup(payload);
      setDriveStatus(
        `Imported backup from file. ${payload.dailyLogs.length} logs, ${payload.dailyInsights.length} insights.`
      );
      setLastDriveSync(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setDriveStatus(`File import failed: ${msg}`);
    } finally {
      setDriveBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-slate-400">
          Configure your OpenAI API key and manage your local data. The app calls OpenAI directly from your device using your key.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-200">OpenAI API key</h2>
        <p className="text-xs text-slate-400">
          Create an API key in your OpenAI account, then paste it here. It is stored only in your browser&apos;s localStorage.
        </p>
        <input
          type="password"
          className="w-full sm:w-80"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-..."
        />
        <button
          onClick={saveKey}
          className="w-full sm:w-auto px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-sm"
        >
          Save API key
        </button>
        {status && <p className="text-xs text-emerald-400">{status}</p>}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-200">Google Drive sync</h2>
        <p className="text-xs text-slate-400">
          Save all local data to your Google Drive in a visible folder. Uses OAuth client ID configured at build time.
        </p>
        <p className="text-[11px] text-slate-500">
          Client ID in use: <code>{driveClientId || "not configured"}</code>
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={runDriveSync}
            disabled={driveBusy}
            className="w-full sm:w-auto px-3 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:opacity-60 text-xs"
          >
            {driveBusy ? "Syncing…" : "Sync to Drive"}
          </button>
          <button
            onClick={importFromDrive}
            disabled={driveBusy}
            className="w-full sm:w-auto px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-60 text-xs"
          >
            {driveBusy ? "Working…" : "Import latest from Drive"}
          </button>
          <button
            onClick={importFromFile}
            disabled={driveBusy}
            className="w-full sm:w-auto px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-60 text-xs"
          >
            {driveBusy ? "Working…" : "Import from file"}
          </button>
        </div>
        {lastDriveSync && (
          <p className="text-xs text-slate-400">Last Drive sync: {new Date(lastDriveSync).toLocaleString()}</p>
        )}
        {driveStatus && <p className="text-xs text-emerald-400">{driveStatus}</p>}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-200">Data export</h2>
        <p className="text-xs text-slate-400">
          Export all logs, insights, and analysis jobs as a JSON file you can store or inspect elsewhere.
        </p>
        <button
          onClick={exportData}
          className="w-full sm:w-auto px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm"
        >
          Export JSON backup
        </button>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-red-300">Danger zone</h2>
        <button
          onClick={clearAllData}
          className="w-full sm:w-auto px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-sm"
        >
          Clear all local data
        </button>
      </section>
    </div>
  );
};
