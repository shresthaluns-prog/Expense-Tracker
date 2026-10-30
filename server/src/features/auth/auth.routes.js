import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { env } from "../../config/env.js";
import RefreshSession from "./refresh-session.model.js";
import User from "./user.model.js";
import Category from "../categories/category.model.js";
import {
  clearAuthCookies,
  csrfTokenFromCookie,
  CSRF_COOKIE_NAME,
  requireKnownOrigin,
  REFRESH_COOKIE_NAME,
  requireCsrf,
  requireTrustedOrigin,
  setCsrfCookie,
  setAuthCookies,
} from "./auth.middleware.js";
import { AuthError, createAuthService } from "./auth.service.js";
import { loginSchema, registerSchema } from "./auth.schemas.js";

const authService = createAuthService({
  UserModel: User,
  RefreshSessionModel: RefreshSession,
  CategoryModel: Category,
  accessTokenSecret: env.accessTokenSecret,
  accessTokenTtl: env.accessTokenTtl,
  refreshTokenTtlMs: env.refreshTokenTtlMs,
});
const authRouter = Router();
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { success: false, message: "Too many authentication requests. Try again later." },
});

authRouter.use(authLimiter);
authRouter.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

authRouter.get("/csrf", requireKnownOrigin, (req, res) => {
  const existingToken = csrfTokenFromCookie(req.cookies?.[CSRF_COOKIE_NAME]);
  res.json({
    success: true,
    csrfToken: existingToken ?? setCsrfCookie(res),
    hasRefreshToken: Boolean(req.cookies?.[REFRESH_COOKIE_NAME]),
  });
});

function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(new AuthError("Request validation failed.", 400));
    }
    req.validatedBody = result.data;
    next();
  };
}

function sendCredentials(res, credentials, statusCode = 200) {
  const csrfToken = setAuthCookies(res, credentials.refreshToken);
  res.status(statusCode).json({
    success: true,
    user: credentials.user,
    accessToken: credentials.accessToken,
    csrfToken,
  });
}

function bearerToken(req) {
  const authorization = req.get("authorization");
  if (!authorization) return null;
  const match = /^Bearer ([^\s]+)$/i.exec(authorization);
  return match?.[1] ?? null;
}

function requireAccessToken(req, res, next) {
  authService
    .authenticateAccessToken(bearerToken(req))
    .then((user) => {
      req.authUser = user;
      next();
    })
    .catch(next);
}

authRouter.post("/register", requireTrustedOrigin, validateBody(registerSchema), async (req, res, next) => {
  try {
    const credentials = await authService.register(req.validatedBody);
    sendCredentials(res, credentials, 201);
  } catch (error) {
    next(error);
  }
});

authRouter.post("/login", requireTrustedOrigin, validateBody(loginSchema), async (req, res, next) => {
  try {
    const credentials = await authService.login(req.validatedBody);
    sendCredentials(res, credentials);
  } catch (error) {
    next(error);
  }
});

authRouter.get("/me", requireAccessToken, (req, res) => {
  res.json({ success: true, user: req.authUser });
});

authRouter.post("/refresh", requireTrustedOrigin, requireCsrf, async (req, res, next) => {
  try {
    const credentials = await authService.refresh(req.cookies?.[REFRESH_COOKIE_NAME]);
    sendCredentials(res, credentials);
  } catch (error) {
    if (error instanceof AuthError && error.statusCode === 401) {
      clearAuthCookies(res);
    }
    next(error);
  }
});

authRouter.post("/logout", requireTrustedOrigin, requireCsrf, async (req, res, next) => {
  try {
    await authService.revokeRefreshToken(req.cookies?.[REFRESH_COOKIE_NAME]);
    clearAuthCookies(res);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

authRouter.post(
  "/logout-all",
  requireTrustedOrigin,
  requireCsrf,
  requireAccessToken,
  async (req, res, next) => {
    try {
      await authService.revokeAllSessions(req.authUser.id);
      clearAuthCookies(res);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  },
);

export default authRouter;
