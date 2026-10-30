import assert from "node:assert/strict";
import test from "node:test";
import { getReportPeriod } from "../src/features/reports/report.service.js";
import { reportQuerySchema } from "../src/features/reports/report.schemas.js";

test("default reports cover six UTC calendar months through today", () => {
  const period = getReportPeriod(undefined, undefined, "UTC", new Date("2026-10-29T14:50:00.000Z"));
  assert.equal(period.startDate, "2026-05-01");
  assert.equal(period.endDate, "2026-10-29");
  assert.equal(period.start.toISOString(), "2026-05-01T00:00:00.000Z");
  assert.equal(period.end.toISOString(), "2026-10-30T00:00:00.000Z");
});

test("report date ranges resolve local midnight across timezone offsets and DST", () => {
  const losAngeles = getReportPeriod("2026-03-08", "2026-03-08", "America/Los_Angeles");
  assert.equal(losAngeles.start.toISOString(), "2026-03-08T08:00:00.000Z");
  assert.equal(losAngeles.end.toISOString(), "2026-03-09T07:00:00.000Z");

  const kathmandu = getReportPeriod("2026-03-01", "2026-03-01", "Asia/Kathmandu");
  assert.equal(kathmandu.start.toISOString(), "2026-02-28T18:15:00.000Z");
  assert.equal(kathmandu.end.toISOString(), "2026-03-01T18:15:00.000Z");
});

test("report query requires paired valid dates and caps explicit ranges", () => {
  assert.equal(reportQuerySchema.safeParse({ startDate: "2026-03-01" }).success, false);
  assert.equal(reportQuerySchema.safeParse({ startDate: "2026-02-30", endDate: "2026-03-01" }).success, false);
  assert.equal(reportQuerySchema.safeParse({ startDate: "2026-04-02", endDate: "2026-04-01" }).success, false);
  assert.equal(
    reportQuerySchema.safeParse({ startDate: "2025-01-01", endDate: "2026-01-03" }).success,
    false,
  );
  assert.equal(
    reportQuerySchema.safeParse({ startDate: "2025-01-01", endDate: "2026-01-01" }).success,
    true,
    "366 inclusive calendar days are allowed",
  );
  assert.equal(
    reportQuerySchema.safeParse({ startDate: "2025-01-01", endDate: "2026-01-02" }).success,
    false,
    "ranges longer than 366 inclusive calendar days are rejected",
  );
  const valid = reportQuerySchema.safeParse({
    startDate: "2026-03-01",
    endDate: "2026-03-31",
    currency: "usd",
  });
  assert.equal(valid.success, true);
  assert.equal(valid.data.currency, "USD");
  assert.equal(valid.data.timezone, "UTC");
  assert.equal(
    reportQuerySchema.safeParse({ startDate: "2026-03-01", endDate: "2026-03-02", timezone: "Mars/Olympus" }).success,
    false,
  );
});
