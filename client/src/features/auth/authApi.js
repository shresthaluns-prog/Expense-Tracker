const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "/api";
let accessToken = null;
let csrfToken = null;
let refreshInFlight = null;

async function readResponse(response) {
  if (response.status === 204) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.message ?? `Request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return body;
}

async function authRequest(path, options = {}) {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (csrfToken) headers.set("X-CSRF-Token", csrfToken);

  const response = await fetch(`${apiBaseUrl}/auth${path}`, {
    ...options,
    headers,
    credentials: "include",
  });
  return readResponse(response);
}

async function refreshCsrfToken() {
  const response = await fetch(`${apiBaseUrl}/auth/csrf`, {
    credentials: "include",
  });
  const result = await readResponse(response);
  csrfToken = result.csrfToken;
  return result;
}

function applyCredentials(credentials) {
  accessToken = credentials.accessToken;
  csrfToken = credentials.csrfToken;
  return credentials.user;
}

async function refreshRequest() {
  const csrfResult = await refreshCsrfToken();
  if (!csrfResult.hasRefreshToken) {
    throw new Error("No refresh session is available.");
  }
  const response = await authRequest("/refresh", { method: "POST" });
  return applyCredentials(response);
}

export async function refreshAuthentication() {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const run = refreshRequest;
    if (globalThis.navigator?.locks) {
      return navigator.locks.request("expense-tracker-refresh", run);
    }
    return run();
  })().catch((error) => {
    accessToken = null;
    csrfToken = null;
    throw error;
  }).finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

export async function register(credentials) {
  const result = await authRequest("/register", {
    method: "POST",
    body: JSON.stringify(credentials),
  });
  return applyCredentials(result);
}

export async function login(credentials) {
  const result = await authRequest("/login", {
    method: "POST",
    body: JSON.stringify(credentials),
  });
  return applyCredentials(result);
}

export async function logout() {
  try {
    await authRequest("/logout", { method: "POST" });
  } catch (error) {
    if (error.status !== 403 || error.message !== "CSRF validation failed.") throw error;
    await refreshCsrfToken();
    await authRequest("/logout", { method: "POST" });
  }
  accessToken = null;
  csrfToken = null;
}

export async function logoutEverywhere() {
  let response = await authenticatedFetch("/auth/logout-all", { method: "POST" });
  if (response.status === 403) {
    const body = await response.clone().json().catch(() => ({}));
    if (body.message === "CSRF validation failed.") {
      await refreshCsrfToken();
      response = await authenticatedFetch("/auth/logout-all", { method: "POST" });
    }
  }
  if (!response.ok) await readResponse(response);
  accessToken = null;
  csrfToken = null;
}

export async function authenticatedFetch(path, options = {}) {
  const requestWithToken = (token) => {
    const headers = new Headers(options.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (!["GET", "HEAD", "OPTIONS"].includes((options.method ?? "GET").toUpperCase())) {
      if (csrfToken) headers.set("X-CSRF-Token", csrfToken);
    }
    return fetch(`${apiBaseUrl}${path}`, {
      ...options,
      headers,
      credentials: "include",
    });
  };

  let tokenUsed = accessToken;
  let response = await requestWithToken(tokenUsed);
  if (response.status !== 401) return response;

  if (accessToken === tokenUsed) {
    try {
      await refreshAuthentication();
    } catch {
      return response;
    }
  }

  tokenUsed = accessToken;
  response = await requestWithToken(tokenUsed);
  return response;
}
