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

async function request(baseUrl, token, path, { method = "GET", body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return {
    status: response.status,
    body: response.status === 204 ? null : await response.json(),
  };
}

test(
  "budget endpoints calculate UTC spending correctly and isolate users",
  { skip: !databaseAvailable, timeout: 60_000 },
  async (t) => {
    await mongoose.connect(env.mongodbUri);
    const budgetIds = [];
    const transactionIds = [];
    const categoryIds = [];
    const userIds = [];
    let server;
    t.after(async () => {
      if (server?.listening) {
        await new Promise((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      }
      if (budgetIds.length) await Budget.deleteMany({ _id: { $in: budgetIds } });
      if (transactionIds.length) await Transaction.deleteMany({ _id: { $in: transactionIds } });
      if (categoryIds.length) await Category.deleteMany({ _id: { $in: categoryIds } });
      if (userIds.length) await User.deleteMany({ _id: { $in: userIds } });
      await mongoose.disconnect();
    });

    await Promise.all([User.init(), Category.init(), Transaction.init(), Budget.init()]);

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const passwordHash = await bcrypt.hash("budget-integration-password", 4);
    const [userOne, userTwo] = await User.create([
      { name: "Budget User One", email: `budget-one-${suffix}@example.test`, passwordHash },
      { name: "Budget User Two", email: `budget-two-${suffix}@example.test`, passwordHash },
    ]);
    const users = [userOne, userTwo];
    userIds.push(...users.map(({ _id }) => _id));
    const tokens = users.map(({ _id }) => accessToken(_id));
    const [categoryOne, categoryTwo, incomeCategory] = await Category.create([
      { userId: userOne._id, name: `Expense One ${suffix}`, type: "expense" },
      { userId: userTwo._id, name: `Expense Two ${suffix}`, type: "expense" },
      { userId: userOne._id, name: `Income One ${suffix}`, type: "income" },
    ]);
    categoryIds.push(categoryOne._id, categoryTwo._id, incomeCategory._id);
    server = createServer(app);

    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}/api`;
    const expenseTransactions = await Transaction.create([
      {
        userId: userOne._id,
        categoryId: categoryOne._id,
        type: "expense",
        amountMinor: 4000,
        currency: "USD",
        date: new Date("2026-03-01T00:00:00.000Z"),
        note: "At inclusive start",
      },
      {
        userId: userOne._id,
        categoryId: categoryOne._id,
        type: "expense",
        amountMinor: 3000,
        currency: "USD",
        date: new Date("2026-03-09T23:59:59.999Z"),
        note: "Before exclusive end",
      },
      {
        userId: userOne._id,
        categoryId: categoryOne._id,
        type: "expense",
        amountMinor: 5000,
        currency: "USD",
        date: new Date("2026-03-10T00:00:00.000Z"),
        note: "At exclusive end",
      },
      {
        userId: userOne._id,
        categoryId: incomeCategory._id,
        type: "income",
        amountMinor: 90000,
        currency: "USD",
        date: new Date("2026-03-05T00:00:00.000Z"),
        note: "Income never counts as spend",
      },
      {
        userId: userTwo._id,
        categoryId: categoryTwo._id,
        type: "expense",
        amountMinor: 80000,
        currency: "USD",
        date: new Date("2026-03-05T00:00:00.000Z"),
        note: "Another user's spend",
      },
    ]);
    transactionIds.push(...expenseTransactions.map(({ _id }) => _id));

    const customBudgetResponse = await request(baseUrl, tokens[0], "/budgets", {
      method: "POST",
      body: {
        amountMinor: 5000,
        currency: "usd",
        periodType: "custom",
        startDate: "2026-03-01",
        endDate: "2026-03-10",
      },
    });
    assert.equal(customBudgetResponse.status, 201);
    const customBudget = customBudgetResponse.body.data;
    budgetIds.push(customBudget._id);
    assert.equal(customBudget.spentMinor, 7000, JSON.stringify(customBudget));
    assert.equal(customBudget.remainingMinor, -2000);
    assert.equal(customBudget.percentageUsed, 140);
    assert.equal(customBudget.status, "over_budget");

    const categoryBudgetResponse = await request(baseUrl, tokens[0], "/budgets", {
      method: "POST",
      body: {
        categoryId: categoryOne._id.toString(),
        amountMinor: 10000,
        currency: "USD",
        periodType: "custom",
        startDate: "2026-03-01",
        endDate: "2026-03-10",
      },
    });
    assert.equal(categoryBudgetResponse.status, 201);
    const categoryBudget = categoryBudgetResponse.body.data;
    budgetIds.push(categoryBudget._id);
    assert.equal(categoryBudget.spentMinor, 7000);
    assert.equal(categoryBudget.remainingMinor, 3000);
    assert.equal(categoryBudget.percentageUsed, 70);
    assert.equal(categoryBudget.status, "on_track");

    const emptyBudgetResponse = await request(baseUrl, tokens[0], "/budgets", {
      method: "POST",
      body: {
        amountMinor: 25000,
        periodType: "custom",
        startDate: "2026-04-01",
        endDate: "2026-04-10",
      },
    });
    assert.equal(emptyBudgetResponse.status, 201);
    const emptyBudget = emptyBudgetResponse.body.data;
    budgetIds.push(emptyBudget._id);
    assert.equal(emptyBudget.spentMinor, 0);
    assert.equal(emptyBudget.remainingMinor, 25000);
    assert.equal(emptyBudget.percentageUsed, 0);
    assert.equal(emptyBudget.status, "on_track");

    const weeklyResponse = await request(baseUrl, tokens[0], "/budgets", {
      method: "POST",
      body: {
        amountMinor: 10000,
        periodType: "weekly",
        startDate: "2026-03-11",
      },
    });
    assert.equal(weeklyResponse.status, 201);
    budgetIds.push(weeklyResponse.body.data._id);
    assert.equal(weeklyResponse.body.data.startDate, "2026-03-09T00:00:00.000Z");
    assert.equal(weeklyResponse.body.data.endDate, "2026-03-16T00:00:00.000Z");

    const monthlyResponse = await request(baseUrl, tokens[0], "/budgets", {
      method: "POST",
      body: {
        amountMinor: 100000,
        periodType: "monthly",
        startDate: "2026-03-21",
      },
    });
    assert.equal(monthlyResponse.status, 201);
    budgetIds.push(monthlyResponse.body.data._id);
    assert.equal(monthlyResponse.body.data.startDate, "2026-03-01T00:00:00.000Z");
    assert.equal(monthlyResponse.body.data.endDate, "2026-04-01T00:00:00.000Z");

    const foreignCategoryBudget = await request(baseUrl, tokens[0], "/budgets", {
      method: "POST",
      body: {
        categoryId: categoryTwo._id.toString(),
        amountMinor: 10000,
        periodType: "monthly",
        startDate: "2026-03-15",
      },
    });
    assert.equal(foreignCategoryBudget.status, 404);

    const incomeCategoryBudget = await request(baseUrl, tokens[0], "/budgets", {
      method: "POST",
      body: {
        categoryId: incomeCategory._id.toString(),
        amountMinor: 10000,
        periodType: "monthly",
        startDate: "2026-03-15",
      },
    });
    assert.equal(incomeCategoryBudget.status, 404);

    const listedBudgets = await request(baseUrl, tokens[0], "/budgets?page=1&limit=2");
    assert.equal(listedBudgets.status, 200);
    assert.equal(listedBudgets.body.data.length, 2);
    assert.equal(listedBudgets.body.pagination.total, 5);
    const categoryScopedBudgets = await request(
      baseUrl,
      tokens[0],
      `/budgets?scope=category&categoryId=${categoryOne._id.toString()}`,
    );
    assert.equal(categoryScopedBudgets.body.pagination.total, 1);
    const overallBudgets = await request(baseUrl, tokens[0], "/budgets?scope=overall");
    assert.equal(overallBudgets.body.pagination.total, 4);

    const foreignGet = await request(baseUrl, tokens[1], `/budgets/${customBudget._id}`);
    const foreignPatch = await request(baseUrl, tokens[1], `/budgets/${customBudget._id}`, {
      method: "PATCH",
      body: { amountMinor: 1 },
    });
    const foreignDelete = await request(baseUrl, tokens[1], `/budgets/${customBudget._id}`, {
      method: "DELETE",
    });
    assert.equal(foreignGet.status, 404);
    assert.equal(foreignPatch.status, 404);
    assert.equal(foreignDelete.status, 404);

    const ownPatch = await request(baseUrl, tokens[0], `/budgets/${customBudget._id}`, {
      method: "PATCH",
      body: { amountMinor: 6000 },
    });
    assert.equal(ownPatch.status, 200);
    assert.equal(ownPatch.body.data.amountMinor, 6000);
    assert.equal(ownPatch.body.data.spentMinor, 7000);
    assert.equal(ownPatch.body.data.status, "over_budget");

    const ownDelete = await request(baseUrl, tokens[0], `/budgets/${emptyBudget._id}`, {
      method: "DELETE",
    });
    assert.equal(ownDelete.status, 204);
    budgetIds.splice(budgetIds.indexOf(emptyBudget._id), 1);
  },
);
