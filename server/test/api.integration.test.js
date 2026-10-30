import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test, { after, afterEach, before } from "node:test";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import request from "supertest";
import app from "../src/app.js";
import { env } from "../src/config/env.js";
import { authLimiter } from "../src/features/auth/auth.routes.js";
import Budget from "../src/features/budgets/budget.model.js";
import Category from "../src/features/categories/category.model.js";
import { hashRefreshToken } from "../src/features/auth/auth.service.js";
import RefreshSession from "../src/features/auth/refresh-session.model.js";
import Transaction from "../src/features/expenses/transaction.model.js";
import User from "../src/features/auth/user.model.js";

const allowedOrigin = "http://localhost:5173";
const createdEmails = new Set();

function randomSuffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readCookie(response, name) {
  const cookie = (response.headers["set-cookie"] ?? []).find((value) =>
    value.startsWith(`${name}=`),
  );
  return cookie?.split(";", 1)[0].slice(name.length + 1);
}

function signedAccessToken(userId, expiresIn = "5m") {
  return jwt.sign({ tokenUse: "access" }, env.accessTokenSecret, {
    algorithm: "HS256",
    subject: userId,
    issuer: "expense-tracker-api",
    audience: "expense-tracker-client",
    expiresIn,
  });
}

async function registerAgent(name = "Integration User") {
  const email = `integration-${randomSuffix()}@example.test`;
  const rawAgent = request.agent(app);
  const response = await rawAgent
    .post("/api/auth/register")
    .set("Origin", allowedOrigin)
    .send({ name, email, password: "IntegrationPassword834!" });
  assert.equal(response.status, 201, response.text);
  createdEmails.add(email);
  const agent = Object.fromEntries(
    ["get", "post", "patch", "put", "delete"].map((method) => [
      method,
      (path) =>
        rawAgent[method](path).set(
          "Authorization",
          `Bearer ${response.body.accessToken}`,
        ),
    ]),
  );
  return { email, agent, response, user: response.body.user };
}

async function createCategory(agent, name, type = "expense") {
  const response = await agent
    .post("/api/categories")
    .set("Origin", allowedOrigin)
    .send({ name, type });
  assert.equal(response.status, 201, response.text);
  return response.body.data;
}

before(async () => {
  assert.match(env.mongodbUri, /expense_tracker_test/, "tests must use the isolated MongoDB database");
  await mongoose.connect(env.mongodbUri);
  await Promise.all([
    User.init(),
    RefreshSession.init(),
    Category.init(),
    Transaction.init(),
    Budget.init(),
  ]);
});

afterEach(async () => {
  await authLimiter.resetKey("127.0.0.1");
  if (createdEmails.size === 0) return;
  const users = await User.find({ email: { $in: [...createdEmails] } }).select("_id");
  const userIds = users.map(({ _id }) => _id);
  if (userIds.length) {
    await Promise.all([
      RefreshSession.deleteMany({ userId: { $in: userIds } }),
      Transaction.deleteMany({ userId: { $in: userIds } }),
      Budget.deleteMany({ userId: { $in: userIds } }),
      Category.deleteMany({ userId: { $in: userIds } }),
      User.deleteMany({ _id: { $in: userIds } }),
    ]);
  }
  createdEmails.clear();
});

after(async () => {
  await mongoose.disconnect();
});

