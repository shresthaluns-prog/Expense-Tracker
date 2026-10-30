import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import Budget from "../src/features/budgets/budget.model.js";
import Category from "../src/features/categories/category.model.js";
import RefreshSession from "../src/features/auth/refresh-session.model.js";
import User from "../src/features/auth/user.model.js";
import Transaction from "../src/features/expenses/transaction.model.js";

const userId = new mongoose.Types.ObjectId();
const categoryId = new mongoose.Types.ObjectId();
const bcryptHash = "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";
const tokenHash = "a".repeat(64);

async function assertInvalid(document, path) {
  await assert.rejects(document.validate(), (error) => {
    assert.ok(error.errors[path], `Expected validation error on ${path}.`);
    return true;
  });
}

test("User validates normalized email and only accepts a bcrypt password hash", async () => {
  const user = new User({ name: " Ada ", email: " ADA@example.com ", passwordHash: bcryptHash });
  assert.equal(user.name, "Ada");
  assert.equal(user.email, "ada@example.com");
  await user.validate();
  assert.equal(User.schema.path("passwordHash").options.select, false);

  await assertInvalid(new User({ name: "Ada", email: "not-an-email", passwordHash: bcryptHash }), "email");
  await assertInvalid(new User({ name: "Ada", email: "ada@example.com", passwordHash: "plaintext" }), "passwordHash");
});

test("User has a unique email index", () => {
  assert.ok(
    User.schema.indexes().some(([keys, options]) => keys.email === 1 && options.unique),
  );
});

test("RefreshSession validates user, SHA-256 token hash and expiry", async () => {
  const session = new RefreshSession({
    userId,
    tokenHash,
    expiresAt: new Date("2030-01-01T00:00:00.000Z"),
  });
  await session.validate();
  assert.equal(session.revokedAt, null);
  assert.equal(RefreshSession.schema.path("tokenHash").options.select, false);

  await assertInvalid(
    new RefreshSession({ tokenHash, expiresAt: new Date() }),
    "userId",
  );
  await assertInvalid(
    new RefreshSession({ userId, tokenHash: "raw-token", expiresAt: new Date() }),
    "tokenHash",
  );
  assert.ok(
    RefreshSession.schema.indexes().some(
      ([keys, options]) => keys.expiresAt === 1 && options.expireAfterSeconds === 0,
    ),
  );
});

test("Category validates type, ownership and case-insensitive per-user uniqueness index", async () => {
  const category = new Category({ userId, name: " Food ", type: "expense" });
  assert.equal(category.name, "Food");
  await category.validate();
  await assertInvalid(new Category({ name: "Food", type: "expense" }), "userId");
  await assertInvalid(new Category({ userId, name: "Food", type: "transfer" }), "type");
  assert.ok(
    Category.schema.indexes().some(
      ([keys, options]) =>
        keys.userId === 1 &&
        keys.type === 1 &&
        keys.name === 1 &&
        options.unique &&
        options.collation?.strength === 2,
    ),
  );
});

test("Transaction validates owned references and integer minor-unit amounts", async () => {
  const defaultCurrency = new Transaction({ userId, categoryId, type: "expense", amountMinor: 1234 });
  assert.equal(defaultCurrency.currency, "NPR");
  const transaction = new Transaction({
    userId,
    categoryId,
    type: "expense",
    amountMinor: 1234,
    currency: "usd",
    date: new Date("2025-01-01T00:00:00.000Z"),
    paymentMethod: "card",
  });
  await transaction.validate();
  assert.equal(transaction.currency, "USD");

  await assertInvalid(new Transaction({ categoryId, amountMinor: 1234 }), "userId");
  await assertInvalid(new Transaction({ userId, categoryId, amountMinor: 12.34 }), "amountMinor");
  await assertInvalid(
    new Transaction({ userId, categoryId, amountMinor: 1234, paymentMethod: "crypto" }),
    "paymentMethod",
  );
  assert.ok(
    Transaction.schema.indexes().some(
      ([keys]) => keys.userId === 1 && keys.type === 1 && keys.date === -1,
    ),
  );
});

test("Budget supports overall and category limits with a valid date interval", async () => {
  const overall = new Budget({
    userId,
    amountMinor: 50000,
    periodType: "monthly",
    startDate: new Date("2025-01-01T00:00:00.000Z"),
    endDate: new Date("2025-02-01T00:00:00.000Z"),
  });
  const categoryBudget = new Budget({
    userId,
    categoryId,
    amountMinor: 25000,
    periodType: "weekly",
    startDate: new Date("2025-01-01T00:00:00.000Z"),
    endDate: new Date("2025-02-01T00:00:00.000Z"),
  });

  assert.equal(overall.categoryId, null);
  assert.equal(overall.currency, "NPR");
  assert.equal(overall.periodType, "monthly");
  assert.equal(categoryBudget.periodType, "weekly");
  assert.equal(Budget.schema.path("periodType").instance, "String");
  await overall.validate();
  await categoryBudget.validate();

  await assertInvalid(
    new Budget({
      userId,
      amountMinor: 0,
      startDate: new Date("2025-02-01T00:00:00.000Z"),
      endDate: new Date("2025-01-01T00:00:00.000Z"),
    }),
    "amountMinor",
  );
  await assertInvalid(
    new Budget({
      userId,
      amountMinor: 100,
      periodType: "annual",
      startDate: new Date("2025-02-01T00:00:00.000Z"),
      endDate: new Date("2025-03-01T00:00:00.000Z"),
    }),
    "periodType",
  );
  await assertInvalid(
    new Budget({
      userId,
      amountMinor: 100,
      startDate: new Date("2025-02-01T00:00:00.000Z"),
      endDate: new Date("2025-01-01T00:00:00.000Z"),
    }),
    "endDate",
  );
  assert.ok(
    Budget.schema.indexes().some(
      ([keys, options]) =>
        keys.userId === 1 &&
        keys.categoryId === 1 &&
        keys.currency === 1 &&
        keys.startDate === 1 &&
        keys.endDate === 1 &&
        options.unique,
    ),
  );
});

test("all financial models require a user ObjectId reference and timestamps", () => {
  for (const Model of [RefreshSession, Category, Transaction, Budget]) {
    assert.equal(Model.schema.path("userId").instance, "ObjectId");
    assert.equal(Model.schema.path("userId").options.ref, "User");
    assert.equal(Model.schema.options.timestamps, true);
  }
});
