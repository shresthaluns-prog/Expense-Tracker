import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { ensureDefaultExpenseCategories } from "../categories/default-categories.js";

const ACCESS_TOKEN_ISSUER = "expense-tracker-api";
const ACCESS_TOKEN_AUDIENCE = "expense-tracker-client";
const BCRYPT_ROUNDS = 12;

export class AuthError extends Error {
  constructor(message, statusCode = 401) {
    super(message);
    this.name = "AuthError";
    this.statusCode = statusCode;
  }
}

export function hashRefreshToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export function verifyAccessToken(token, secret, now = Date.now()) {
  try {
    const payload = jwt.verify(token, secret, {
      algorithms: ["HS256"],
      issuer: ACCESS_TOKEN_ISSUER,
      audience: ACCESS_TOKEN_AUDIENCE,
      clockTimestamp: Math.floor(now / 1000),
    });

    if (
      typeof payload === "string" ||
      payload.tokenUse !== "access" ||
      typeof payload.sub !== "string"
    ) {
      throw new AuthError("Invalid access token.");
    }

    return { userId: payload.sub };
  } catch (error) {
    if (error instanceof AuthError) throw error;
    throw new AuthError("Invalid or expired access token.");
  }
}

function toPublicUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
  };
}

export function createAuthService({
  UserModel,
  RefreshSessionModel,
  CategoryModel,
  accessTokenSecret,
  accessTokenTtl = "15m",
  refreshTokenTtlMs = 30 * 24 * 60 * 60 * 1000,
  now = () => new Date(),
}) {
  function createAccessToken(user) {
    return jwt.sign({ tokenUse: "access" }, accessTokenSecret, {
      algorithm: "HS256",
      subject: user._id.toString(),
      issuer: ACCESS_TOKEN_ISSUER,
      audience: ACCESS_TOKEN_AUDIENCE,
      expiresIn: accessTokenTtl,
    });
  }

  async function createRefreshSession(userId) {
    const token = randomBytes(32).toString("base64url");
    const session = await RefreshSessionModel.create({
      userId,
      tokenHash: hashRefreshToken(token),
      expiresAt: new Date(now().getTime() + refreshTokenTtlMs),
    });
    return { token, session };
  }

  function credentialsFor(user, refreshToken) {
    return {
      user: toPublicUser(user),
      accessToken: createAccessToken(user),
      refreshToken,
    };
  }

  async function register({ name, email, password }) {
    const existing = await UserModel.findOne({ email });
    if (existing) throw new AuthError("An account with this email already exists.", 409);

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    let user;
    try {
      user = await UserModel.create({ name, email, passwordHash });
    } catch (error) {
      if (error?.code === 11000) {
        throw new AuthError("An account with this email already exists.", 409);
      }
      throw error;
    }

    await ensureDefaultExpenseCategories(CategoryModel, user._id);
    const { token } = await createRefreshSession(user._id);
    return credentialsFor(user, token);
  }

  async function login({ email, password }) {
    const user = await UserModel.findOne({ email }).select("+passwordHash");
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new AuthError("Email or password is incorrect.");
    }

    await ensureDefaultExpenseCategories(CategoryModel, user._id);
    const { token } = await createRefreshSession(user._id);
    return credentialsFor(user, token);
  }

  async function authenticateAccessToken(token) {
    if (!token) throw new AuthError("Authentication is required.");
    const { userId } = verifyAccessToken(token, accessTokenSecret, now().getTime());
    const user = await UserModel.findById(userId);
    if (!user) throw new AuthError("Invalid or expired access token.");
    return toPublicUser(user);
  }

  async function refresh(token) {
    if (!token || typeof token !== "string") {
      throw new AuthError("Refresh token is missing or invalid.");
    }

    const tokenHash = hashRefreshToken(token);
    const session = await RefreshSessionModel.findOne({ tokenHash });
    if (!session) throw new AuthError("Refresh token is invalid or expired.");

    const currentTime = now();
    if (session.revokedAt || session.replacedBy) {
      await RefreshSessionModel.updateMany(
        { userId: session.userId, revokedAt: null },
        { $set: { revokedAt: currentTime } },
      );
      throw new AuthError("Refresh token replay detected; all sessions were revoked.");
    }
    if (session.expiresAt <= currentTime) {
      throw new AuthError("Refresh token is invalid or expired.");
    }

    const user = await UserModel.findById(session.userId);
    if (!user) {
      await RefreshSessionModel.updateOne(
        { _id: session._id, revokedAt: null },
        { $set: { revokedAt: currentTime } },
      );
      throw new AuthError("Refresh token is invalid or expired.");
    }

    await ensureDefaultExpenseCategories(CategoryModel, user._id);

    const { token: nextToken, session: nextSession } = await createRefreshSession(user._id);
    let rotated;
    try {
      rotated = await RefreshSessionModel.findOneAndUpdate(
        {
          _id: session._id,
          revokedAt: null,
          expiresAt: { $gt: currentTime },
        },
        { $set: { revokedAt: currentTime, replacedBy: nextSession._id } },
        { returnDocument: "before" },
      );
    } catch (error) {
      await RefreshSessionModel.deleteOne({ _id: nextSession._id });
      throw error;
    }

    if (!rotated) {
      await RefreshSessionModel.deleteOne({ _id: nextSession._id });
      const currentSession = await RefreshSessionModel.findById(session._id);
      if (currentSession?.revokedAt || currentSession?.replacedBy) {
        await RefreshSessionModel.updateMany(
          { userId: session.userId, revokedAt: null },
          { $set: { revokedAt: now() } },
        );
        throw new AuthError("Refresh token replay detected; all sessions were revoked.");
      }
      throw new AuthError("Refresh token is invalid or expired.");
    }

    return credentialsFor(user, nextToken);
  }

  async function revokeRefreshToken(token) {
    if (!token || typeof token !== "string") return;
    await RefreshSessionModel.updateOne(
      { tokenHash: hashRefreshToken(token), revokedAt: null },
      { $set: { revokedAt: now() } },
    );
  }

  async function revokeAllSessions(userId) {
    await RefreshSessionModel.updateMany(
      { userId, revokedAt: null },
      { $set: { revokedAt: now() } },
    );
  }

  return {
    register,
    login,
    authenticateAccessToken,
    refresh,
    revokeRefreshToken,
    revokeAllSessions,
  };
}
