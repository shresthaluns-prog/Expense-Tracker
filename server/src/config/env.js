import "dotenv/config";

const port = Number(process.env.PORT ?? 5000);
const mongodbUri = process.env.MONGODB_URI;
const accessTokenSecret = process.env.ACCESS_TOKEN_SECRET;
const csrfSecret = process.env.CSRF_SECRET;
const clientOrigins = (process.env.CLIENT_ORIGINS ?? "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const refreshCookieSameSite = process.env.REFRESH_COOKIE_SAME_SITE ?? "lax";

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

if (!mongodbUri) {
  throw new Error("MONGODB_URI is required. Copy server/.env.example to server/.env and configure it.");
}

if (clientOrigins.length === 0) {
  throw new Error("CLIENT_ORIGINS must contain at least one allowed origin.");
}

if (!accessTokenSecret || accessTokenSecret.length < 32) {
  throw new Error("ACCESS_TOKEN_SECRET must contain at least 32 characters.");
}

if (!csrfSecret || csrfSecret.length < 32) {
  throw new Error("CSRF_SECRET must contain at least 32 characters.");
}

if (accessTokenSecret === csrfSecret) {
  throw new Error("ACCESS_TOKEN_SECRET and CSRF_SECRET must be different values.");
}

if (!["strict", "lax", "none"].includes(refreshCookieSameSite.toLowerCase())) {
  throw new Error("REFRESH_COOKIE_SAME_SITE must be strict, lax, or none.");
}

if (refreshCookieSameSite.toLowerCase() === "none" && process.env.NODE_ENV !== "production") {
  throw new Error("REFRESH_COOKIE_SAME_SITE=none requires NODE_ENV=production and Secure cookies.");
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port,
  mongodbUri,
  clientOrigins,
  accessTokenSecret,
  csrfSecret,
  accessTokenTtl: "15m",
  refreshTokenTtlMs: 30 * 24 * 60 * 60 * 1000,
  refreshCookieSameSite: refreshCookieSameSite.toLowerCase(),
};
