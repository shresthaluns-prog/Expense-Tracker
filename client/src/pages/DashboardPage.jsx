import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Link } from "react-router-dom";
import { z } from "zod";
import { apiRequest } from "../api/request.js";
import {
  buttonClass,
  EmptyState,
  inputClass,
  LoadingState,
  Notice,
  Panel,
  secondaryButtonClass,
} from "../components/ui.jsx";
import { listCategories } from "../features/categories/categoriesApi.js";
import { listTransactions } from "../features/expenses/transactionsApi.js";
import { fetchReport } from "../features/reports/reportsApi.js";
import { loadPreferences, subscribeToPreferences } from "../features/settings/preferences.js";
import { amountToMinor, formatMoney } from "../utils/money.js";
import {
  createTrendChartData,
  getBudgetProgressLabel,
  getCurrentMonthRange,
  getDateInTimezone,
  getMonthKeys,
  inclusiveRangeLength,
} from "./dashboard-data.js";

const CashFlowChart = lazy(() =>
  import("./DashboardCharts.jsx").then((module) => ({ default: module.CashFlowChart })),
);
const CategoryDoughnut = lazy(() =>
  import("./DashboardCharts.jsx").then((module) => ({ default: module.CategoryDoughnut })),
);

const quickTransactionSchema = z.object({
  type: z.enum(["expense", "income"]),
  categoryId: z.string().min(1, "Choose a category."),
  amount: z.string().trim().min(1, "Enter an amount.").max(24),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/, "Enter a three-letter currency code."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a transaction date."),
  note: z.string().max(500),
  paymentMethod: z.enum(["cash", "card", "bank_transfer", "mobile_wallet", "other"]),
});

function quickFormDefaults(currency, timezone) {
  return {
    type: "expense",
    categoryId: "",
    amount: "",
    currency,
    date: getDateInTimezone(new Date(), timezone),
    note: "",
    paymentMethod: "other",
  };
}

