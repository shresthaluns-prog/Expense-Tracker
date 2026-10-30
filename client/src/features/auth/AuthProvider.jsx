import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  authenticatedFetch,
  login as loginRequest,
  logout as logoutRequest,
  logoutEverywhere as logoutEverywhereRequest,
  refreshAuthentication,
  register as registerRequest,
} from "./authApi.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let active = true;
    refreshAuthentication()
      .then((currentUser) => {
        if (active) setUser(currentUser);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setStatus("ready");
      });

    return () => {
      active = false;
    };
  }, []);

  const authenticate = useCallback(async (request, credentials) => {
    const authenticatedUser = await request(credentials);
    setUser(authenticatedUser);
    setStatus("ready");
  }, []);

  const login = useCallback(
    (credentials) => authenticate(loginRequest, credentials),
    [authenticate],
  );
  const register = useCallback(
    (credentials) => authenticate(registerRequest, credentials),
    [authenticate],
  );

  const logout = useCallback(async () => {
    await logoutRequest();
    setUser(null);
    setStatus("ready");
  }, []);

  const logoutEverywhere = useCallback(async () => {
    await logoutEverywhereRequest();
    setUser(null);
    setStatus("ready");
  }, []);

  const value = useMemo(
    () => ({ user, status, login, register, logout, logoutEverywhere, authenticatedFetch }),
    [user, status, login, register, logout, logoutEverywhere],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider.");
  return context;
}
