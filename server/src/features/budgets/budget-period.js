export function getUtcBudgetPeriod(periodType, startDate, endDate) {
  const anchor = new Date(`${startDate}T00:00:00.000Z`);

  if (periodType === "weekly") {
    const start = new Date(anchor);
    const daysSinceMonday = (start.getUTCDay() + 6) % 7;
    start.setUTCDate(start.getUTCDate() - daysSinceMonday);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);
    return { startDate: start, endDate: end };
  }

  if (periodType === "monthly") {
    const start = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
    const end = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 1));
    return { startDate: start, endDate: end };
  }

  return {
    startDate: anchor,
    endDate: new Date(`${endDate}T00:00:00.000Z`),
  };
}
