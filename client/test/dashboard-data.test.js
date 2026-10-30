import { describe, expect, it } from "vitest";
import {
  createTrendChartData,
  getBudgetProgressLabel,
  getCurrentMonthRange,
  getDateInTimezone,
  getMonthKeys,
  inclusiveRangeLength,
} from "../src/pages/dashboard-data.js";

describe("dashboard date and chart helpers", () => {
it("monthly chart data includes zero-valued months and zero-value transaction types", () => {
  const data = createTrendChartData(
    [
      {
        month: "2026-01",
        currency: "USD",
        incomeMinor: 12500,
        expensesMinor: 3000,
        netCashFlowMinor: 9500,
        transactionCount: 2,
      },
      {
        month: "2026-03",
        currency: "USD",
        incomeMinor: 0,
        expensesMinor: 4500,
        netCashFlowMinor: -4500,
        transactionCount: 1,
      },
    ],
    ["2026-01", "2026-02", "2026-03"],
    "USD",
    "en-US",
  );

  expect(data).toHaveLength(3);
  expect(
    data.map(({ incomeMinor, expensesMinor }) => [incomeMinor, expensesMinor]),
  ).toEqual([[12500, 3000], [0, 0], [0, 4500]]);
  expect(data[1].transactionCount).toBe(0);
});

it("month keys cover every calendar month across year boundaries", () => {
  expect(getMonthKeys("2025-12-29", "2026-02-02")).toEqual([
    "2025-12", "2026-01", "2026-02",
  ]);
  expect(getMonthKeys("2026-07-01", "2026-07-01")).toEqual(["2026-07"]);
});

it("dashboard current month respects the selected timezone", () => {
  const now = new Date("2026-01-01T00:30:00.000Z");
  expect(getDateInTimezone(now, "America/Los_Angeles")).toBe("2025-12-31");
  expect(getCurrentMonthRange("America/Los_Angeles", now)).toEqual({
    startDate: "2025-12-01",
    endDate: "2025-12-31",
  });
});

it("inclusive date ranges validate empty, reversed and maximum range cases", () => {
  expect(inclusiveRangeLength("2026-02-01", "2026-02-01")).toBe(1);
  expect(inclusiveRangeLength("2026-01-01", "2026-01-31")).toBe(31);
  expect(inclusiveRangeLength("2026-02-02", "2026-02-01")).toBe(null);
  expect(inclusiveRangeLength("", "2026-02-01")).toBe(null);
});

it("budget labels map server status to readable warning states", () => {
  expect(getBudgetProgressLabel({ status: "on_track" })).toBe("On track");
  expect(getBudgetProgressLabel({ status: "warning" })).toBe("Near limit");
  expect(getBudgetProgressLabel({ status: "over_budget" })).toBe("Over budget");
});
});