test("registration, duplicate emails, login, current user, cookies, and stable CSRF bootstrap", async () => {
  const email = `auth-${randomSuffix()}@example.test`;
  const password = "IntegrationPassword834!";
  const agent = request.agent(app);
  const registration = await agent
    .post("/api/auth/register")
    .set("Origin", allowedOrigin)
    .send({ name: "Test User", email, password });

  assert.equal(registration.status, 201, registration.text);
  assert.equal(registration.headers["access-control-allow-origin"], allowedOrigin);
  assert.equal(registration.headers["access-control-allow-credentials"], "true");
  createdEmails.add(email);
  assert.equal(registration.body.user.email, email);
  assert.equal("passwordHash" in registration.body.user, false);
  assert.ok(registration.body.accessToken);
  assert.ok(registration.body.csrfToken);

  const defaultCategories = await agent
    .get("/api/categories")
    .set("Authorization", `Bearer ${registration.body.accessToken}`);
  assert.equal(defaultCategories.status, 200, defaultCategories.text);
  assert.deepEqual(
    defaultCategories.body.data
      .filter(({ type }) => type === "expense")
      .map(({ name }) => name)
      .sort(),
    ["Education", "Entertainment", "Food", "Miscellaneous", "Rent"],
  );

  const refreshCookie = registration.headers["set-cookie"].find((value) =>
    value.startsWith("expense_refresh="),
  );
  const csrfCookie = registration.headers["set-cookie"].find((value) =>
    value.startsWith("expense_csrf="),
  );
  assert.match(refreshCookie, /HttpOnly/i);
  assert.match(refreshCookie, /SameSite=Lax/i);
  assert.match(refreshCookie, /Path=\/api\/auth/i);
  assert.match(csrfCookie, /HttpOnly/i);

  const duplicate = await request(app)
    .post("/api/auth/register")
    .set("Origin", allowedOrigin)
    .send({ name: "Duplicate", email, password });
  assert.equal(duplicate.status, 409);

  const currentUser = await agent
    .get("/api/auth/me")
    .set("Authorization", `Bearer ${registration.body.accessToken}`);
  assert.equal(currentUser.status, 200);
  assert.equal(currentUser.body.user.id, registration.body.user.id);

  const bootstrap = await agent.get("/api/auth/csrf").set("Origin", allowedOrigin);
  assert.equal(bootstrap.status, 200);
  assert.equal(bootstrap.body.csrfToken, registration.body.csrfToken);
  assert.equal(bootstrap.headers["set-cookie"], undefined);

  const login = await request.agent(app)
    .post("/api/auth/login")
    .set("Origin", allowedOrigin)
    .send({ email, password });
  assert.equal(login.status, 200);
  assert.notEqual(readCookie(login, "expense_refresh"), readCookie(registration, "expense_refresh"));
  await Category.deleteOne({
    userId: registration.body.user.id,
    type: "expense",
    name: "Food",
  });
  const secondLogin = await request.agent(app)
    .post("/api/auth/login")
    .set("Origin", allowedOrigin)
    .send({ email, password });
  assert.equal(secondLogin.status, 200, secondLogin.text);
  const categoriesAfterLogin = await agent
    .get("/api/categories")
    .set("Authorization", `Bearer ${registration.body.accessToken}`);
  assert.equal(
    categoriesAfterLogin.body.data.filter(({ type }) => type === "expense").length,
    5,
    "existing login seeding must not duplicate defaults",
  );

  const invalidLogin = await request(app)
    .post("/api/auth/login")
    .set("Origin", allowedOrigin)
    .send({ email, password: "wrong-password" });
  assert.equal(invalidLogin.status, 401);

  const noOrigin = await request(app)
    .post("/api/auth/login")
    .send({ email, password });
  assert.equal(noOrigin.status, 403);
});

test("registration rejects passwords missing required characters or containing whitespace", async () => {
  for (const password of ["lowercase1!", "UPPERCASE1!", "NoNumber!!", "NoSpecial1", "White Space1!"]) {
    const response = await request(app)
      .post("/api/auth/register")
      .set("Origin", allowedOrigin)
      .send({
        name: "Invalid Password User",
        email: `invalid-${randomSuffix()}@example.test`,
        password,
      });
    assert.equal(response.status, 400, `${password}: ${response.text}`);
  }
});

test("missing and expired access tokens are rejected by protected routes", async () => {
  const { response: registered } = await registerAgent("Token Test User");
  const unauthenticated = await request(app).get("/api/auth/me");
  assert.equal(unauthenticated.status, 401);

  const noRefreshAgent = request.agent(app);
  const csrfBootstrap = await noRefreshAgent
    .get("/api/auth/csrf")
    .set("Origin", allowedOrigin);
  const missingRefresh = await noRefreshAgent
    .post("/api/auth/refresh")
    .set("Origin", allowedOrigin)
    .set("X-CSRF-Token", csrfBootstrap.body.csrfToken);
  assert.equal(missingRefresh.status, 401);

  const expiredToken = signedAccessToken(registered.body.user.id, -1);
  const expired = await request(app)
    .get("/api/auth/me")
    .set("Authorization", `Bearer ${expiredToken}`);
  assert.equal(expired.status, 401);

  const malformedId = await request(app)
    .get("/api/transactions/not-an-object-id")
    .set("Authorization", `Bearer ${registered.body.accessToken}`);
  assert.equal(malformedId.status, 400, "malformed IDs are rejected after authentication");
});