function DashboardPage() {
  const queryClient = useQueryClient();
  const [preferences, setPreferences] = useState(loadPreferences);
  const [range, setRange] = useState(() => getCurrentMonthRange(loadPreferences().timezone));
  const [appliedRange, setAppliedRange] = useState(() => ({
    ...getCurrentMonthRange(loadPreferences().timezone),
    timezone: loadPreferences().timezone,
  }));
  const [selectedCurrency, setSelectedCurrency] = useState(() => loadPreferences().currency);
  const [rangeError, setRangeError] = useState("");
  const [formError, setFormError] = useState("");

  const reportQuery = useQuery({
    queryKey: ["dashboard", "analytics", appliedRange],
    queryFn: () => fetchReport(appliedRange),
  });
  const recentQuery = useQuery({
    queryKey: ["dashboard", "recent-transactions"],
    queryFn: () => listTransactions({ limit: 6 }),
  });
  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: () => listCategories(),
  });

  const form = useForm({
    resolver: zodResolver(quickTransactionSchema),
    defaultValues: quickFormDefaults(preferences.currency, preferences.timezone),
  });
  const { reset } = form;
  const transactionType = useWatch({ control: form.control, name: "type" });
  const availableCategories = useMemo(
    () => (categoriesQuery.data ?? []).filter((category) => category.type === transactionType),
    [categoriesQuery.data, transactionType],
  );
  const report = reportQuery.data;
  const currencies = useMemo(
    () => [...new Set([preferences.currency, ...(report?.totals ?? []).map(({ currency }) => currency)])],
    [preferences.currency, report],
  );
  const currencyTotals = (report?.totals ?? []).find((row) => row.currency === selectedCurrency);
  const currencySummary = (report?.summary ?? []).filter((row) => row.currency === selectedCurrency);
  const incomeCount = currencySummary.find((row) => row.type === "income")?.transactionCount ?? 0;
  const expenseCount = currencySummary.find((row) => row.type === "expense")?.transactionCount ?? 0;
  const summary = currencyTotals ?? {
    incomeMinor: 0,
    expensesMinor: 0,
    netCashFlowMinor: 0,
    savingsRate: 0,
    transactionCount: 0,
  };
  const monthKeys = useMemo(
    () => getMonthKeys(appliedRange.startDate, appliedRange.endDate),
    [appliedRange.startDate, appliedRange.endDate],
  );
  const trendData = useMemo(
    () => createTrendChartData(report?.trends ?? [], monthKeys, selectedCurrency),
    [report?.trends, monthKeys, selectedCurrency],
  );
  const categoryData = (report?.categories ?? []).filter(
    (category) => category.currency === selectedCurrency,
  );
  const budgets = (report?.budgets ?? []).filter(
    (budget) => budget.currency === selectedCurrency,
  );
  const recentTransactions = recentQuery.data?.data ?? [];
  const categoryNames = new Map(
    (report?.categoryTotals ?? []).map((category) => [String(category.categoryId), category.name]),
  );

  useEffect(() => subscribeToPreferences((next) => {
    setPreferences(next);
    setSelectedCurrency(next.currency);
    const nextRange = getCurrentMonthRange(next.timezone);
    setRange(nextRange);
    setAppliedRange({ ...nextRange, timezone: next.timezone });
    reset(quickFormDefaults(next.currency, next.timezone));
  }), [reset]);

  useEffect(() => {
    const selected = form.getValues("categoryId");
    if (selected && !availableCategories.some((category) => category._id === selected)) {
      form.setValue("categoryId", "", { shouldValidate: false });
    }
  }, [availableCategories, form]);

  const createMutation = useMutation({
    mutationFn: async (values) => {
      const amountMinor = amountToMinor(values.amount, values.currency.toUpperCase());
      const date = new Date(`${values.date}T12:00:00.000Z`).toISOString();
      return apiRequest("/transactions", {
        method: "POST",
        body: {
          type: values.type,
          categoryId: values.categoryId,
          amountMinor,
          currency: values.currency.toUpperCase(),
          date,
          note: values.note.trim(),
          paymentMethod: values.paymentMethod,
        },
      });
    },
    onSuccess: async () => {
      setFormError("");
      reset(quickFormDefaults(selectedCurrency, preferences.timezone));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["reports"] }),
        queryClient.invalidateQueries({ queryKey: ["budgets"] }),
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
      ]);
    },
    onError: (error) => setFormError(error.message),
  });

  function applyDateRange(event) {
    event.preventDefault();
    const days = inclusiveRangeLength(range.startDate, range.endDate);
    if (days === null) {
      setRangeError("End date must be on or after the start date.");
      return;
    }
    if (days > 366) {
      setRangeError("Choose a date range of 366 days or less.");
      return;
    }
    setRangeError("");
    setAppliedRange({ ...range, timezone: preferences.timezone });
  }

  function submitQuickTransaction(values) {
    setFormError("");
    createMutation.mutate(values);
  }

  const errors = form.formState.errors;

  return (
    <div className="space-y-7">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Your money, in focus</p>
          <p className="mt-1 text-sm text-slate-500">
            Income, spending, and budget progress for your selected period.
          </p>
        </div>
        <Link className={secondaryButtonClass} to="/reports">Open full reports →</Link>
      </header>

      <Panel className="dashboard-date-panel" title="Reporting period" description={`Dates use ${preferences.timezone}.`}>
        <form className="dashboard-date-form flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={applyDateRange}>
          <label className="block text-sm font-medium text-slate-700">
            From
            <input
              aria-label="Dashboard start date"
              className={inputClass}
              max={range.endDate || undefined}
              required
              type="date"
              value={range.startDate}
              onChange={(event) => setRange({ ...range, startDate: event.target.value })}
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Through
            <input
              aria-label="Dashboard end date"
              className={inputClass}
              min={range.startDate || undefined}
              required
              type="date"
              value={range.endDate}
              onChange={(event) => setRange({ ...range, endDate: event.target.value })}
            />
          </label>
          <button className={buttonClass} type="submit">Apply dates</button>
          <label className="block text-sm font-medium text-slate-700 sm:ml-auto">
            Currency
            <select
              aria-label="Dashboard currency"
              className={inputClass}
              onChange={(event) => {
                setSelectedCurrency(event.target.value);
                form.setValue("currency", event.target.value, { shouldValidate: true });
              }}
              value={selectedCurrency}
            >
              {currencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
            </select>
          </label>
        </form>
        {rangeError && <div className="mt-3"><Notice>{rangeError}</Notice></div>}
      </Panel>

      {reportQuery.isError && <Notice>{reportQuery.error.message}</Notice>}
      {reportQuery.isPending ? (
        <Panel><LoadingState label="Loading dashboard analytics…" /></Panel>
      ) : reportQuery.isSuccess ? (
        <>
          <section aria-label={`Financial summary in ${selectedCurrency}`} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
            <SummaryCard label="Income" value={formatMoney(summary.incomeMinor, selectedCurrency)} detail={`${incomeCount} income transactions`} tone="emerald" />
            <SummaryCard label="Expenses" value={formatMoney(summary.expensesMinor, selectedCurrency)} detail={`${expenseCount} expense transactions`} tone="indigo" />
          </section>

          <section aria-label="Spending charts" className="dashboard-analytics-grid grid gap-4 xl:grid-cols-[1.48fr_1fr_1.12fr]">
            <Panel className="dashboard-chart-panel" title="Cash flow" description={`Monthly income and expenses · ${selectedCurrency}`}>
              <Suspense fallback={<LoadingState label="Loading chart…" />}>
                <CashFlowChart currency={selectedCurrency} data={trendData} />
              </Suspense>
            </Panel>
            <Panel className="dashboard-category-panel" title="Spending by category" description={`Expense totals · ${selectedCurrency}`}>
              <Suspense fallback={<LoadingState label="Loading chart…" />}>
                <CategoryDoughnut categories={categoryData} currency={selectedCurrency} />
              </Suspense>
            </Panel>
            <RecentTransactions
              className="dashboard-recent-panel"
              error={recentQuery.error}
              isError={recentQuery.isError}
              isPending={recentQuery.isPending}
              timezone={preferences.timezone}
              transactions={recentTransactions}
            />
          </section>
          <section aria-label="Budget progress and quick transaction" className="dashboard-bottom-grid grid items-start gap-4 xl:grid-cols-[0.85fr_1.5fr]">
            <BudgetProgress budgets={budgets} categoryNames={categoryNames} />
            <QuickAddTransaction
              availableCategories={availableCategories}
              categoriesError={categoriesQuery.error}
              categoriesPending={categoriesQuery.isPending}
              createPending={createMutation.isPending}
              errors={errors}
              form={form}
              formError={formError}
              onSubmit={submitQuickTransaction}
              selectedCurrency={selectedCurrency}
            />
          </section>
        </>
      ) : null}
    </div>
  );
}

