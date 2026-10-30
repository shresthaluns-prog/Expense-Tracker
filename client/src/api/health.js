const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "/api";

export async function fetchHealth() {
  const response = await fetch(`${apiBaseUrl}/health`);
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.message ?? `API health check failed (${response.status}).`);
  }

  return result;
}