test("refresh rotation, expired sessions, replay revocation, and logout", async () => {
  const { agent, response: registration } = await registerAgent("Rotation User");
  const originalRefresh = readCookie(registration, "expense_refresh");
  const rotated = await agent
    .post("/api/auth/refresh")
    .set("Origin", allowedOrigin)
    .set("X-CSRF-Token", registration.body.csrfToken);
  assert.equal(rotated.status, 200, rotated.text);
  const rotatedRefresh = readCookie(rotated, "expense_refresh");
  assert.ok(rotatedRefresh);
  assert.notEqual(rotatedRefresh, originalRefresh);
  assert.notEqual(rotated.body.csrfToken, registration.body.csrfToken);

  const expiredAgent = request.agent(app);
  const expiredRegistration = await expiredAgent
    .post("/api/auth/register")
    .set("Origin", allowedOrigin)
    .send({
      name: "Expired Session User",
      email: `expired-${randomSuffix()}@example.test`,
      password: "IntegrationPassword834!",
    });
  const expiredEmail = expiredRegistration.body.user.email;
  createdEmails.add(expiredEmail);
  const expiredCookie = readCookie(expiredRegistration, "expense_refresh");
  const expiredSession = await RefreshSession.findOne({
    tokenHash: hashRefreshToken(expiredCookie),
  });
  expiredSession.expiresAt = new Date(Date.now() - 1000);
  await expiredSession.save();
  const expiredRefresh = await expiredAgent
    .post("/api/auth/refresh")
    .set("Origin", allowedOrigin)
    .set("X-CSRF-Token", expiredRegistration.body.csrfToken);
  assert.equal(expiredRefresh.status, 401);

  const replay = await request(app)
    .post("/api/auth/refresh")
    .set("Origin", allowedOrigin)
    .set(
      "Cookie",
      `expense_refresh=${originalRefresh}; expense_csrf=${readCookie(rotated, "expense_csrf")}`,
    )
    .set("X-CSRF-Token", rotated.body.csrfToken);
  assert.equal(replay.status, 401);
  const afterReplay = await agent
    .post("/api/auth/refresh")
    .set("Origin", allowedOrigin)
    .set("X-CSRF-Token", rotated.body.csrfToken);
  assert.equal(afterReplay.status, 401, "replay revokes the active token family");

  const { agent: logoutAgent, response: logoutCredentials } =
    await registerAgent("Logout User");
  const logout = await logoutAgent
    .post("/api/auth/logout")
    .set("Origin", allowedOrigin)
    .set("X-CSRF-Token", logoutCredentials.body.csrfToken);
  assert.equal(logout.status, 204);
  assert.ok(
    logout.headers["set-cookie"].some((value) =>
      /expense_refresh=.*Expires=Thu, 01 Jan 1970/i.test(value),
    ),
  );

  const { agent: logoutAllAgent, response: logoutAllCredentials } =
    await registerAgent("Logout All User");
  const userId = logoutAllCredentials.body.user.id;
  await request.agent(app)
    .post("/api/auth/login")
    .set("Origin", allowedOrigin)
    .send({
      email: logoutAllCredentials.body.user.email,
      password: "IntegrationPassword834!",
    });
  const logoutAll = await logoutAllAgent
    .post("/api/auth/logout-all")
    .set("Origin", allowedOrigin)
    .set("Authorization", `Bearer ${logoutAllCredentials.body.accessToken}`)
    .set("X-CSRF-Token", logoutAllCredentials.body.csrfToken);
  assert.equal(logoutAll.status, 204, logoutAll.text);
  assert.equal(
    await RefreshSession.countDocuments({ userId, revokedAt: null }),
    0,
  );
});

