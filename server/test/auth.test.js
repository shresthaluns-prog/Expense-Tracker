import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import { createAuthService, hashRefreshToken, verifyAccessToken } from "../src/features/auth/auth.service.js";
import { loginSchema, registerSchema } from "../src/features/auth/auth.schemas.js";
import {
  createCsrfToken,
  csrfTokenFromCookie,
  isValidCsrfToken,
} from "../src/features/auth/auth.middleware.js";

const accessTokenSecret = "unit-test-access-token-secret-32-characters";
const refreshTokenTtlMs = 60_000;

function createTestModels() {
  const users = new Map();
  const sessions = new Map();
  let nextUserId = 1;
  let nextSessionId = 1;

  const UserModel = {
    findOne({ email }) {
      const user = [...users.values()].find((entry) => entry.email === email) ?? null;
      return {
        select: async () => user,
        then: (resolve, reject) => Promise.resolve(user).then(resolve, reject),
      };
    },
    async create(values) {
      const user = {
        _id: String(nextUserId++),
        ...values,
        createdAt: new Date(),
      };
      users.set(user._id, user);
      return user;
    },
    async findById(id) {
      return users.get(String(id)) ?? null;
    },
  };

  const RefreshSessionModel = {
    async create(values) {
      const session = { _id: String(nextSessionId++), ...values, revokedAt: null, replacedBy: null };
      sessions.set(session._id, session);
      return session;
    },
    async findOne({ tokenHash }) {
      return [...sessions.values()].find((session) => session.tokenHash === tokenHash) ?? null;
    },
    async findById(id) {
      return sessions.get(String(id)) ?? null;
    },
    async findOneAndUpdate(filter, update) {
      const session = sessions.get(String(filter._id));
      if (
        !session ||
        session.revokedAt ||
        session.expiresAt <= filter.expiresAt.$gt
      ) {
        return null;
      }
      Object.assign(session, update.$set);
      return session;
    },
    async updateOne(filter, update) {
      const session = [...sessions.values()].find(
        (item) => item.tokenHash === filter.tokenHash && !item.revokedAt,
      );
      if (session) Object.assign(session, update.$set);
    },
    async updateMany(filter, update) {
      for (const session of sessions.values()) {
        if (String(session.userId) === String(filter.userId) && !session.revokedAt) {
          Object.assign(session, update.$set);
        }
      }
    },
    async deleteOne({ _id }) {
      sessions.delete(String(_id));
    },
  };

  return { UserModel, RefreshSessionModel, users, sessions };
}

function makeService(overrides = {}) {
  const models = createTestModels();
  const time = { value: new Date("2026-01-01T00:00:00.000Z") };
  const service = createAuthService({
    ...models,
    accessTokenSecret,
    refreshTokenTtlMs,
    now: () => new Date(time.value),
    ...overrides,
  });
  return { ...models, service, time };
}

const firstUserInput = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  password: "CorrectHorse1!",
};

test("CSRF bootstrap tokens verify signed cookies without rotating a valid token", () => {
  const { token, cookieValue } = createCsrfToken();
  assert.equal(csrfTokenFromCookie(cookieValue), token);
  assert.equal(isValidCsrfToken(cookieValue, token), true);
  assert.equal(csrfTokenFromCookie(`${token}.invalid`), null);
  assert.equal(isValidCsrfToken(cookieValue, "different-token"), false);
  assert.equal(csrfTokenFromCookie(undefined), null);
});

test("registration and login create valid access and refresh credentials", async () => {
  const { service, sessions } = makeService();
  const registered = await service.register(firstUserInput);

  assert.equal(registered.user.email, "ada@example.com");
  assert.ok(registered.accessToken);
  assert.ok(registered.refreshToken);
  assert.ok(!("passwordHash" in registered.user));
  assert.equal(sessions.size, 1);
  assert.equal([...sessions.values()][0].tokenHash, hashRefreshToken(registered.refreshToken));

  const login = await service.login({ email: firstUserInput.email, password: firstUserInput.password });
  assert.equal(login.user.id, registered.user.id);
  assert.notEqual(login.refreshToken, registered.refreshToken);
});

test("invalid passwords and invalid access tokens are rejected", async () => {
  const { service } = makeService();
  await service.register(firstUserInput);
  await assert.rejects(
    service.login({ email: firstUserInput.email, password: "wrong password" }),
    { statusCode: 401 },
  );
  await assert.rejects(service.authenticateAccessToken("not-a-jwt"), { statusCode: 401 });
  await assert.rejects(service.refresh("not-a-refresh-token"), { statusCode: 401 });
});

