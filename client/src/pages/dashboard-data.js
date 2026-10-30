function datePartsInTimezone(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return Object.fromEntries(
    parts.filter(({ type }) => type !== "literal").map(({ type, value }) => [type, value]),
  );
}

export function getDateInTimezone(date, timezone) {
  const parts = datePartsInTimezone(date, timezone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function getCurrentMonthRange(timezone, now = new Date()) {
  const today = getDateInTimezone(now, timezone);
  const [year, month] = today.split("-").map(Number);
  return {
    startDate: new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10),
    endDate: today,
  };
}

export function getMonthKeys(startDate, endDate) {
  const cursor = new Date(`${startDate.slice(0, 7)}-01T00:00:00.000Z`);
  const end = new Date(`${endDate.slice(0, 7)}-01T00:00:00.000Z`);
  const months = [];
  while (cursor <= end) {
    months.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

export function createTrendChartData(trends, months, currency, locale) {
  return months.map((month) => {
    const trend = trends.find((entry) => entry.month === month && entry.currency === currency);
    const date = new Date(`${month}-01T00:00:00.000Z`);
    return {
      month,
      label: new Intl.DateTimeFormat(locale, {
        month: "short",
        year: "2-digit",
        timeZone: "UTC",
      }).format(date),
      incomeMinor: trend?.incomeMinor ?? 0,
      expensesMinor: trend?.expensesMinor ?? 0,
      netCashFlowMinor: trend?.netCashFlowMinor ?? 0,
      transactionCount: trend?.transactionCount ?? 0,
    };
  });
}

export function inclusiveRangeLength(startDate, endDate) {
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.floor((end - start) / 86_400_000) + 1;
}

export function getBudgetProgressLabel(budget) {
  if (budget.status === "over_budget") return "Over budget";
  if (budget.status === "warning") return "Near limit";
  return "On track";
}
