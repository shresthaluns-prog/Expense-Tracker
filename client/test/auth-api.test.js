import { beforeEach, describe, expect, it, vi } from "vitest";

function jsonResponse(body, status = 200) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  };
}

describe("auth API token handling", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("keeps access tokens in memory and sends credentials with API requests", async () => {
    const fetchMock = globalThis.fetch;
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          user: { id: "user-1", name: "Test User" },
          accessToken: "memory-only-access-token",
          csrfToken: "csrf-value",
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ success: true, data: [] }));

    const authApi = await import("../src/features/auth/authApi.js");
    await authApi.login({ email: "person@example.com", password: "long-password" });
    const response = await authApi.authenticatedFetch("/api/categories");

    expect(response.ok).toBe(true);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/auth/login",
      expect.objectContaining({ credentials: "include" }),
    );
    const apiOptions = fetchMock.mock.calls[1][1];
    expect(apiOptions.credentials).toBe("include");
    expect(apiOptions.headers.get("Authorization")).toBe("Bearer memory-only-access-token");
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it("refreshes a stale CSRF token once before retrying logout", async () => {
    const fetchMock = globalThis.fetch;
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ message: "CSRF validation failed." }, 403),
      )
      .mockResolvedValueOnce(
        jsonResponse({ csrfToken: "current-csrf-token", hasRefreshToken: true }),
      )
      .mockResolvedValueOnce(jsonResponse(null, 204));

    const authApi = await import("../src/features/auth/authApi.js");
    await expect(authApi.logout()).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toBe("/api/auth/csrf");
    expect(fetchMock.mock.calls[1][1].credentials).toBe("include");
    expect(fetchMock.mock.calls[2][1].headers.get("X-CSRF-Token")).toBe("current-csrf-token");
  });
});
