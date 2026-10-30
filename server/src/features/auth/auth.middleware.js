import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "../../config/env.js";
import { AuthError } from "./auth.service.js";

export const REFRESH_COOKIE_NAME = "expense_refresh";
export const CSRF_COOKIE_NAME = "expense_csrf";
const CSRF_HEADER_NAME = "x-csrf-token";

function signatureFor(token) {
  return createHmac("sha256", env.csrfSecret).update(token).digest("hex");
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function createCsrfToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, cookieValue: `${token}.${signatureFor(token)}` };
}

export function isValidCsrfToken(cookieValue, headerValue) {
  if (typeof cookieValue !== "string" || typeof headerValue !== "string") return false;
  const separator = cookieValue.lastIndexOf(".");
  if (separator <= 0) return false;

  const token = cookieValue.slice(0, separator);
  const signature = cookieValue.slice(separator + 1);
  return safeEqual(token, headerValue) && safeEqual(signature, signatureFor(token));
}

export function csrfTokenFromCookie(cookieValue) {
  if (typeof cookieValue !== "string") return null;
  const separator = cookieValue.lastIndexOf(".");
  if (separator <= 0) return null;

  const token = cookieValue.slice(0, separator);
  const signature = cookieValue.slice(separator + 1);
  return safeEqual(signature, signatureFor(token)) ? token : null;
}

export function requireTrustedOrigin(req, res, next) {
  const origin = req.get("origin");
  if (!origin || !env.clientOrigins.includes(origin)) {
    return next(new AuthError("Request origin is not allowed.", 403));
  }
  next();
}

export function requireKnownOrigin(req, res, next) {
  const origin = req.get("origin");
  if (origin && !env.clientOrigins.includes(origin)) {
    return next(new AuthError("Request origin is not allowed.", 403));
  }
  next();
}

export function requireCsrf(req, res, next) {
  if (!isValidCsrfToken(req.cookies?.[CSRF_COOKIE_NAME], req.get(CSRF_HEADER_NAME))) {
    return next(new AuthError("CSRF validation failed.", 403));
  }
  next();
}

function commonCookieOptions() {
  return {
    secure: env.nodeEnv === "production",
    sameSite: env.refreshCookieSameSite,
    maxAge: env.refreshTokenTtlMs,
  };
}

export function setAuthCookies(res, refreshToken) {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    ...commonCookieOptions(),
    httpOnly: true,
    path: "/api/auth",
  });
  return setCsrfCookie(res);
}

export function setCsrfCookie(res) {
  const { token, cookieValue } = createCsrfToken();
  res.cookie(CSRF_COOKIE_NAME, cookieValue, {
    ...commonCookieOptions(),
    httpOnly: true,
    path: "/api/auth",
  });
  return token;
}

export function clearAuthCookies(res) {
  const options = {
    secure: env.nodeEnv === "production",
    sameSite: env.refreshCookieSameSite,
  };
  res.clearCookie(REFRESH_COOKIE_NAME, { ...options, httpOnly: true, path: "/api/auth" });
  res.clearCookie(CSRF_COOKIE_NAME, { ...options, httpOnly: true, path: "/api/auth" });
}