test("Zod auth schemas normalize email, enforce new-password rules and reject client-supplied IDs", () => {
  const parsed = registerSchema.safeParse({
    name: " Ada ",
    email: " ADA@example.com ",
    password: "Aa1!bcde",
  });
  assert.equal(parsed.success, true);
  assert.equal(parsed.data.email, "ada@example.com");
  assert.equal(registerSchema.safeParse({ ...parsed.data, userId: "another-user" }).success, false);
  for (const password of ["short", "lowercase1!", "UPPERCASE1!", "NoNumber!!", "NoSpecial1", "White Space1!"]) {
    assert.equal(registerSchema.safeParse({ ...parsed.data, password }).success, false, password);
  }
  assert.equal(registerSchema.safeParse({ ...parsed.data, password: "Aa1!bcde" }).success, true);
  assert.equal(loginSchema.safeParse({ email: "ada@example.com", password: "ok" }).success, true);
  assert.equal(
    loginSchema.safeParse({ email: "ada@example.com", password: "x".repeat(73) }).success,
    false,
  );
});

test("expired access and refresh tokens are rejected", async () => {
  const { service, RefreshSessionModel, time } = makeService();
  const expiredAccess = jwt.sign(
    { tokenUse: "access" },
    accessTokenSecret,
    {
      algorithm: "HS256",
      subject: "1",
      issuer: "expense-tracker-api",
      audience: "expense-tracker-client",
      expiresIn: -1,
    },
  );
  assert.throws(() => verifyAccessToken(expiredAccess, accessTokenSecret), { statusCode: 401 });

  const credentials = await service.register(firstUserInput);
  const session = await RefreshSessionModel.findOne({
    tokenHash: hashRefreshToken(credentials.refreshToken),
  });
  session.expiresAt = new Date(time.value.getTime() - 1);
  time.value = new Date(time.value.getTime() + refreshTokenTtlMs + 1);
  await assert.rejects(service.refresh(credentials.refreshToken), { statusCode: 401 });
});

test("revoked refresh sessions cannot be used", async () => {
  const { service, RefreshSessionModel } = makeService();
  const credentials = await service.register(firstUserInput);
  const session = await RefreshSessionModel.findOne({
    tokenHash: hashRefreshToken(credentials.refreshToken),
  });
  session.revokedAt = new Date();
  await assert.rejects(service.refresh(credentials.refreshToken), /replay detected/);
});

test("refresh rotation rejects replay and revokes remaining sessions for only that user", async () => {
  const { service, RefreshSessionModel, sessions } = makeService();
  const firstLogin = await service.register(firstUserInput);
  const secondLogin = await service.login({ email: firstUserInput.email, password: firstUserInput.password });
  const otherUser = await service.register({
    name: "Grace Hopper",
    email: "grace@example.com",
    password: "AnotherStrong1!",
  });
  const rotated = await service.refresh(firstLogin.refreshToken);

  assert.notEqual(rotated.refreshToken, firstLogin.refreshToken);
  await assert.rejects(service.refresh(firstLogin.refreshToken), /replay detected/);

  const activeForUser = [...sessions.values()].filter(
    (session) => String(session.userId) === firstLogin.user.id && session.revokedAt === null,
  );
  assert.equal(activeForUser.length, 0);
  await assert.rejects(service.refresh(secondLogin.refreshToken), { statusCode: 401 });
  const otherUserRefresh = await service.refresh(otherUser.refreshToken);
  assert.equal(otherUserRefresh.user.id, otherUser.user.id);
  assert.equal(typeof RefreshSessionModel.updateMany, "function");
});

test("access token identity cannot be changed by a client-supplied user id", async () => {
  const { service } = makeService();
  const first = await service.register(firstUserInput);
  const second = await service.register({
    name: "Grace Hopper",
    email: "grace@example.com",
    password: "AnotherStrong1!",
  });

  const currentUser = await service.authenticateAccessToken(first.accessToken);
  assert.equal(currentUser.id, first.user.id);
  assert.notEqual(currentUser.id, second.user.id);
  assert.equal(Object.hasOwn(currentUser, "userId"), false);
});

test("logout revokes the refresh session and logout-all revokes every user session", async () => {
  const { service, sessions } = makeService();
  const credentials = await service.register(firstUserInput);
  const secondSession = await service.login({ email: firstUserInput.email, password: firstUserInput.password });

  await service.revokeRefreshToken(credentials.refreshToken);
  await assert.rejects(service.refresh(credentials.refreshToken), /replay detected/);
  await service.revokeAllSessions(credentials.user.id);
  assert.ok(
    [...sessions.values()]
      .filter((session) => String(session.userId) === credentials.user.id)
      .every((session) => session.revokedAt instanceof Date),
  );
  await assert.rejects(service.refresh(secondSession.refreshToken), { statusCode: 401 });
});
