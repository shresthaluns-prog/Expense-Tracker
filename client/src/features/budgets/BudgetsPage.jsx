import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { listCategories } from "../categories/categoriesApi.js";
import {
  buttonClass,
  EmptyState,
  inputClass,
  LoadingState,
  Modal,
  Notice,
  PageHeading,
  Panel,
  secondaryButtonClass,
} from "../../components/ui.jsx";
import { amountToMinor, formatMoney, minorToAmount } from "../../utils/money.js";
import { loadPreferences } from "../settings/preferences.js";
import { createBudget, deleteBudget, listBudgets, updateBudget } from "./budgetsApi.js";

const budgetSchema = z.object({
  scope: z.enum(["overall", "category"]),
  categoryId: z.string().optional(),
  amount: z.string().trim().min(1, "Enter a budget amount."),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/, "Use a three-letter currency code."),
  periodType: z.enum(["weekly", "monthly", "custom"]),
  startDate: z.string().min(1, "Choose a start date."),
  endDate: z.string().optional(),
}).superRefine((values, context) => {
  if (values.scope === "category" && !values.categoryId) {
    context.addIssue({ code: "custom", path: ["categoryId"], message: "Choose an expense category." });
  }
  if (values.periodType === "custom" && !values.endDate) {
    context.addIssue({ code: "custom", path: ["endDate"], message: "Choose an exclusive end date." });
  }
  if (values.periodType === "custom" && values.endDate && values.endDate <= values.startDate) {
    context.addIssue({ code: "custom", path: ["endDate"], message: "End date must be after start date." });
  }
});

function dateInputValue(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
}

function emptyValues() {
  return {
    scope: "overall",
    categoryId: "",
    amount: "",
    currency: loadPreferences().currency,
    periodType: "monthly",
    startDate: dateInputValue(),
    endDate: "",
  };
}

function BudgetsPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const categoriesQuery = useQuery({
    queryKey: ["categories", "expense"],
    queryFn: () => listCategories({ type: "expense" }),
  });
  const budgetsQuery = useQuery({
    queryKey: ["budgets"],
    queryFn: () => listBudgets(),
  });
  const form = useForm({ resolver: zodResolver(budgetSchema), defaultValues: emptyValues() });
  const { reset } = form;
  const scope = useWatch({ control: form.control, name: "scope" });
  const periodType = useWatch({ control: form.control, name: "periodType" });
  const expenses = (categoriesQuery.data ?? []).filter((category) => category.type === "expense");

  useEffect(() => {
    if (editing) {
      const categoryId = typeof editing.categoryId === "object" ? editing.categoryId?._id : editing.categoryId;
      reset({
        scope: categoryId ? "category" : "overall",
        categoryId: categoryId ?? "",
        amount: minorToAmount(editing.amountMinor, editing.currency),
        currency: editing.currency,
        periodType: editing.periodType,
        startDate: dateInputValue(editing.startDate),
        endDate: editing.periodType === "custom" ? dateInputValue(editing.endDate) : "",
      });
    } else {
      reset(emptyValues());
    }
    setFormError("");
  }, [editing, reset]);

  async function refreshData() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["budgets"] }),
      queryClient.invalidateQueries({ queryKey: ["transactions"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
    ]);
  }

  const saveMutation = useMutation({
    mutationFn: (values) => editing ? updateBudget(editing._id, values) : createBudget(values),
    onSuccess: async () => {
      setEditing(null);
      setFormOpen(false);
      setFormError("");
      await refreshData();
    },
    onError: (error) => setFormError(error.message),
  });
  const deleteMutation = useMutation({
    mutationFn: deleteBudget,
    onSuccess: refreshData,
    onError: (error) => setFormError(error.message),
  });

  async function onSubmit(values) {
    setFormError("");
    try {
      const payload = {
        categoryId: values.scope === "category" ? values.categoryId : null,
        amountMinor: amountToMinor(values.amount, values.currency.toUpperCase()),
        currency: values.currency.toUpperCase(),
        periodType: values.periodType,
        startDate: values.startDate,
      };
      if (values.periodType === "custom") payload.endDate = values.endDate;
      await saveMutation.mutateAsync(payload);
    } catch (error) {
      setFormError(error.message);
    }
  }

  function handleDelete(budget) {
    if (!window.confirm("Delete this budget? Transaction history will not be affected.")) return;
    setFormError("");
    deleteMutation.mutate(budget._id);
  }

  const fieldError = form.formState.errors;
  const budgets = budgetsQuery.data ?? [];

  function openCreateForm() {
    setEditing(null);
    setFormError("");
    reset(emptyValues());
    setFormOpen(true);
  }

  function closeForm() {
    setEditing(null);
    setFormOpen(false);
  }

  return (
    <div className="space-y-7">
      <PageHeading
        eyebrow="Plan ahead"
        title="Budgets"
        description="Set spending limits and track usage against your expense transactions."
        action={<button className={buttonClass} onClick={openCreateForm} type="button">＋ Create budget</button>}
      />
      {formError && <Notice>{formError}</Notice>}
      {formOpen && (
        <Modal
          description="Spending totals update from matching expense transactions."
          onClose={closeForm}
          title={editing ? "Edit budget" : "Create a budget"}
        >
          {categoriesQuery.isError && <Notice>{categoriesQuery.error.message}</Notice>}
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <label className="block text-sm font-medium text-slate-700">
              Budget scope
              <select className={inputClass} {...form.register("scope")}>
                <option value="overall">Overall expenses</option>
                <option value="category">One category</option>
              </select>
            </label>
            {scope === "category" && (
              <label className="block text-sm font-medium text-slate-700">
                Expense category
                <select className={inputClass} {...form.register("categoryId")}>
                  <option value="">Select a category</option>
                  {expenses.map((category) => <option key={category._id} value={category._id}>{category.name}</option>)}
                </select>
                {fieldError.categoryId && <span className="mt-1 block text-xs text-rose-700">{fieldError.categoryId.message}</span>}
              </label>
            )}
            <div className="grid grid-cols-[1fr_100px] gap-3">
              <label className="block text-sm font-medium text-slate-700">
                Limit
                <input className={inputClass} inputMode="decimal" placeholder="0.00" {...form.register("amount")} />
                {fieldError.amount && <span className="mt-1 block text-xs text-rose-700">{fieldError.amount.message}</span>}
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Currency
                <input className={`${inputClass} uppercase`} maxLength={3} {...form.register("currency")} />
                {fieldError.currency && <span className="mt-1 block text-xs text-rose-700">{fieldError.currency.message}</span>}
              </label>
            </div>
            <label className="block text-sm font-medium text-slate-700">
              Period
              <select className={inputClass} {...form.register("periodType")}>
                <option value="weekly">Weekly (Monday through Sunday)</option>
                <option value="monthly">Monthly (UTC calendar month)</option>
                <option value="custom">Custom date range</option>
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-700">
              {periodType === "monthly" ? "Any day in the month" : periodType === "weekly" ? "Any day in the week" : "Start date (inclusive)"}
              <input className={inputClass} type="date" {...form.register("startDate")} />
              {fieldError.startDate && <span className="mt-1 block text-xs text-rose-700">{fieldError.startDate.message}</span>}
            </label>
            {periodType === "custom" && (
              <label className="block text-sm font-medium text-slate-700">
                End date (exclusive)
                <input className={inputClass} type="date" {...form.register("endDate")} />
                {fieldError.endDate && <span className="mt-1 block text-xs text-rose-700">{fieldError.endDate.message}</span>}
              </label>
            )}
            <p className="text-xs leading-5 text-slate-500">Weekly and monthly dates are normalized using UTC. Custom end dates are exclusive.</p>
            <div className="flex flex-wrap gap-2">
              <button className={buttonClass} disabled={saveMutation.isPending || (scope === "category" && expenses.length === 0)} type="submit">
                {saveMutation.isPending ? "Saving…" : editing ? "Save changes" : "Add budget"}
              </button>
              <button className={secondaryButtonClass} onClick={closeForm} type="button">Cancel</button>
            </div>
          </form>
        </Modal>

      )}
      <Panel title="Your budgets" description="Usage is calculated from this account's matching expenses.">
          {budgetsQuery.isPending && <LoadingState label="Loading budgets…" />}
          {budgetsQuery.isError && <Notice>{budgetsQuery.error.message}</Notice>}
          {budgetsQuery.isSuccess && budgets.length === 0 && (
            <EmptyState title="No budgets yet" description="Create an overall or category budget to start tracking your spending." />
          )}
          <div className="space-y-3">
            {budgets.map((budget) => (
              <BudgetCard
                budget={budget}
                categoryName={expenses.find((category) => category._id === budget.categoryId)?.name}
                key={budget._id}
                onDelete={() => void handleDelete(budget)}
                onEdit={() => {
                  setFormError("");
                  setEditing(budget);
                  setFormOpen(true);
                }}
              />
            ))}
          </div>
      </Panel>
    </div>
  );
}

