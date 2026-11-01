import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useEffect, useMemo, useState } from "react";
import { inputClass, LoadingState, Notice, PageHeading, Panel } from "../../components/ui.jsx";
import { compactMoney, formatMoney } from "../../utils/money.js";
import { loadPreferences, subscribeToPreferences } from "../settings/preferences.js";
import { fetchReport } from "./reportsApi.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function todayInTimezone(timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts.filter(({ type }) => type !== "literal").map(({ type, value }) => [type, value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function defaultRange(timezone) {
  const today = todayInTimezone(timezone);
  const [year, month] = today.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 6, 1));
  return { startDate: start.toISOString().slice(0, 10), endDate: today, timezone };
}

function monthKeys(startDate, endDate) {
  const start = new Date(`${startDate.slice(0, 7)}-01T00:00:00.000Z`);
  const end = new Date(`${endDate.slice(0, 7)}-01T00:00:00.000Z`);
  const months = [];
  for (const cursor = start; cursor <= end; cursor.setUTCMonth(cursor.getUTCMonth() + 1)) {
    months.push(cursor.toISOString().slice(0, 7));
  }
  return months;
}

function formatMonth(month) {
  const date = new Date(`${month}-01T00:00:00.000Z`);
  return new Intl.DateTimeFormat(undefined, { month: "short", year: "2-digit", timeZone: "UTC" }).format(date);
}

