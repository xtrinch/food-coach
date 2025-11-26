import React from "react";

type Props = {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export const ConfirmModal: React.FC<Props> = ({
  open,
  title = "Are you sure?",
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-xl space-y-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
          <p className="text-xs text-slate-400 whitespace-pre-wrap">{message}</p>
        </div>
        <div className="flex justify-end gap-2 text-xs">
          <button
            onClick={onCancel}
            className="px-3 py-2 rounded-md border border-slate-700 text-slate-300 hover:border-slate-500"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-2 rounded-md bg-red-600 hover:bg-red-700 text-slate-50"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
