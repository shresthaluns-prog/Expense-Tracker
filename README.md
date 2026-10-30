# Expense Tracker

A multi-user expense tracker with a React/Vite client and an Express/Mongoose API. Financial documents are scoped to a verified user ID. Monetary values are stored as safe integer minor units (for example, `1234` means USD 12.34); currency values are not combined.

## Requirements

- Node.js 20.19+ or 22.12+
- npm
- MongoDB for local development

The backend tests use `mongodb-memory-server` and a temporary, isolated database. Its first run may download a MongoDB binary.

## Project layout

- `client/` — React, Vite, Tailwind CSS, React Router, TanStack Query, React Hook Form, Zod, and Recharts
- `server/` — Express ES modules, Mongoose models, validation, authentication, and feature routes
- `server/src/features/` — auth, categories, transactions, budgets, and reports

## Local setup

Install dependencies from the project root:

```powershell
npm --prefix server ci
npm --prefix client ci
```

Create the backend environment file:

```powershell
Copy-Item server\.env.example server\.env
```

Edit `server/.env` and set `MONGODB_URI` to a reachable MongoDB database. Replace both example secrets with distinct random values of at least 32 characters. For example, generate a secret with:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Generate one value for `ACCESS_TOKEN_SECRET` and a different value for `CSRF_SECRET`. Do not commit `.env` files.

Create the client environment file:

```powershell
Copy-Item client\.env.example client\.env
```

The default client uses `/api`; Vite proxies it to `http://127.0.0.1:5000`. `CLIENT_ORIGINS` must include the exact browser origin, including scheme and port (the example allows `http://localhost:5173` and `http://127.0.0.1:5173`).

Start MongoDB, then run each application in its own terminal:

```powershell
Set-Location server
npm run dev
```

```powershell
Set-Location client
npm run dev
```

Open the Vite URL printed in the client terminal. Confirm API and database connectivity at `http://127.0.0.1:5000/api/health`; a healthy response is `200` with `"database":"connected"`.

## Environment variables

| Variable | Required | Purpose |
|---|---:|---|
| `NODE_ENV` | No | Runtime mode. Production enables `Secure` auth cookies. |
| `PORT` | No | API port; defaults to `5000`. |
| `MONGODB_URI` | Yes | MongoDB connection string for the API. |
| `CLIENT_ORIGINS` | No | Comma-separated exact browser origins allowed by CORS; defaults to `http://localhost:5173`. |
| `ACCESS_TOKEN_SECRET` | Yes | Secret used to sign short-lived access JWTs; at least 32 characters. |
| `CSRF_SECRET` | Yes | Separate HMAC secret for CSRF cookies; at least 32 characters. |
| `REFRESH_COOKIE_SAME_SITE` | No | `strict`, `lax` (default), or `none`; `none` is production-only and requires Secure cookies. |
| `VITE_API_BASE_URL` | No | Client API prefix; defaults to `/api`. |

Never put server secrets in a `VITE_*` variable. The client keeps access tokens in memory; refresh tokens are stored in HttpOnly cookies.

## Commands

Run from the project root:

```powershell
npm --prefix server run dev
npm --prefix server start
npm --prefix server test
npm --prefix server run test:unit
npm --prefix server run check
npm --prefix client run dev
npm --prefix client test
npm --prefix client run build
npm --prefix client run preview
```

`server npm test` starts a temporary MongoDB instance, sets `NODE_ENV=test` and a dedicated `expense_tracker_test` database for the test process, runs all backend tests serially, and stops the temporary instance. It does not use the development database configured in `server/.env`.

The backend suite includes Supertest API integration tests and existing model/service tests. The client suite uses Vitest, jsdom, and React Testing Library. Tests cover authentication and refresh rotation, logout and session revocation, rate limiting, CORS and cookie attributes, CRUD, invalid input/IDs, pagination and date boundaries, budget calculations, analytics, cross-user access, frontend validation, protected routes, and memory-only token handling.

New users receive Food, Rent, Entertainment, Education, and Miscellaneous as expense categories. Existing users receive any missing defaults at login; to seed every account in the configured database immediately, run `npm --prefix server run seed:categories`. The seed operation is idempotent and preserves existing categories and income categories.

New registration passwords must contain at least eight characters with uppercase, lowercase, a number, a special character, and no whitespace. Existing passwords are still accepted by the login endpoint. The default currency for new transactions, budgets, and display preferences is NPR, shown with the `Rs.` prefix; financial records keep their own currency and are never converted.

## API overview

All endpoints are under `/api`. JSON API responses generally use `{ "success": true, ... }`; validation errors return `400`, unauthenticated requests return `401`, and non-owned or missing records return `404`.

### Health

- `GET /api/health` — reports API and MongoDB availability.

### Authentication

