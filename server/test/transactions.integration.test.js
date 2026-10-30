import "dotenv/config";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import app from "../src/app.js";
import { env } from "../src/config/env.js";
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
  "transaction and category APIs isolate two users and preserve safe category deletion",
  { skip: !databaseAvailable, timeout: 60_000 },
  async (t) => {
    await mongoose.connect(env.mongodbUri);
    await Promise.all([User.init(), Category.init(), Transaction.init()]);

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const passwordHash = await bcrypt.hash("integration-test-password", 4);
    const users = await User.create([
      { name: "User One", email: `user-one-${suffix}@example.test`, passwordHash },
      { name: "User Two", email: `user-two-${suffix}@example.test`, passwordHash },
    ]);
    const [userOne, userTwo] = users;
    const tokens = [accessToken(userOne._id), accessToken(userTwo._id)];
    const server = createServer(app);

    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}/api`;
    const createdCategories = [];
    const createdTransactions = [];

    t.after(async () => {
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      await Transaction.deleteMany({ _id: { $in: createdTransactions } });
      await Category.deleteMany({ _id: { $in: createdCategories } });
      await User.deleteMany({ _id: { $in: users.map(({ _id }) => _id) } });
      await mongoose.disconnect();
    });

    const unauthenticated = await fetch(`${baseUrl}/categories`);
    assert.equal(unauthenticated.status, 401);

    const categoryOneResponse = await request(baseUrl, tokens[0], "/categories", {
      method: "POST",
      body: { name: "User One Food", type: "expense", userId: userTwo._id.toString() },
    });
    assert.equal(categoryOneResponse.status, 400, "unknown owner IDs are rejected");

    const categoryOne = await request(baseUrl, tokens[0], "/categories", {
      method: "POST",
      body: { name: "User One Food", type: "expense" },
    });
    const categoryTwo = await request(baseUrl, tokens[1], "/categories", {
      method: "POST",
      body: { name: "User Two Food", type: "expense" },
    });
    const incomeCategory = await request(baseUrl, tokens[0], "/categories", {
      method: "POST",
      body: { name: "User One Salary", type: "income" },
    });
    assert.equal(categoryOne.status, 201);
    assert.equal(categoryTwo.status, 201);
    assert.equal(incomeCategory.status, 201);
    const categoryOneId = categoryOne.body.data._id;
    const categoryTwoId = categoryTwo.body.data._id;
    const incomeCategoryId = incomeCategory.body.data._id;
    createdCategories.push(categoryOneId, categoryTwoId, incomeCategoryId);
    assert.equal("userId" in categoryOne.body.data, false);

    const categorySearch = await request(
      baseUrl,
      tokens[0],
      "/categories?type=expense&search=user%20one&page=1&limit=1",
    );
    assert.equal(categorySearch.status, 200);
    assert.equal(categorySearch.body.pagination.total, 1);
    assert.equal(categorySearch.body.data[0]._id, categoryOneId);

    const categoryUpdate = await request(baseUrl, tokens[0], `/categories/${categoryOneId}`, {
      method: "PATCH",
      body: { color: "#123456" },
    });
    assert.equal(categoryUpdate.status, 200);
    assert.equal(categoryUpdate.body.data.color, "#123456");
    const categoryRead = await request(baseUrl, tokens[0], `/categories/${categoryOneId}`);
    assert.equal(categoryRead.status, 200);

    const crossCategoryRead = await request(baseUrl, tokens[1], `/categories/${categoryOneId}`);
    const crossCategoryUpdate = await request(baseUrl, tokens[1], `/categories/${categoryOneId}`, {
      method: "PATCH",
      body: { name: "Hijacked" },
    });
    const crossCategoryDelete = await request(baseUrl, tokens[1], `/categories/${categoryOneId}`, {
      method: "DELETE",
    });
    assert.equal(crossCategoryRead.status, 404);
    assert.equal(crossCategoryUpdate.status, 404);
    assert.equal(crossCategoryDelete.status, 404);

    const wrongOwnerReference = await request(baseUrl, tokens[0], "/transactions", {
      method: "POST",
      body: {
        categoryId: categoryTwoId,
        type: "expense",
        amountMinor: 1250,
        note: "foreign category",
      },
    });
    assert.equal(wrongOwnerReference.status, 404);

    const mismatchedType = await request(baseUrl, tokens[0], "/transactions", {
      method: "POST",
      body: {
        categoryId: categoryOneId,
        type: "income",
        amountMinor: 1250,
      },
    });
    assert.equal(mismatchedType.status, 400);

    const transactionOne = await request(baseUrl, tokens[0], "/transactions", {
      method: "POST",
      body: {
        categoryId: categoryOneId,
        type: "expense",
        amountMinor: 1250,
        date: "2026-03-15T12:00:00.000Z",
        note: "Coffee and lunch",
        paymentMethod: "card",
        currency: "USD",
      },
    });
    const transactionTwo = await request(baseUrl, tokens[1], "/transactions", {
      method: "POST",
      body: {
        categoryId: categoryTwoId,
        type: "expense",
        amountMinor: 2400,
        date: "2026-03-16T12:00:00.000Z",
        note: "Groceries",
      },
    });
    assert.equal(transactionOne.status, 201);
    assert.equal(transactionTwo.status, 201);
    const transactionOneId = transactionOne.body.data._id;
    const transactionTwoId = transactionTwo.body.data._id;
    createdTransactions.push(transactionOneId, transactionTwoId);
    assert.equal("userId" in transactionOne.body.data, false);

    const incomeTransaction = await request(baseUrl, tokens[0], "/transactions", {
      method: "POST",
      body: {
        categoryId: incomeCategoryId,
        type: "income",
        amountMinor: 125000,
        date: "2026-03-20T12:00:00.000Z",
        note: "Monthly salary",
      },
    });
    assert.equal(incomeTransaction.status, 201);
    createdTransactions.push(incomeTransaction.body.data._id);
    assert.equal(incomeTransaction.body.data.type, "income");

    const crossTransactionRead = await request(baseUrl, tokens[1], `/transactions/${transactionOneId}`);
    const crossTransactionUpdate = await request(baseUrl, tokens[1], `/transactions/${transactionOneId}`, {
      method: "PATCH",
      body: { note: "Modified by another user" },
    });
    const crossTransactionDelete = await request(baseUrl, tokens[1], `/transactions/${transactionOneId}`, {
      method: "DELETE",
    });
    assert.equal(crossTransactionRead.status, 404);
    assert.equal(crossTransactionUpdate.status, 404);
    assert.equal(crossTransactionDelete.status, 404);

    const filtered = await request(
      baseUrl,
      tokens[0],
      "/transactions?type=expense&startDate=2026-03-15&endDate=2026-03-15&search=coffee&page=1&limit=1",
    );
    assert.equal(filtered.status, 200);
    assert.equal(filtered.body.pagination.total, 1);
    assert.equal(filtered.body.pagination.page, 1);
    assert.equal(filtered.body.data[0]._id, transactionOneId);

    const incomeFilter = await request(baseUrl, tokens[0], "/transactions?type=income&search=salary");
    assert.equal(incomeFilter.status, 200);
    assert.equal(incomeFilter.body.pagination.total, 1);
    assert.equal(incomeFilter.body.data[0]._id, incomeTransaction.body.data._id);

    const transactionUpdate = await request(baseUrl, tokens[0], `/transactions/${transactionOneId}`, {
      method: "PATCH",
      body: { note: "Updated lunch" },
    });
    assert.equal(transactionUpdate.status, 200);
    assert.equal(transactionUpdate.body.data.note, "Updated lunch");

    const categoryTypeChange = await request(baseUrl, tokens[0], `/categories/${categoryOneId}`, {
      method: "PATCH",
      body: { type: "income" },
    });
    assert.equal(categoryTypeChange.status, 409);

    const categoryDelete = await request(baseUrl, tokens[0], `/categories/${categoryOneId}`, {
      method: "DELETE",
    });
    assert.equal(categoryDelete.status, 200);
    assert.equal(categoryDelete.body.archived, true);

    const historicalTransaction = await request(
      baseUrl,
      tokens[0],
      `/transactions/${transactionOneId}`,
    );
    assert.equal(historicalTransaction.status, 200);
    assert.equal(historicalTransaction.body.data.categoryId.name, "User One Food");

    const createWithArchivedCategory = await request(baseUrl, tokens[0], "/transactions", {
      method: "POST",
      body: { categoryId: categoryOneId, type: "expense", amountMinor: 900 },
    });
    assert.equal(createWithArchivedCategory.status, 404);

    const ownerList = await request(baseUrl, tokens[0], "/transactions?page=1&limit=100");
    const otherOwnerList = await request(baseUrl, tokens[1], "/transactions?page=1&limit=100");
    assert.deepEqual(
      new Set(ownerList.body.data.map(({ _id }) => _id)),
      new Set([transactionOneId, incomeTransaction.body.data._id]),
    );
    assert.deepEqual(otherOwnerList.body.data.map(({ _id }) => _id), [transactionTwoId]);

    const ownerDelete = await request(baseUrl, tokens[1], `/transactions/${transactionTwoId}`, {
      method: "DELETE",
    });
    assert.equal(ownerDelete.status, 204);
  },
);
