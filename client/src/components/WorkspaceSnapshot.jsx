import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getCurrentMonthRange } from "../pages/dashboard-data.js";
import { fetchReport } from "../features/reports/reportsApi.js";
import { loadPreferences, subscribeToPreferences } from "../features/settings/preferences.js";
import { formatMoney } from "../utils/money.js";
import { Notice } from "./ui.jsx";

function WorkspaceSnapshot() {
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
  const cards = [
    { label: "Income this month", value: summary.incomeMinor },
    { label: "Expenses this month", value: summary.expensesMinor },
    { label: "Net cash flow", value: summary.netCashFlowMinor },
    { label: "Transactions", value: summary.transactionCount, count: true },
  ];

  return (
    <section aria-label={`Current month financial snapshot in ${preferences.currency}`} className="workspace-snapshot">
      {cards.map(({ label, value, count }) => (
        <article className="workspace-snapshot-card" key={label}>
          <span>{label}</span>
          <strong>{query.isPending ? "—" : count ? value : formatMoney(value, preferences.currency)}</strong>
        </article>
      ))}
    </section>
  );
}

export default WorkspaceSnapshot;
