import assert from "node:assert/strict";
import test from "node:test";
import { getUtcBudgetPeriod } from "../src/features/budgets/budget-period.js";

test("weekly budget periods begin Monday at UTC midnight and end exclusively one week later", () => {
  const { startDate, endDate } = getUtcBudgetPeriod("weekly", "2026-03-11");
  assert.equal(startDate.toISOString(), "2026-03-09T00:00:00.000Z");
  assert.equal(endDate.toISOString(), "2026-03-16T00:00:00.000Z");
});

test("monthly budget periods use UTC month boundaries, including year rollover", () => {
  const { startDate, endDate } = getUtcBudgetPeriod("monthly", "2026-12-19");
  assert.equal(startDate.toISOString(), "2026-12-01T00:00:00.000Z");
  assert.equal(endDate.toISOString(), "2027-01-01T00:00:00.000Z");
});

test("custom periods preserve UTC date-only boundaries", () => {
  const { startDate, endDate } = getUtcBudgetPeriod("custom", "2026-03-01", "2026-03-10");
  assert.equal(startDate.toISOString(), "2026-03-01T00:00:00.000Z");
  assert.equal(endDate.toISOString(), "2026-03-10T00:00:00.000Z");
});
