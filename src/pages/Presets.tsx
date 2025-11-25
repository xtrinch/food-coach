import React, { useEffect, useState } from "react";
import { db, normalizeFoodKey, useAllFoodPresets } from "../lib/db";

type EditingState = Record<number, { label: string; defaultCalories: string }>;
type Status = { type: "success" | "error"; message: string } | null;

export const PresetsPage: React.FC = () => {
  const { presets, loading } = useAllFoodPresets();
  const [editing, setEditing] = useState<EditingState>({});
  const [status, setStatus] = useState<Status>(null);
  const [newMatch, setNewMatch] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newCalories, setNewCalories] = useState("");

  useEffect(() => {
    setEditing((prev) => {
      let changed = false;
      const next: EditingState = { ...prev };
      const ids = new Set<number>();

      presets.forEach((preset) => {
        if (preset.id == null) return;
        ids.add(preset.id);
        if (!next[preset.id]) {
          next[preset.id] = {
            label: preset.label,
            defaultCalories: String(preset.defaultCalories),
          };
          changed = true;
        }
      });

      Object.keys(next).forEach((idKey) => {
        const idNum = Number(idKey);
        if (!ids.has(idNum)) {
          delete next[idNum];
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [presets]);

  const setError = (message: string) => {
    alert(message);
    setStatus({ type: "error", message });
  };
  const setSuccess = (message: string) => setStatus({ type: "success", message });

  const persistPreset = async (id: number, data: { label: string; calories: number }) => {
    try {
      await db.foodPresets.update(id, {
        label: data.label,
        defaultCalories: data.calories,
        updatedAt: new Date().toISOString(),
      });
      setSuccess("Saved.");
    } catch (e) {
      console.error(e);
      setError("Could not save preset. Please try again.");
    }
  };

  const updateField = (id: number, field: keyof EditingState[number], value: string) => {
    setEditing((prev) => {
      const current = prev[id] ?? { label: "", defaultCalories: "" };
      const next = { ...current, [field]: value };

      const trimmedLabel = next.label.trim();
      const calories = Number(next.defaultCalories);
      if (trimmedLabel && !Number.isNaN(calories)) {
        persistPreset(id, { label: trimmedLabel, calories });
      }

      return { ...prev, [id]: next };
    });
  };

  const deletePreset = async (id: number) => {
    const preset = presets.find((p) => p.id === id);
    if (!preset) return;
    if (!confirm(`Delete preset "${preset.label}"? This will not remove past meals.`)) return;

    try {
      await db.foodPresets.delete(id);
      setEditing((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setSuccess("Preset deleted.");
    } catch (e) {
      console.error(e);
      setError("Could not delete preset. Please try again.");
    }
  };

  const addPreset = async () => {
    const matchText = newMatch.trim();
    const label = newLabel.trim() || matchText;
    const calories = Number(newCalories);

    if (!matchText || !label || Number.isNaN(calories)) {
      setError("Enter a match text/label and valid calories.");
      return;
    }

    const key = normalizeFoodKey(matchText);
    const now = new Date().toISOString();

    try {
      const existing = await db.foodPresets.where("key").equals(key).first();

      if (existing?.id != null) {
        await db.foodPresets.update(existing.id, {
          label,
          defaultCalories: calories,
          updatedAt: now,
        });
      } else {
        await db.foodPresets.add({
          key,
          label,
          defaultCalories: calories,
          createdAt: now,
          updatedAt: now,
        });
      }

      setNewMatch("");
      setNewLabel("");
      setNewCalories("");
      setSuccess("Preset saved.");
    } catch (e) {
      console.error(e);
      setError("Could not save new preset. Please try again.");
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h1 className="text-xl font-semibold">Presets</h1>
        <p className="text-sm text-slate-400">
          Manage reusable meals. Update calories or rename items to improve future auto-fill suggestions.
        </p>
        {status && (
          <p className={`text-xs ${status.type === "error" ? "text-red-300" : "text-emerald-400"}`}>
            {status.message}
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-200">Add preset</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs text-slate-400">Meal description (used to match future entries)</label>
            <input
              type="text"
              value={newMatch}
              onChange={(e) => setNewMatch(e.target.value)}
              placeholder="e.g. Cappuccino with oat milk"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-400">Default calories</label>
            <input
              type="number"
              value={newCalories}
              onChange={(e) => setNewCalories(e.target.value)}
              placeholder="kcal"
            />
          </div>
          <div className="space-y-1 sm:col-span-3">
            <label className="text-xs text-slate-400">Label (optional, shown in UI)</label>
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="e.g. Morning cappuccino"
            />
          </div>
        </div>
        <button
          onClick={addPreset}
          className="px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-sm"
        >
          Add preset
        </button>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200">Your presets</h2>
          <span className="text-[11px] text-slate-500">Total: {presets.length}</span>
        </div>

        {presets.length === 0 && (
          <p className="text-sm text-slate-500">No presets yet. Save a meal as a preset from Today.</p>
        )}

        <div className="space-y-3">
          {presets.map((preset) => {
            if (preset.id == null) return null;
            const current = editing[preset.id] ?? {
              label: preset.label,
              defaultCalories: String(preset.defaultCalories),
            };

            return (
              <div
                key={preset.id}
                className="border border-slate-800 rounded-xl px-3 py-3 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-slate-100">{preset.label}</div>
                    <p className="text-[11px] text-slate-500">
                      Key: <span className="font-mono">{preset.key}</span>
                    </p>
                  </div>
                  <button
                    onClick={() => deletePreset(preset.id!)}
                    className="text-xs px-2 py-1 rounded-md border border-red-600 text-red-200 hover:bg-red-600/10"
                  >
                    Delete
                  </button>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-xs text-slate-400">Label</label>
                    <input
                      type="text"
                      value={current.label}
                      onChange={(e) => updateField(preset.id!, "label", e.target.value)}
                      placeholder="e.g. Chicken salad bowl"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400">Default calories</label>
                    <input
                      type="number"
                      value={current.defaultCalories}
                      onChange={(e) => updateField(preset.id!, "defaultCalories", e.target.value)}
                      placeholder="kcal"
                    />
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
