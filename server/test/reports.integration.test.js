import "dotenv/config";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import app from "../src/app.js";
import { env } from "../src/config/env.js";
import Budget from "../src/features/budgets/budget.model.js";
import Category from "../src/features/categories/category.model.js";
import Transaction from "../src/features/expenses/transaction.model.js";
import User from "../src/features/auth/user.model.js";

const databaseAvailable = Boolean(env.mongodbUri);

function accessToken(userId) {
  return jwt.sign({ tokenUse: "access" }, env.accessTokenSecret, {
    algorithm: "HS256",
    subject: userId.toString(),
    issuer: "expense-tracker-api",
    audience: "expense-tracker-client",
    expiresIn: "5m",
  });
}

async function request(baseUrl, token, path) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: token ? { Authorization: "Bearer " + token } : {},
  });
  return {
    status: response.status,
    body: await response.json(),
  };
}

test(
  "reports aggregate UTC ranges by currency and isolate authenticated users",
  { skip: !databaseAvailable, timeout: 60_000 },
  async (t) => {
    await mongoose.connect(env.mongodbUri);
    await Promise.all([User.init(), Category.init(), Transaction.init(), Budget.init()]);

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const passwordHash = await bcrypt.hash("integration-test-password", 4);
    const users = await User.create([
      { name: "Report Owner", email: `report-owner-${suffix}@example.test`, passwordHash },
      { name: "Other Owner", email: `report-other-${suffix}@example.test`, passwordHash },
    ]);
    const [owner, other] = users;
    const tokens = [accessToken(owner._id), accessToken(other._id)];
    const categories = await Category.create([
      { userId: owner._id, name: `Report Food ${suffix}`, type: "expense", color: "#123456" },
      { userId: owner._id, name: `Report Salary ${suffix}`, type: "income" },
      { userId: other._id, name: `Foreign Food ${suffix}`, type: "expense" },
    ]);
    const [food, salary, foreignFood] = categories;
    const transactions = await Transaction.create([
      {
        userId: owner._id, categoryId: food._id, type: "expense", amountMinor: 1000,
        currency: "USD", date: new Date("2026-03-01T00:00:00.000Z"), paymentMethod: "cash",
      },
      {
        userId: owner._id, categoryId: food._id, type: "expense", amountMinor: 2500,
        currency: "USD", date: new Date("2026-03-31T23:59:59.999Z"), paymentMethod: "card",
      },
      {
        userId: owner._id, categoryId: salary._id, type: "income", amountMinor: 5000,
        currency: "USD", date: new Date("2026-03-15T12:00:00.000Z"), paymentMethod: "bank_transfer",
      },
      {
        userId: owner._id, categoryId: food._id, type: "expense", amountMinor: 12000,
        currency: "JPY", date: new Date("2026-03-20T12:00:00.000Z"), paymentMethod: "mobile_wallet",
      },
      {
        userId: owner._id, categoryId: food._id, type: "expense", amountMinor: 9000,
        currency: "USD", date: new Date("2026-04-01T00:00:00.000Z"), paymentMethod: "card",
      },
      {
        userId: other._id, categoryId: foreignFood._id, type: "expense", amountMinor: 99000,
        currency: "USD", date: new Date("2026-03-20T12:00:00.000Z"), paymentMethod: "card",
      },
    ]);
    const budgets = await Budget.create([
      {
        userId: owner._id,
        categoryId: null,
        amountMinor: 10000,
        currency: "USD",
        periodType: "monthly",
        startDate: new Date("2026-03-01T00:00:00.000Z"),
        endDate: new Date("2026-04-01T00:00:00.000Z"),
      },
    ]);
    const server = createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}/api`;

    t.after(async () => {
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      await Transaction.deleteMany({ _id: { $in: transactions.map(({ _id }) => _id) } });
      await Budget.deleteMany({ _id: { $in: budgets.map(({ _id }) => _id) } });
      await Category.deleteMany({ _id: { $in: categories.map(({ _id }) => _id) } });
      await User.deleteMany({ _id: { $in: users.map(({ _id }) => _id) } });
      await mongoose.disconnect();
    });

    const unauthenticated = await request(baseUrl, null, "/reports");
    assert.equal(unauthenticated.status, 401);

    const report = await request(baseUrl, tokens[0], "/reports?startDate=2026-03-01&endDate=2026-03-31");
    assert.equal(report.status, 200);
    assert.deepEqual(report.body.data.period, {
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      timezone: "UTC",
    });
    assert.equal(report.body.data.summary.find((row) => row.currency === "USD" && row.type === "expense").amountMinor, 3500);
    assert.equal(report.body.data.summary.find((row) => row.currency === "USD" && row.type === "income").amountMinor, 5000);
    assert.equal(report.body.data.summary.find((row) => row.currency === "JPY" && row.type === "expense").amountMinor, 12000);
    assert.equal(report.body.data.monthly.find((row) => row.currency === "USD" && row.type === "expense").amountMinor, 3500);
    assert.equal(report.body.data.categories.find((row) => row.currency === "USD").amountMinor, 3500);
    assert.equal(report.body.data.categories.find((row) => row.currency === "USD").name, food.name);
    assert.ok(report.body.data.categoryTotals.some((row) => row.type === "income" && row.name === salary.name));
    assert.equal(report.body.data.payments.find((row) => row.currency === "USD" && row.method === "card").amountMinor, 2500);
    assert.deepEqual(
      report.body.data.totals.find((row) => row.currency === "USD"),
      {
        currency: "USD",
        incomeMinor: 5000,
        expensesMinor: 3500,
        netCashFlowMinor: 1500,
        savingsRate: 30,
        transactionCount: 3,
      },
    );
    assert.equal(report.body.data.trends.find((row) => row.currency === "USD").netCashFlowMinor, 1500);
    assert.equal(report.body.data.budgets.length, 1);
    assert.equal(report.body.data.budgets[0].spentMinor, 3500);
    assert.equal(JSON.stringify(report.body).includes("99000"), false, "another user's transactions are excluded");
    assert.equal(report.body.data.summary.some((row) => row.amountMinor === 9000), false, "the day after endDate is excluded");

    const filtered = await request(
      baseUrl,
      tokens[0],
      "/reports?startDate=2026-03-01&endDate=2026-03-31&currency=usd",
    );
    assert.equal(filtered.status, 200);
    assert.deepEqual(new Set(filtered.body.data.summary.map((row) => row.currency)), new Set(["USD"]));
    assert.equal(filtered.body.data.budgets.length, 1);

    const fullMonths = await request(
      baseUrl,
      tokens[0],
      "/reports?startDate=2026-01-01&endDate=2026-03-31",
    );
    assert.equal(fullMonths.status, 200);
    assert.equal(fullMonths.body.data.monthly.length, 12, "two currency series each contain three months and two types");
    assert.equal(
      fullMonths.body.data.monthly.find((row) => row.month === "2026-01" && row.currency === "USD" && row.type === "expense").amountMinor,
      0,
    );
    assert.equal(
      fullMonths.body.data.monthly.find((row) => row.month === "2026-02" && row.currency === "USD" && row.type === "income").transactionCount,
      0,
    );

    const localDateReport = await request(
      baseUrl,
      tokens[0],
      "/reports?startDate=2026-03-01&endDate=2026-03-31&timezone=America%2FLos_Angeles&currency=USD",
    );
    assert.equal(localDateReport.status, 200);
    assert.equal(localDateReport.body.data.totals[0].expensesMinor, 11500);
    assert.equal(localDateReport.body.data.trends[0].month, "2026-03");

    const invalid = await request(baseUrl, tokens[0], "/reports?startDate=2026-03-01");
    assert.equal(invalid.status, 400);
    const reversed = await request(
      baseUrl,
      tokens[0],
      "/reports?startDate=2026-04-01&endDate=2026-03-31",
    );
    assert.equal(reversed.status, 400);

    const otherReport = await request(
      baseUrl,
      tokens[1],
      "/reports?startDate=2026-03-01&endDate=2026-03-31",
    );
    assert.equal(otherReport.status, 200);
    assert.deepEqual(otherReport.body.data.summary.map(({ amountMinor }) => amountMinor), [99000]);
    assert.deepEqual(otherReport.body.data.budgets, []);
  },
);
