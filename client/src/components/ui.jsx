import { useEffect, useRef } from "react";

export const inputClass =
  "ui-input mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400";

export const buttonClass =
  "ui-button inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50";

export const secondaryButtonClass =
  "ui-button-secondary inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

export function PageHeading({ eyebrow, title, description, action }) {
  return (
    <div className="page-heading flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Panel({ title, description, action, children, className = "" }) {
  return (
    <section className={`ui-panel rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 ${className}`}>
      {(title || action) && (
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h2 className="font-semibold text-slate-900">{title}</h2>}
            {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Modal({ title, description, onClose, children }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      aria-describedby={description ? "workspace-dialog-description" : undefined}
      aria-labelledby="workspace-dialog-title"
      className="workspace-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      ref={dialogRef}
    >
      <header className="workspace-dialog-header">
        <div>
          <h2 id="workspace-dialog-title">{title}</h2>
          {description && <p id="workspace-dialog-description">{description}</p>}
        </div>
        <button aria-label="Close dialog" className="workspace-dialog-close" onClick={onClose} type="button">×</button>
      </header>
      <div className="workspace-dialog-content">{children}</div>
    </dialog>
  );
}

export function Notice({ children, tone = "error" }) {
  if (!children) return null;
  const classes =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : "border-rose-200 bg-rose-50 text-rose-800";
  return (
    <p className={`rounded-xl border px-4 py-3 text-sm ${classes}`} role={tone === "success" ? "status" : "alert"}>
      {children}
    </p>
  );
}

export function LoadingState({ label = "Loading…" }) {
  return <p className="py-8 text-center text-sm text-slate-500">{label}</p>;
}

export function EmptyState({ title, description }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 px-5 py-10 text-center">
      <p className="font-medium text-slate-800">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </div>
  );
}

export function Pagination({ pagination, onPageChange }) {
  if (!pagination || pagination.totalPages <= 1) return null;
  return (
    <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-sm">
      <span className="text-slate-500">
        Page {pagination.page} of {pagination.totalPages}
      </span>
      <div className="flex gap-2">
        <button
          className={secondaryButtonClass}
          disabled={pagination.page <= 1}
          onClick={() => onPageChange(pagination.page - 1)}
          type="button"
        >
          Previous
        </button>
        <button
          className={secondaryButtonClass}
          disabled={pagination.page >= pagination.totalPages}
          onClick={() => onPageChange(pagination.page + 1)}
          type="button"
        >
          Next
        </button>
      </div>
    </div>
  );
}