function SummaryCard({ label, value, detail, tone }) {
  const accents = {
    emerald: "metric-teal",
    indigo: "metric-blue",
    rose: "metric-violet",
    slate: "metric-cyan",
  };
  return (
    <article className={`metric-card ${accents[tone]}`}>
      <span aria-hidden="true" className="metric-icon">{label === "Income" ? "↗" : label === "Expenses" ? "↓" : label === "Net cash flow" ? "⌁" : "%"}</span>
      <h2>{label}</h2>
      <p className="metric-value">{value}</p>
      <p className="metric-detail">{detail}</p>
    </article>
  );
}

function RecentTransactions({ className = "", error, isError, isPending, timezone, transactions }) {
  return (
    <Panel
      className={className}
      title="Recent transactions"
      description="Latest activity across all currencies."
      action={<Link className="text-sm font-semibold text-indigo-700 hover:text-indigo-900" to="/transactions">View all →</Link>}
    >
      {isPending && <LoadingState label="Loading recent activity…" />}
      {isError && <Notice>{error.message}</Notice>}
      {!isPending && !isError && transactions.length === 0 && (
        <EmptyState title="No transactions yet" description="Add one below to see activity here." />
      )}
      {transactions.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {transactions.map((transaction) => {
            const category = transaction.categoryId && typeof transaction.categoryId === "object"
              ? transaction.categoryId
              : null;
            const income = transaction.type === "income";
            return (
              <li className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0" key={transaction._id}>
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    aria-hidden="true"
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-bold ${income ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
                  >
                    {income ? "+" : "−"}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800">
                      {transaction.note || category?.name || (income ? "Income" : "Expense")}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {category?.name ?? "Category"} · {formatDate(transaction.date, timezone)}
                    </p>
                  </div>
                </div>
                <span className={`shrink-0 text-sm font-semibold ${income ? "text-emerald-700" : "text-slate-800"}`}>
                  {income ? "+" : "−"}{formatMoney(transaction.amountMinor, transaction.currency)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function BudgetProgress({ budgets, categoryNames }) {
  return (
    <Panel
      title="Budget progress"
      description="Budgets overlapping the selected dates; spend uses each budget's full period."
      action={<Link className="text-sm font-semibold text-indigo-700 hover:text-indigo-900" to="/budgets">Manage →</Link>}
    >
      {budgets.length === 0 ? (
        <EmptyState title="No budgets for this selection" description="Create a matching budget to track spending progress here." />
      ) : (
        <ul className="space-y-5">
          {budgets.map((budget) => {
            const percent = Number(budget.percentageUsed) || 0;
            const categoryName = budget.categoryId ? categoryNames.get(String(budget.categoryId)) : null;
            const label = categoryName ?? (budget.categoryId ? "Category budget" : "Overall budget");
            const isOver = budget.status === "over_budget";
            const isWarning = budget.status === "warning";
            return (
              <li key={budget._id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{label}</p>
                    <p className="mt-0.5 text-xs capitalize text-slate-500">
                      {budget.periodType} · {formatMoney(budget.spentMinor, budget.currency)} of {formatMoney(budget.amountMinor, budget.currency)}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${isOver ? "bg-rose-50 text-rose-700" : isWarning ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                    {getBudgetProgressLabel(budget)}
                  </span>
                </div>
                <div
                  aria-label={`${label}: ${percent.toFixed(2)} percent used`}
                  aria-valuemax={100}
                  aria-valuemin={0}
                  aria-valuenow={Math.min(Math.max(percent, 0), 100)}
                  className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"
                  role="progressbar"
                >
                  <div
                    className={`h-full rounded-full transition-all ${isOver ? "bg-rose-500" : isWarning ? "bg-amber-500" : "bg-emerald-500"}`}
                    style={{ width: `${Math.min(Math.max(percent, 0), 100)}%` }}
                  />
                </div>
                <div className="mt-1 flex justify-between gap-2 text-xs text-slate-500">
                  <span>{percent.toFixed(2)}% used</span>
                  <span>{formatMoney(budget.remainingMinor, budget.currency)} remaining</span>
                </div>
                {(isOver || isWarning) && (
                  <p className={`mt-2 text-xs font-medium ${isOver ? "text-rose-700" : "text-amber-700"}`} role="status">
                    {isOver
                      ? `Over limit by ${formatMoney(Math.abs(budget.remainingMinor), budget.currency)}.`
                      : "You have used at least 80% of this budget."}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function QuickAddTransaction({
  availableCategories,
  categoriesError,
  categoriesPending,
  createPending,
  errors,
  form,
  formError,
  onSubmit,
  selectedCurrency,
}) {
  return (
    <Panel title="Quick add" description="Add an income or expense without leaving the dashboard.">
      {categoriesError && <div className="mb-4"><Notice>{categoriesError.message}</Notice></div>}
      {!categoriesPending && !categoriesError && availableCategories.length === 0 && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Create a {form.getValues("type")} category before adding this transaction.{" "}
          <Link className="font-semibold underline" to="/categories">Manage categories</Link>
        </p>
      )}
      {formError && <div className="mb-4"><Notice>{formError}</Notice></div>}
      <form className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6" onSubmit={form.handleSubmit(onSubmit)}>
        <label className="block text-sm font-medium text-slate-700">
          Type
          <select className={inputClass} {...form.register("type")}>
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
        </label>
        <CategoryDropdown
          categories={availableCategories}
          disabled={categoriesPending || availableCategories.length === 0}
          error={errors.categoryId?.message}
          form={form}
        />
        <label className="block text-sm font-medium text-slate-700">
          Amount
          <input className={inputClass} inputMode="decimal" placeholder="0.00" {...form.register("amount")} />
          {errors.amount && <span className="mt-1 block text-xs text-rose-700">{errors.amount.message}</span>}
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Currency
          <input className={`${inputClass} uppercase`} maxLength={3} {...form.register("currency")} />
          {errors.currency && <span className="mt-1 block text-xs text-rose-700">{errors.currency.message}</span>}
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Date
          <input className={inputClass} type="date" {...form.register("date")} />
          {errors.date && <span className="mt-1 block text-xs text-rose-700">{errors.date.message}</span>}
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Payment method
          <select className={inputClass} {...form.register("paymentMethod")}>
            <option value="other">Other</option>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="mobile_wallet">Mobile wallet</option>
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-700 sm:col-span-2 xl:col-span-4">
          Note <span className="font-normal text-slate-400">(optional)</span>
          <input className={inputClass} maxLength={500} placeholder="What was this transaction for?" {...form.register("note")} />
          {errors.note && <span className="mt-1 block text-xs text-rose-700">{errors.note.message}</span>}
        </label>
        <div className="flex items-end sm:col-span-2 xl:col-span-2">
          <button className={buttonClass} disabled={createPending || categoriesPending || availableCategories.length === 0} type="submit">
            {createPending ? "Adding…" : "Add transaction"}
          </button>
          <span className="sr-only">New transaction will use {selectedCurrency} unless changed.</span>
        </div>
      </form>
    </Panel>
  );
}

function CategoryDropdown({ categories, disabled, error, form }) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedCategoryId = useWatch({ control: form.control, name: "categoryId" });
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const selectedCategory = categories.find((category) => category._id === selectedCategoryId);
  const labelId = "quick-add-category-label";

  useEffect(() => {
    if (!isOpen) return undefined;
    function closeOnOutsideClick(event) {
      if (!containerRef.current?.contains(event.target)) setIsOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [isOpen]);

  function closeMenu(restoreFocus = false) {
    setIsOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }

  function handleMenuKeyDown(event) {
    const options = [...(menuRef.current?.querySelectorAll('[role="menuitemradio"]') ?? [])];
    const currentIndex = options.indexOf(document.activeElement);
    let nextIndex;
    if (event.key === "ArrowDown") nextIndex = (currentIndex + 1) % options.length;
    if (event.key === "ArrowUp") nextIndex = (currentIndex - 1 + options.length) % options.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = options.length - 1;
    if (nextIndex !== undefined && options.length > 0) {
      event.preventDefault();
      options[nextIndex].focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeMenu(true);
    }
  }

  return (
    <div
      className="relative min-w-0 sm:col-span-2 xl:col-span-2"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setIsOpen(false);
      }}
      ref={containerRef}
    >
      <span className="text-sm font-medium text-slate-700" id={labelId}>Category</span>
      <input type="hidden" {...form.register("categoryId")} />
      <button
        aria-controls="quick-add-category-menu"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-labelledby={`${labelId} quick-add-category-value`}
        className={`${inputClass} flex items-center justify-between gap-3 text-left disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400`}
        disabled={disabled}
        onClick={() => setIsOpen((open) => !open)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !isOpen) {
            event.preventDefault();
            setIsOpen(true);
            requestAnimationFrame(() => menuRef.current?.querySelector("button")?.focus());
          }
        }}
        ref={triggerRef}
        type="button"
      >
        <span className="flex min-w-0 items-center gap-2">
          {selectedCategory ? (
            <>
              <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: selectedCategory.color }} />
              <span className="truncate text-slate-900" id="quick-add-category-value">{selectedCategory.name}</span>
            </>
          ) : (
            <span id="quick-add-category-value">{disabled ? "No categories available" : "Select category"}</span>
          )}
        </span>
        <svg aria-hidden="true" className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 20 20" stroke="currentColor">
          <path d="m5 7.5 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
        </svg>
      </button>
      {isOpen && (
        <div
          aria-labelledby={labelId}
          className="absolute z-20 mt-2 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-900/10"
          id="quick-add-category-menu"
          onKeyDown={handleMenuKeyDown}
          ref={menuRef}
          role="menu"
        >
          {categories.map((category) => {
            const isSelected = category._id === selectedCategoryId;
            return (
              <button
                aria-checked={isSelected}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                  isSelected ? "bg-teal-50 font-semibold text-teal-900" : "text-slate-700 hover:bg-slate-50"
                }`}
                key={category._id}
                onClick={() => {
                  form.setValue("categoryId", category._id, { shouldDirty: true, shouldValidate: true });
                  closeMenu(true);
                }}
                role="menuitemradio"
                type="button"
              >
                <span
                  aria-hidden="true"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-bold text-white"
                  style={{ backgroundColor: category.color }}
                >
                  {category.name.trim().charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate">{category.name}</span>
                {isSelected && <span aria-hidden="true" className="text-teal-700">✓</span>}
              </button>
            );
          })}
        </div>
      )}
      {error && <span className="mt-1 block text-xs text-rose-700">{error}</span>}
    </div>
  );
}

function formatDate(value, timezone) {
  const date = new Date(value);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: timezone,
  }).format(date);
}

export default DashboardPage;