function BudgetCard({ budget, categoryName, onEdit, onDelete }) {
  const percent = Number(budget.percentageUsed) || 0;
  const stateClasses = {
    on_track: "bg-emerald-50 text-emerald-700",
    warning: "bg-amber-50 text-amber-700",
    over_budget: "bg-rose-50 text-rose-700",
  };
  const statusLabel = budget.status?.replaceAll("_", " ") ?? "on track";
  const title = budget.categoryId ? `${categoryName ?? "Category"} budget` : "Overall budget";
  const start = dateInputValue(budget.startDate);
  const end = dateInputValue(budget.endDate);

  return (
    <article className="rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900">{title}</h3>
          <p className="mt-1 text-xs capitalize text-slate-500">
            {budget.periodType} · {start} – {end} (end exclusive)
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${stateClasses[budget.status] ?? stateClasses.on_track}`}>{statusLabel}</span>
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500">Spent</p>
          <p className="mt-0.5 text-xl font-semibold text-slate-900">{formatMoney(budget.spentMinor, budget.currency)}</p>
        </div>
        <p className="text-right text-sm text-slate-500">
          of <span className="font-semibold text-slate-800">{formatMoney(budget.amountMinor, budget.currency)}</span>
          <span className="mt-0.5 block">{formatMoney(budget.remainingMinor, budget.currency)} remaining</span>
        </p>
      </div>
      <div aria-label={`${Math.max(0, percent).toFixed(2)} percent used`} className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={Math.max(0, Math.min(percent, 100))} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full rounded-full transition-all ${budget.status === "over_budget" ? "bg-rose-500" : budget.status === "warning" ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(Math.max(percent, 0), 100)}%` }} />
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500">{percent.toFixed(2)}% used</span>
        <div className="flex gap-2">
          <button className={secondaryButtonClass} onClick={onEdit} type="button">Edit</button>
          <button className="rounded-xl px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50" onClick={onDelete} type="button">Delete</button>
        </div>
      </div>
    </article>
  );
}

export default BudgetsPage;