function ReportsPage() {
  const [preferences, setPreferences] = useState(loadPreferences);
  const [range, setRange] = useState(() => defaultRange(loadPreferences().timezone));
  const [appliedRange, setAppliedRange] = useState(() => defaultRange(loadPreferences().timezone));
  const [currency, setCurrency] = useState(() => loadPreferences().currency);
  const [rangeError, setRangeError] = useState("");
  const reportQuery = useQuery({
    queryKey: ["reports", appliedRange],
    queryFn: () => fetchReport(appliedRange),
  });
  const report = reportQuery.data;
  const currencies = useMemo(
    () => [...new Set((report?.summary ?? []).map((row) => row.currency))].sort(),
    [report],
  );

  useEffect(
    () =>
      subscribeToPreferences((next) => {
        setPreferences(next);
        setCurrency(next.currency);
        setRange((current) => ({ ...current, timezone: next.timezone }));
        setAppliedRange((current) => ({ ...current, timezone: next.timezone }));
      }),
    [],
  );

  function applyRange(event) {
    event.preventDefault();
    if (range.endDate < range.startDate) {
      setRangeError("End date must be on or after start date.");
      return;
    }
    if (new Date(`${range.endDate}T00:00:00.000Z`) - new Date(`${range.startDate}T00:00:00.000Z`) >= 366 * DAY_MS) {
      setRangeError("Choose a date range of 366 days or less.");
      return;
    }
    setRangeError("");
    setAppliedRange({ ...range, timezone: preferences.timezone });
  }

  const selectedCurrency = currency || currencies[0] || preferences.currency;
  const currencySummary = (report?.summary ?? []).filter((row) => row.currency === selectedCurrency);
  const income = currencySummary.find((row) => row.type === "income");
  const expense = currencySummary.find((row) => row.type === "expense");
  const incomeMinor = income?.amountMinor ?? 0;
  const expenseMinor = expense?.amountMinor ?? 0;
  const trend = useMemo(() => {
    const records = (report?.monthly ?? []).filter((row) => row.currency === selectedCurrency);
    const months = monthKeys(appliedRange.startDate, appliedRange.endDate);
    return months.map((month) => {
      const monthRows = records.filter((row) => row.month === month);
      return {
        month: formatMonth(month),
        incomeMinor: monthRows.find((row) => row.type === "income")?.amountMinor ?? 0,
        expenseMinor: monthRows.find((row) => row.type === "expense")?.amountMinor ?? 0,
      };
    });
  }, [report, appliedRange, selectedCurrency]);
  const categoryData = (report?.categories ?? [])
    .filter((row) => row.currency === selectedCurrency)
    .map((row) => ({ ...row, name: row.name }));
  const paymentData = (report?.payments ?? []).filter((row) => row.currency === selectedCurrency);

  return (
    <div className="space-y-7">
      <PageHeading
        eyebrow="Understand your habits"
        title="Reports"
        description="Review income, expenses, and spending patterns for a date range. Different currencies are kept separate."
      />

      <Panel title="Report period" description={`Dates use ${preferences.timezone} calendar days. The end date is included.`}>
        <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={applyRange}>
          <label className="block text-sm font-medium text-slate-700">
            From
            <input
              className={inputClass}
              max={range.endDate || undefined}
              type="date"
              value={range.startDate}
              onChange={(event) => setRange({ ...range, startDate: event.target.value })}
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Through
            <input
              className={inputClass}
              min={range.startDate || undefined}
              type="date"
              value={range.endDate}
              onChange={(event) => setRange({ ...range, endDate: event.target.value })}
            />
          </label>
          <button className="ui-button inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition" type="submit">
            Apply range
          </button>
          {(currencies.length > 0 || selectedCurrency) && (
            <label className="block text-sm font-medium text-slate-700 sm:ml-auto">
              Currency
              <select className={inputClass} value={selectedCurrency} onChange={(event) => setCurrency(event.target.value)}>
                {[...new Set([selectedCurrency, ...currencies])].map((code) => <option key={code} value={code}>{code}</option>)}
              </select>
            </label>
          )}
        </form>
        {rangeError && <div className="mt-3"><Notice>{rangeError}</Notice></div>}
      </Panel>

      {reportQuery.isPending && <Panel><LoadingState label="Preparing your report…" /></Panel>}
      {reportQuery.isError && <Notice>{reportQuery.error.message}</Notice>}
      {reportQuery.isSuccess && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <SummaryCard label="Income" value={formatMoney(incomeMinor, selectedCurrency)} detail={`${income?.transactionCount ?? 0} transactions`} tone="emerald" />
            <SummaryCard label="Expenses" value={formatMoney(expenseMinor, selectedCurrency)} detail={`${expense?.transactionCount ?? 0} transactions`} tone="rose" />
            <SummaryCard
              label="Net cash flow"
              value={formatMoney(incomeMinor - expenseMinor, selectedCurrency)}
              detail={`${report.period.startDate} – ${report.period.endDate}`}
              tone={incomeMinor >= expenseMinor ? "indigo" : "amber"}
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Panel title="Income vs. expenses" description={`Monthly totals in ${selectedCurrency}; months without transactions are shown as zero.`}>
              {trend.some((month) => month.incomeMinor || month.expenseMinor) ? (
                <div className="h-80 w-full">
                  <ResponsiveContainer height="100%" width="100%">
                    <BarChart data={trend} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
                      <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                      <XAxis axisLine={false} dataKey="month" tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: "#64748b", fontSize: 11 }}
                        tickFormatter={(value) => compactMoney(value, selectedCurrency)}
                        width={74}
                      />
                      <Tooltip formatter={(value, name) => [formatMoney(Number(value), selectedCurrency), name]} />
                      <Legend />
                      <Bar dataKey="incomeMinor" fill="#10b981" name="Income" radius={[5, 5, 0, 0]} />
                      <Bar dataKey="expenseMinor" fill="#6366f1" name="Expenses" radius={[5, 5, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <ChartEmptyState />
              )}
            </Panel>

            <Panel title="Expenses by category" description={`Breakdown for ${selectedCurrency}`}>
              {categoryData.length ? (
                <>
                  <div className="h-64 w-full">
                    <ResponsiveContainer height="100%" width="100%">
                      <PieChart>
                        <Pie data={categoryData} dataKey="amountMinor" nameKey="name" innerRadius={58} outerRadius={94} paddingAngle={2}>
                          {categoryData.map((item, index) => <Cell fill={item.color || colorPalette[index % colorPalette.length]} key={item.categoryId ?? index} />)}
                        </Pie>
                        <Tooltip formatter={(value) => formatMoney(Number(value), selectedCurrency)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="mt-2 space-y-2">
                    {categoryData.slice(0, 8).map((item) => (
                      <li className="flex items-center justify-between gap-3 text-sm" key={`${item.categoryId}-${item.currency}`}>
                        <span className="flex min-w-0 items-center gap-2 text-slate-600">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                          <span className="truncate">{item.name}</span>
                        </span>
                        <span className="shrink-0 font-medium text-slate-800">{formatMoney(item.amountMinor, selectedCurrency)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <ChartEmptyState />
              )}
            </Panel>
          </div>

          <Panel title="Expenses by payment method" description={`How you paid for expenses in ${selectedCurrency}`}>
            {paymentData.length ? (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {paymentData.map((item) => {
                  const percentage = expenseMinor ? (item.amountMinor / expenseMinor) * 100 : 0;
                  return (
                    <li className="rounded-xl border border-slate-100 p-4" key={`${item.currency}-${item.method}`}>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium capitalize text-slate-700">{item.method.replaceAll("_", " ")}</span>
                        <span className="text-sm font-semibold text-slate-900">{formatMoney(item.amountMinor, selectedCurrency)}</span>
                      </div>
                      <div aria-hidden="true" className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.min(percentage, 100)}%` }} />
                      </div>
                      <p className="mt-2 text-xs text-slate-500">{item.transactionCount} transactions · {percentage.toFixed(1)}%</p>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <ChartEmptyState />
            )}
          </Panel>
        </>
      )}
    </div>
  );
}

const colorPalette = ["#4f46e5", "#10b981", "#f59e0b", "#ec4899", "#06b6d4", "#8b5cf6", "#f97316", "#64748b"];

function SummaryCard({ label, value, detail, tone }) {
  const tones = {
    emerald: "bg-emerald-50 text-emerald-700",
    rose: "bg-rose-50 text-rose-700",
    indigo: "bg-indigo-50 text-indigo-700",
    amber: "bg-amber-50 text-amber-700",
  };
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
      <p className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${tones[tone]}`}>{detail}</p>
    </section>
  );
}

function ChartEmptyState() {
  return (
    <div className="grid min-h-64 place-items-center rounded-xl border border-dashed border-slate-200 px-5 text-center">
      <div>
        <p className="font-medium text-slate-800">No activity for this selection</p>
        <p className="mt-1 text-sm text-slate-500">Try a wider date range or add transactions.</p>
      </div>
    </div>
  );
}

export default ReportsPage;
