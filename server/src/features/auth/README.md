# Authentication

## Endpoints

All endpoints are mounted under `/api/auth`:

- `POST /register` — accepts `{ name, email, password }`.
- `POST /login` — accepts `{ email, password }`.
- `GET /me` — requires `Authorization: Bearer <access-token>`.
- `GET /csrf` — bootstraps a CSRF cookie and returns the header token.
- `POST /refresh` — validates CSRF and rotates the refresh session.
- `POST /logout` — validates CSRF and revokes the presented refresh session.
- `POST /logout-all` — validates CSRF and access token, then revokes all of the current user's sessions.

The access JWT is returned in JSON and is held only in client memory. The opaque
refresh token is only set in an HttpOnly cookie; MongoDB stores its SHA-256 hash.
Every refresh consumes the previous token once. Reuse of a revoked/replaced
token revokes the user's remaining sessions. The client shares refresh requests
within a tab and uses the browser Web Locks API to serialize refreshes across
tabs where supported.

CSRF uses a signed, HttpOnly cookie and a matching custom header. The CSRF header
value is returned to the trusted client and held in memory; it is not persisted
in local or session storage. Auth mutations additionally require an exact
configured `Origin`.

## Environment and production

Copy `server/.env.example` to `server/.env`. Generate two independent values
for `ACCESS_TOKEN_SECRET` and `CSRF_SECRET` with:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

In production, use a secret manager, set `NODE_ENV=production`, and use HTTPS.
For a frontend hosted on a different site than the API, set
`REFRESH_COOKIE_SAME_SITE=none`; this setting is rejected outside production.
Add every exact frontend origin to `CLIENT_ORIGINS`. The default rate limiter
uses process memory; multi-instance deployments should configure a shared
rate-limit store.

The Vite development server proxies `/api` to the backend so the local refresh
cookie remains same-site. Override `VITE_API_BASE_URL` when deploying the
frontend separately.

## Tests

From `server/`:

```powershell
npm test
npm run check
```
