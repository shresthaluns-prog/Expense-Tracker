import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getCurrentMonthRange } from "../pages/dashboard-data.js";
import { fetchReport } from "../features/reports/reportsApi.js";
import { loadPreferences, subscribeToPreferences } from "../features/settings/preferences.js";
import { formatMoney } from "../utils/money.js";
import { Notice } from "./ui.jsx";

function WorkspaceSnapshot({ compact = false, report = false }) {
  const [preferences, setPreferences] = useState(loadPreferences);
  const range = { ...getCurrentMonthRange(preferences.timezone), timezone: preferences.timezone };
  const query = useQuery({
    queryKey: ["dashboard", "workspace-snapshot", range],
    queryFn: () => fetchReport(range),
    staleTime: 60_000,
  });

  useEffect(
    () => subscribeToPreferences(setPreferences),
    [],
  );

  if (query.isError) {
    return <Notice>{`Financial overview unavailable: ${query.error.message}`}</Notice>;
  }

  const totals = (query.data?.totals ?? []).find((item) => item.currency === preferences.currency);
  const summary = totals ?? {
    incomeMinor: 0,
    expensesMinor: 0,
    netCashFlowMinor: 0,
    transactionCount: 0,
  };
  const currencySummary = (query.data?.summary ?? []).filter(
    (item) => item.currency === preferences.currency,
  );
  const incomeCount = currencySummary.find((item) => item.type === "income")?.transactionCount ?? 0;
  const expenseCount = currencySummary.find((item) => item.type === "expense")?.transactionCount ?? 0;
  const cards = [
    { detail: `${incomeCount} income transactions`, icon: "↗", label: "Income", tone: "metric-teal", value: formatMoney(summary.incomeMinor, preferences.currency) },
    { detail: `${expenseCount} expense transactions`, icon: "↓", label: "Expenses", tone: "metric-red", value: formatMoney(summary.expensesMinor, preferences.currency) },
    {
      detail: summary.netCashFlowMinor < 0 ? "Spending exceeded income" : "Income less expenses",
      icon: "⌁",
      label: "Net cash flow",
      tone: summary.netCashFlowMinor < 0 ? "metric-red" : "metric-teal",
      value: formatMoney(summary.netCashFlowMinor, preferences.currency),
    },
    { detail: "This month", icon: "#", label: "Transactions", tone: "metric-blue", value: summary.transactionCount },
  ];
  const visibleCards = compact
    ? cards.filter(({ label }) => label === "Net cash flow" || label === "Transactions")
    : cards;

  return (
    <section
      aria-label={`Current month financial snapshot in ${preferences.currency}`}
      className={`workspace-snapshot${compact ? " workspace-snapshot--summary" : ""}${report ? " workspace-snapshot--report" : ""}`}
    >
      {visibleCards.map(({ detail, icon, label, tone, value }) => (
        <SnapshotSummaryCard
          detail={detail}
          icon={icon}
          key={label}
          label={label}
          tone={tone}
          value={query.isPending ? "—" : value}
        />
      ))}
    </section>
  );
}

function SnapshotSummaryCard({ detail, icon, label, tone, value }) {
  return (
    <article className={`metric-card summary-card--tall workspace-snapshot-summary-card ${tone}`}>
      <span aria-hidden="true" className="metric-icon">{icon}</span>
      <h2>{label}</h2>
      <p className="metric-value">{value}</p>
      <p className="metric-detail">{detail}</p>
    </article>
  );
}

export default WorkspaceSnapshot;
