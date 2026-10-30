import mongoose from "mongoose";
import Category from "../categories/category.model.js";
import { createBudgetService } from "../budgets/budget.service.js";

function pad(value) {
  return String(value).padStart(2, "0");
}

function localDateParts(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.filter(({ type }) => type !== "literal").map(({ type, value }) => [type, value]));
}

function localDateString(date, timezone) {
  const parts = localDateParts(date, timezone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function utcInstantForLocalMidnight(dateString, timezone) {
  const [year, month, day] = dateString.split("-").map(Number);
  const target = Date.UTC(year, month - 1, day);
  let candidate = target;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = localDateParts(new Date(candidate), timezone);
    const representedAsUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    const correction = target - representedAsUtc;
    if (correction === 0) return new Date(candidate);
    candidate += correction;
  }

  const resolvedDate = localDateString(new Date(candidate), timezone);
  if (resolvedDate !== dateString) {
    throw new RangeError(`Cannot resolve local midnight for ${dateString} in ${timezone}.`);
  }
  return new Date(candidate);
}

function shiftDate(dateString, days) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function shiftMonth(dateString, months) {
  const [year, month] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + months, 1));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-01`;
}

function monthSequence(startDate, endDate) {
  const months = [];
  let month = `${startDate.slice(0, 7)}-01`;
  const finalMonth = `${endDate.slice(0, 7)}-01`;
  while (month <= finalMonth) {
    months.push(month.slice(0, 7));
    month = shiftMonth(month, 1);
  }
  return months;
}

export function getReportPeriod(startDate, endDate, timezone = "UTC", now = new Date()) {
  const today = localDateString(now, timezone);
  if (startDate && endDate) {
    const exclusiveEndDate = shiftDate(endDate, 1);
    const start = utcInstantForLocalMidnight(startDate, timezone);
    const end = utcInstantForLocalMidnight(exclusiveEndDate, timezone);
    return { start, end, startDate, endDate };
  }

  const startDateDefault = `${shiftMonth(`${today.slice(0, 7)}-01`, -5)}`;
  const exclusiveEndDate = shiftDate(today, 1);
  const start = utcInstantForLocalMidnight(startDateDefault, timezone);
  const end = utcInstantForLocalMidnight(exclusiveEndDate, timezone);
  return {
    start,
    end,
    startDate: startDateDefault,
    endDate: today,
  };
}

function completeMonthlySeries(monthly, months, currencies) {
  const values = new Map(
    monthly.map((row) => [`${row.month}|${row.currency}|${row.type}`, row]),
  );
  const series = [];
  for (const currency of currencies) {
    for (const month of months) {
      for (const type of ["income", "expense"]) {
        const row = values.get(`${month}|${currency}|${type}`);
        series.push({
          month,
          currency,
          type,
          amountMinor: row?.amountMinor ?? 0,
          transactionCount: row?.transactionCount ?? 0,
        });
      }
    }
  }
  return series;
}

function buildCurrencyTotals(summary) {
  const totals = new Map();
  for (const row of summary) {
    const value = totals.get(row.currency) ?? {
      currency: row.currency,
      incomeMinor: 0,
      expensesMinor: 0,
      netCashFlowMinor: 0,
      savingsRate: 0,
      transactionCount: 0,
    };
    if (row.type === "income") value.incomeMinor = row.amountMinor;
    if (row.type === "expense") value.expensesMinor = row.amountMinor;
    value.transactionCount += row.transactionCount;
    totals.set(row.currency, value);
  }
  for (const value of totals.values()) {
    value.netCashFlowMinor = value.incomeMinor - value.expensesMinor;
    value.savingsRate = value.incomeMinor === 0
      ? 0
      : Number(((value.netCashFlowMinor / value.incomeMinor) * 100).toFixed(2));
  }
  return [...totals.values()].sort((left, right) => left.currency.localeCompare(right.currency));
}

export function createReportService({ TransactionModel, BudgetModel }) {
  const budgetService = BudgetModel
    ? createBudgetService({ BudgetModel, TransactionModel })
    : null;

  async function getReport(userId, { startDate, endDate, currency, timezone = "UTC" }) {
    const period = getReportPeriod(startDate, endDate, timezone);
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const match = {
      userId: userObjectId,
      date: { $gte: period.start, $lt: period.end },
      ...(currency ? { currency } : {}),
    };

    const [result = { summary: [], monthly: [], categories: [], categoryTotals: [], payments: [] }] =
      await TransactionModel.aggregate([
        { $match: match },
        {
          $facet: {
            summary: [
              {
                $group: {
                  _id: { currency: "$currency", type: "$type" },
                  amountMinor: { $sum: "$amountMinor" },
                  transactionCount: { $sum: 1 },
                },
              },
              {
                $project: {
                  _id: 0,
                  currency: "$_id.currency",
                  type: "$_id.type",
                  amountMinor: 1,
                  transactionCount: 1,
                },
              },
              { $sort: { currency: 1, type: 1 } },
            ],
            monthly: [
              {
                $group: {
                  _id: {
                    month: { $dateToString: { format: "%Y-%m", date: "$date", timezone } },
                    currency: "$currency",
                    type: "$type",
                  },
                  amountMinor: { $sum: "$amountMinor" },
                  transactionCount: { $sum: 1 },
                },
              },
              {
                $project: {
                  _id: 0,
                  month: "$_id.month",
                  currency: "$_id.currency",
                  type: "$_id.type",
                  amountMinor: 1,
                  transactionCount: 1,
                },
              },
              { $sort: { month: 1, currency: 1, type: 1 } },
            ],
            categories: [
              { $match: { type: "expense" } },
              {
                $group: {
                  _id: { categoryId: "$categoryId", currency: "$currency" },
                  amountMinor: { $sum: "$amountMinor" },
                  transactionCount: { $sum: 1 },
                },
              },
              { $sort: { amountMinor: -1, "_id.categoryId": 1 } },
              {
                $lookup: {
                  from: Category.collection.name,
                  let: { categoryId: "$_id.categoryId", ownerId: userObjectId },
                  pipeline: [
                    {
                      $match: {
                        $expr: {
                          $and: [
                            { $eq: ["$_id", "$$categoryId"] },
                            { $eq: ["$userId", "$$ownerId"] },
                          ],
                        },
                      },
                    },
                    { $project: { _id: 0, name: 1, color: 1 } },
                  ],
                  as: "category",
                },
              },
              {
                $project: {
                  _id: 0,
                  categoryId: "$_id.categoryId",
                  currency: "$_id.currency",
                  name: { $ifNull: [{ $first: "$category.name" }, "Archived category"] },
                  color: { $ifNull: [{ $first: "$category.color" }, "#94a3b8"] },
                  amountMinor: 1,
                  transactionCount: 1,
                },
              },
            ],
            categoryTotals: [
              {
                $group: {
                  _id: { categoryId: "$categoryId", currency: "$currency", type: "$type" },
                  amountMinor: { $sum: "$amountMinor" },
                  transactionCount: { $sum: 1 },
                },
              },
              { $sort: { amountMinor: -1, "_id.categoryId": 1 } },
              {
                $lookup: {
                  from: Category.collection.name,
                  let: { categoryId: "$_id.categoryId", ownerId: userObjectId },
                  pipeline: [
                    {
                      $match: {
                        $expr: {
                          $and: [
                            { $eq: ["$_id", "$$categoryId"] },
                            { $eq: ["$userId", "$$ownerId"] },
                          ],
                        },
                      },
                    },
                    { $project: { _id: 0, name: 1, color: 1 } },
                  ],
                  as: "category",
                },
              },
              {
                $project: {
                  _id: 0,
                  categoryId: "$_id.categoryId",
                  currency: "$_id.currency",
                  type: "$_id.type",
                  name: { $ifNull: [{ $first: "$category.name" }, "Archived category"] },
                  color: { $ifNull: [{ $first: "$category.color" }, "#94a3b8"] },
                  amountMinor: 1,
                  transactionCount: 1,
                },
              },
            ],
            payments: [
              { $match: { type: "expense" } },
              {
                $group: {
                  _id: { currency: "$currency", method: "$paymentMethod" },
                  amountMinor: { $sum: "$amountMinor" },
                  transactionCount: { $sum: 1 },
                },
              },
              {
                $project: {
                  _id: 0,
                  currency: "$_id.currency",
                  method: "$_id.method",
                  amountMinor: 1,
                  transactionCount: 1,
                },
              },
              { $sort: { amountMinor: -1, method: 1 } },
            ],
          },
        },
      ]);

    const currencies = result.summary.map((row) => row.currency);
    const months = monthSequence(period.startDate, period.endDate);
    const monthly = completeMonthlySeries(result.monthly, months, [...new Set(currencies)]);
    const trendGroups = new Map();
    for (const row of monthly) {
      const key = `${row.month}|${row.currency}`;
      const trend = trendGroups.get(key) ?? {
        month: row.month,
        currency: row.currency,
        incomeMinor: 0,
        expensesMinor: 0,
        netCashFlowMinor: 0,
        savingsRate: 0,
        transactionCount: 0,
      };
      if (row.type === "income") trend.incomeMinor = row.amountMinor;
      if (row.type === "expense") trend.expensesMinor = row.amountMinor;
      trend.transactionCount += row.transactionCount;
      trendGroups.set(key, trend);
    }
    for (const trend of trendGroups.values()) {
      trend.netCashFlowMinor = trend.incomeMinor - trend.expensesMinor;
      trend.savingsRate = trend.incomeMinor === 0
        ? 0
        : Number(((trend.netCashFlowMinor / trend.incomeMinor) * 100).toFixed(2));
    }

    const budgets = budgetService
      ? await budgetService.withSpending(
          userId,
          {
            startDate: { $lt: period.end },
            endDate: { $gt: period.start },
            ...(currency ? { currency } : {}),
          },
        )
      : [];

    return {
      period: { startDate: period.startDate, endDate: period.endDate, timezone },
      summary: result.summary,
      totals: buildCurrencyTotals(result.summary),
      monthly,
      trends: [...trendGroups.values()],
      categories: result.categories,
      categoryTotals: result.categoryTotals,
      payments: result.payments,
      budgets,
    };
  }

  return { getReport };
}
