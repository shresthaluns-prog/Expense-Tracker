import { authenticatedFetch } from "../features/auth/authApi.js";

export async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers);
  const request = { ...options, headers };
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
    request.body = JSON.stringify(options.body);
  }

  const response = await authenticatedFetch(path, request);
  if (response.status === 204) return null;

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.message ?? `Request failed (${response.status}).`);
    error.status = response.status;
    error.issues = result.issues ?? [];
    throw error;
  }
  return result;
}

export function queryString(values) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}