- `POST /api/auth/register` — JSON `{ "name", "email", "password" }`; creates a user, issues a short-lived access token, and sets refresh/CSRF cookies.
- `POST /api/auth/login` — JSON `{ "email", "password" }`; returns the same credential shape.
- `GET /api/auth/me` — requires `Authorization: Bearer <accessToken>`.
- `GET /api/auth/csrf` — bootstraps the CSRF cookie/token; reuses a valid signed cookie.
- `POST /api/auth/refresh` — rotates the HttpOnly refresh cookie; requires the allowed `Origin` and `X-CSRF-Token`.
- `POST /api/auth/logout` — revokes the current refresh session and clears cookies; requires the allowed `Origin` and CSRF header.
- `POST /api/auth/logout-all` — revokes all refresh sessions for the authenticated user; also requires CSRF.

Refresh tokens rotate on use and only their hashes are stored. Reuse of a revoked/replaced refresh token is treated as replay and revokes that user’s remaining sessions. Authentication endpoints are limited to 20 requests per IP per 15 minutes.

### Categories

- `GET /api/categories` — optional `type`, `search`, `includeArchived`, `page`, and `limit`.
- `POST /api/categories` — `{ "name", "type": "income" | "expense", "color"? }`.
- `GET /api/categories/:id`
- `PATCH /api/categories/:id` — update name, type, or color.
- `DELETE /api/categories/:id` — archives the category so historical transactions retain their label.

All category routes require a bearer access token. Category names are unique per user and type.

### Transactions

- `GET /api/transactions` — optional `type`, `categoryId`, `startDate`, `endDate`, `search`, `page`, and `limit` (maximum 100). Date-only end dates are inclusive.
- `POST /api/transactions` — `{ "categoryId", "type", "amountMinor", "currency"?, "date"?, "note"?, "paymentMethod"? }`.
- `GET /api/transactions/:id`
- `PATCH /api/transactions/:id`
- `DELETE /api/transactions/:id`

Transaction types must match an active category owned by the authenticated user. Accepted payment methods are `cash`, `card`, `bank_transfer`, `mobile_wallet`, and `other`. Do not send an owner/user ID: ownership is derived from the verified access token.

### Budgets

- `GET /api/budgets` — optional `periodType`, `scope`, `categoryId`, `page`, and `limit`.
- `POST /api/budgets` — `{ "amountMinor", "periodType", "startDate", "categoryId"?, "currency"?, "endDate"? }`.
- `GET /api/budgets/:id`
- `PATCH /api/budgets/:id`
- `DELETE /api/budgets/:id`

`periodType` is `weekly`, `monthly`, or `custom`. Custom dates are UTC date-only values in `YYYY-MM-DD`; the start is inclusive and the end is exclusive. Weekly/monthly periods are normalized to UTC. Spending is aggregated from the owner’s expense transactions, not stored as a mutable running total.

### Reports and analytics

- `GET /api/reports` — optional `startDate` and `endDate` (both required together), `timezone` (IANA; default `UTC`), and `currency`.

Date ranges are inclusive in the requested timezone, limited to 366 days. The result includes period, summary, totals, monthly series, trends, category totals, payment totals, and budget progress. Empty months are represented in chart series; currencies remain separate.

## Troubleshooting

- **MongoDB connection fails:** verify MongoDB is running and `MONGODB_URI` points to the right host, port, and database. Check `/api/health`.
- **Browser reports a CORS error:** add the exact frontend origin (including `http://` and port) to `CLIENT_ORIGINS`, then restart the API.
- **Auth requests return 403:** send an allowed `Origin`; refresh/logout also require the CSRF header matching the signed CSRF cookie. Call `/api/auth/csrf` to retrieve a current token.
- **Production login/refresh cookies are missing:** production cookies require HTTPS because they are `Secure`; verify the TLS-terminating deployment forwards requests correctly. `SameSite=None` also requires production mode.
- **Auth returns 429:** wait for the 15-minute window to reset or reduce repeated requests; the limit is per client IP.
- **Backend tests cannot start MongoDB:** the first `mongodb-memory-server` run downloads a MongoDB binary. Check network access and available disk space, or configure the package’s documented binary cache before rerunning tests.
- **Vite cannot reach the API:** ensure the API is listening on port `5000`, or set `VITE_API_BASE_URL` to the intended API prefix.

## Test report and known limits

The current verified run passed 32 backend tests, 11 client tests, backend syntax checks, and the Vite production build. The automated suite exercises the application against an ephemeral MongoDB database and tests the UI in jsdom. Production `Secure` cookie behavior is verified through the production cookie configuration in a separate Node process; deployment behind a real TLS proxy, browser-based cross-tab refresh races, and end-to-end accessibility/visual behavior are not exercised by these automated tests.

The Express rate limiter uses its default in-memory store; deployments with multiple API instances should configure a shared store so the per-IP limit applies across instances. No production deployment manifest or CI workflow is included.