test("transaction and category CRUD validate IDs, pagination, date boundaries, and ownership", async () => {
  const owner = await registerAgent("CRUD Owner");
  const other = await registerAgent("CRUD Other");
  const category = await createCategory(owner.agent, "Meals");
  const foreignCategory = await createCategory(other.agent, "Foreign Meals");

  const invalidCategoryId = await owner.agent.get("/api/categories/not-an-id");
  assert.equal(invalidCategoryId.status, 400);
  const invalidPayload = await owner.agent
    .post("/api/transactions")
    .set("Origin", allowedOrigin)
    .send({ categoryId: category._id, type: "expense", amountMinor: -50 });
  assert.equal(invalidPayload.status, 400);
  const suppliedOwner = await owner.agent
    .post("/api/categories")
    .set("Origin", allowedOrigin)
    .send({ name: "Impersonation", type: "expense", userId: other.user.id });
  assert.equal(suppliedOwner.status, 400);

  const foreignReference = await owner.agent
    .post("/api/transactions")
    .set("Origin", allowedOrigin)
    .send({ categoryId: foreignCategory._id, type: "expense", amountMinor: 500 });
  assert.equal(foreignReference.status, 404);

  const boundaryTransaction = await owner.agent
    .post("/api/transactions")
    .set("Origin", allowedOrigin)
    .send({
      categoryId: category._id,
      type: "expense",
      amountMinor: 1250,
      currency: "USD",
      date: "2026-03-31T23:59:59.999Z",
      note: "March boundary",
    });
  assert.equal(boundaryTransaction.status, 201, boundaryTransaction.text);
  const transactionId = boundaryTransaction.body.data._id;

  const ownRead = await owner.agent.get(`/api/transactions/${transactionId}`);
  assert.equal(ownRead.status, 200);
  const crossRead = await other.agent.get(`/api/transactions/${transactionId}`);
  assert.equal(crossRead.status, 404);
  const crossUpdate = await other.agent
    .patch(`/api/transactions/${transactionId}`)
    .set("Origin", allowedOrigin)
    .send({ note: "stolen" });
  assert.equal(crossUpdate.status, 404);
  const crossDelete = await other.agent
    .delete(`/api/transactions/${transactionId}`)
    .set("Origin", allowedOrigin);
  assert.equal(crossDelete.status, 404);

  const dateFilter = await owner.agent.get(
    "/api/transactions?startDate=2026-03-31&endDate=2026-03-31&page=1&limit=1",
  );
  assert.equal(dateFilter.status, 200);
  assert.equal(dateFilter.body.pagination.total, 1);
  assert.equal(dateFilter.body.data[0]._id, transactionId);
  const badPage = await owner.agent.get("/api/transactions?page=0&limit=999");
  assert.equal(badPage.status, 400);

  const update = await owner.agent
    .patch(`/api/transactions/${transactionId}`)
    .set("Origin", allowedOrigin)
    .send({ note: "Updated boundary" });
  assert.equal(update.status, 200);
  assert.equal(update.body.data.note, "Updated boundary");
  const deleted = await owner.agent
    .delete(`/api/transactions/${transactionId}`)
    .set("Origin", allowedOrigin);
  assert.equal(deleted.status, 204);

  await createCategory(owner.agent, "Commute");
  const categoriesPage = await owner.agent.get("/api/categories?page=1&limit=1");
  assert.equal(categoriesPage.status, 200);
  assert.equal(categoriesPage.body.pagination.total, 7);
  assert.equal(categoriesPage.body.data.length, 1);
});

test("budget CRUD derives spend from transactions and analytics stay user-scoped", async () => {
  const owner = await registerAgent("Budget Owner");
  const other = await registerAgent("Budget Other");
  const category = await createCategory(owner.agent, "Budget Food");
  const otherCategory = await createCategory(other.agent, "Other Food");
  const expense = await owner.agent
    .post("/api/transactions")
    .set("Origin", allowedOrigin)
    .send({
      categoryId: category._id,
      type: "expense",
      amountMinor: 7500,
      currency: "USD",
      date: "2026-03-10T12:00:00.000Z",
    });
  assert.equal(expense.status, 201);
  await other.agent
    .post("/api/transactions")
    .set("Origin", allowedOrigin)
    .send({
      categoryId: otherCategory._id,
      type: "expense",
      amountMinor: 99000,
      currency: "USD",
      date: "2026-03-10T12:00:00.000Z",
    })
    .expect(201);

  const budget = await owner.agent
    .post("/api/budgets")
    .set("Origin", allowedOrigin)
    .send({
      categoryId: category._id,
      amountMinor: 5000,
      currency: "USD",
      periodType: "custom",
      startDate: "2026-03-01",
      endDate: "2026-03-11",
    });
  assert.equal(budget.status, 201, budget.text);
  assert.equal(budget.body.data.spentMinor, 7500);
  assert.equal(budget.body.data.status, "over_budget");

  const foreignBudget = await owner.agent
    .post("/api/budgets")
    .set("Origin", allowedOrigin)
    .send({
      categoryId: otherCategory._id,
      amountMinor: 10000,
      periodType: "custom",
      startDate: "2026-03-01",
      endDate: "2026-03-11",
    });
  assert.equal(foreignBudget.status, 404);
  const invalidBudgetId = await owner.agent.get("/api/budgets/invalid");
  assert.equal(invalidBudgetId.status, 400);
  const crossBudgetRead = await other.agent.get(`/api/budgets/${budget.body.data._id}`);
  assert.equal(crossBudgetRead.status, 404);

  const budgetUpdate = await owner.agent
    .patch(`/api/budgets/${budget.body.data._id}`)
    .set("Origin", allowedOrigin)
    .send({ amountMinor: 10000 });
  assert.equal(budgetUpdate.status, 200);
  assert.equal(budgetUpdate.body.data.spentMinor, 7500);
  assert.equal(budgetUpdate.body.data.status, "on_track");

  const report = await owner.agent.get(
    "/api/reports?startDate=2026-03-01&endDate=2026-03-31&timezone=UTC",
  );
  assert.equal(report.status, 200, report.text);
  assert.ok(report.body.data.totals.some((row) => row.currency === "USD" && row.expensesMinor === 7500));
  assert.equal(JSON.stringify(report.body).includes("99000"), false);
  const invalidRange = await owner.agent.get(
    "/api/reports?startDate=2026-04-01&endDate=2026-03-01",
  );
  assert.equal(invalidRange.status, 400);

  const crossBudgetDelete = await other.agent
    .delete(`/api/budgets/${budget.body.data._id}`)
    .set("Origin", allowedOrigin);
  assert.equal(crossBudgetDelete.status, 404);
  const budgetDelete = await owner.agent
    .delete(`/api/budgets/${budget.body.data._id}`)
    .set("Origin", allowedOrigin);
  assert.equal(budgetDelete.status, 204);
});

test("CORS rejects untrusted auth origins and production refresh cookies are Secure", async () => {
  const untrusted = await request(app)
    .get("/api/auth/csrf")
    .set("Origin", "https://not-allowed.example");
  assert.equal(untrusted.status, 403);

  const preflight = await request(app)
    .options("/api/transactions")
    .set("Origin", "https://not-allowed.example")
    .set("Access-Control-Request-Method", "GET");
  assert.equal(preflight.headers["access-control-allow-origin"], undefined);

  const script = `
    import { setAuthCookies } from "./src/features/auth/auth.middleware.js";
    const cookies = [];
    const response = { cookie: (name, value, options) => cookies.push({ name, value, options }) };
    setAuthCookies(response, "refresh-secret");
    console.log(JSON.stringify(cookies.map(({ name, options }) => ({ name, secure: options.secure, httpOnly: options.httpOnly, sameSite: options.sameSite }))));
  `;
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: "5000",
      MONGODB_URI: "mongodb://127.0.0.1:27017/expense_tracker_test",
      CLIENT_ORIGINS: allowedOrigin,
      ACCESS_TOKEN_SECRET: "production-test-access-secret-32-characters",
      CSRF_SECRET: "production-test-csrf-secret-different-32-characters",
      REFRESH_COOKIE_SAME_SITE: "lax",
    },
  });
  assert.equal(child.status, 0, child.stderr);
  const cookies = JSON.parse(child.stdout.trim().split(/\r?\n/).at(-1));
  const refreshCookie = cookies.find(({ name }) => name === "expense_refresh");
  assert.equal(refreshCookie.secure, true);
  assert.equal(refreshCookie.httpOnly, true);
  assert.equal(refreshCookie.sameSite, "lax");
});

test("auth endpoints enforce the configured per-IP rate limit", async () => {
  await authLimiter.resetKey("127.0.0.1");
  let finalResponse;
  for (let attempt = 0; attempt < 21; attempt += 1) {
    finalResponse = await request(app)
      .get("/api/auth/csrf")
      .set("Origin", allowedOrigin);
  }
  assert.equal(finalResponse.status, 429);
  assert.equal(finalResponse.body.message, "Too many authentication requests. Try again later.");
});
