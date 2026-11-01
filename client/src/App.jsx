import { lazy, Suspense, useState } from "react";
import { Link, Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./features/auth/AuthProvider.jsx";
import AuthPage from "./features/auth/AuthPage.jsx";
import BudgetsPage from "./features/budgets/BudgetsPage.jsx";
import CategoriesPage from "./features/categories/CategoriesPage.jsx";
import TransactionsPage from "./features/expenses/TransactionsPage.jsx";
import SettingsPage from "./features/settings/SettingsPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import WorkspaceSnapshot from "./components/WorkspaceSnapshot.jsx";

const ReportsPage = lazy(() => import("./features/reports/ReportsPage.jsx"));

const navigation = [
  { to: "/", label: "Overview", icon: "home", end: true },
  { to: "/transactions", label: "Transactions", icon: "swap" },
  { to: "/budgets", label: "Budgets", icon: "wallet" },
  { to: "/reports", label: "Reports", icon: "chart" },
  { to: "/categories", label: "Categories", icon: "tag" },
  { to: "/settings", label: "Settings", icon: "settings" },
];

const titles = {
  "/": "Overview",
  "/transactions": "Transactions",
  "/budgets": "Budgets",
  "/reports": "Reports",
  "/categories": "Categories",
  "/settings": "Settings",
  "/auth": "Sign in",
};

function App() {
  const { user, status, logout, logoutEverywhere } = useAuth();
  const [logoutError, setLogoutError] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  async function handleLogout(logoutAction) {
    setLogoutError("");
    try {
      await logoutAction();
    } catch (error) {
      setLogoutError(error.message);
    }
  }

  if (status === "loading") {
    return <main className="session-loading">Restoring your session…</main>;
  }

  if (!user) {
    return (
      <div className="auth-canvas">
        <div className="auth-brand">
          <BrandMark />
          <span>FinEdge</span>
        </div>
        <main className="auth-content">
          <Routes>
            <Route element={<AuthPage />} path="/auth" />
            <Route element={<Navigate replace to="/auth" />} path="*" />
          </Routes>
        </main>
      </div>
    );
  }

  return (
    <div className="app-canvas">
      <div className="app-frame">
        {mobileMenuOpen && (
          <button
            aria-label="Close navigation menu"
            className="sidebar-backdrop"
            onClick={() => setMobileMenuOpen(false)}
            type="button"
          />
        )}
        <aside aria-label="Sidebar" className={`app-sidebar ${mobileMenuOpen ? "is-open" : ""}`}>
          <div className="sidebar-brand">
            <BrandMark />
            <span>FinEdge</span>
            <button
              aria-label="Close navigation"
              className="mobile-menu-close"
              onClick={() => setMobileMenuOpen(false)}
              type="button"
            >
              ×
            </button>
          </div>

          <nav aria-label="Main navigation" className="sidebar-navigation">
            {navigation.map((item) => (
              <NavLink
                className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}
                end={item.end}
                key={item.to}
                onClick={() => setMobileMenuOpen(false)}
                to={item.to}
              >
                <NavIcon name={item.icon} />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="sidebar-spacer" />
          <section aria-label="Account" className="sidebar-account">
            <span aria-hidden="true" className="account-avatar">{user.name?.slice(0, 1).toUpperCase() ?? "U"}</span>
            <span className="account-details">
              <strong>{user.name}</strong>
              <small>Personal account</small>
            </span>
            <button
              aria-label="Sign out"
              className="account-logout"
              onClick={() => void handleLogout(logout)}
              title="Sign out"
              type="button"
            >
              <NavIcon name="logout" />
            </button>
          </section>
          <div className="sidebar-session-actions">
            <button onClick={() => void handleLogout(logoutEverywhere)} type="button">Sign out all devices</button>
          </div>
        </aside>

        <div className="app-main-column">
          <header className="app-topbar">
            <button
              aria-expanded={mobileMenuOpen}
              aria-label="Open navigation"
              className="mobile-menu-toggle"
              onClick={() => setMobileMenuOpen((open) => !open)}
              type="button"
            >
              <NavIcon name="menu" />
            </button>
            <div className="topbar-title">
              <h1>{titles[location.pathname] ?? "Expense Tracker"}</h1>
              <p>{location.pathname === "/" ? `Welcome back, ${user.name}. Here’s your financial overview.` : "Manage your personal finances."}</p>
            </div>
            <div className="topbar-actions">
              <Link aria-label={`Account settings for ${user.name}`} className="topbar-profile" to="/settings">
                <span aria-hidden="true" className="account-avatar">{user.name?.slice(0, 1).toUpperCase() ?? "U"}</span>
                <span className="topbar-profile-name">{user.name}</span>
              </Link>
            </div>
          </header>

          <main className="app-content">
            {logoutError && <p className="app-notice" role="alert">{logoutError}</p>}
            {location.pathname !== "/" && location.pathname !== "/settings" && location.pathname !== "/categories" && (
              <WorkspaceSnapshot
                compact={location.pathname === "/transactions" || location.pathname === "/budgets"}
                report={location.pathname === "/reports"}
              />
            )}
            <Routes>
              <Route element={<DashboardPage />} path="/" />
              <Route element={<TransactionsPage />} path="/transactions" />
              <Route element={<BudgetsPage />} path="/budgets" />
              <Route
                element={
                  <Suspense fallback={<p className="page-loading">Loading reports…</p>}>
                    <ReportsPage />
                  </Suspense>
                }
                path="/reports"
              />
              <Route element={<CategoriesPage />} path="/categories" />
              <Route element={<SettingsPage />} path="/settings" />
              <Route element={<Navigate replace to="/" />} path="/auth" />
              <Route
                element={
                  <section className="ui-panel">
                    <h2 className="text-xl font-semibold">Page not found</h2>
                    <p className="mt-2 text-sm text-slate-500">The page you requested does not exist.</p>
                  </section>
                }
                path="*"
              />
            </Routes>
          </main>
        </div>
      </div>
    </div>
  );
}

function BrandMark() {
  return (
    <span aria-hidden="true" className="brand-mark">
      <svg fill="none" viewBox="0 0 32 32">
        <path d="M7 8.5c0-2.2 1.8-4 4-4h14v5H12a1 1 0 0 0-1 1v2h10v5H11v8H6v-8a5 5 0 0 1 5-5h10v-3H11a4 4 0 0 1-4-4Z" fill="currentColor" />
        <path d="M6 22.5a4 4 0 1 0 8 0 4 4 0 0 0-8 0Z" fill="currentColor" />
      </svg>
    </span>
  );
}

function NavIcon({ name }) {
  const paths = {
    home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-6h6v6" /></>,
    swap: <><path d="M4 7h15l-4-4" /><path d="M20 17H5l4 4" /><path d="M19 7v4M5 17v-4" /></>,
    wallet: <><rect x="3" y="5" width="18" height="15" rx="3" /><path d="M3 9h18M16 14h2" /></>,
    chart: <><path d="M4 19V5M4 19h17" /><path d="m7 15 4-5 3 2 5-7" /></>,
    tag: <><path d="M20 13 13 20 4 11V4h7l9 9Z" /><circle cx="8" cy="8" r="1" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.8-.6a8 8 0 0 1-1.8 1l-.4 1.9h-2.8l-.4-1.9a8 8 0 0 1-1.8-1l-1.8.6-1.4-2.4L6.9 15a8 8 0 0 1 0-2l-1.6-1.1 1.4-2.4 1.8.6a8 8 0 0 1 1.8-1l.4-1.9h2.8l.4 1.9a8 8 0 0 1 1.8 1l1.8-.6 1.4 2.4-1.6 1.1a8 8 0 0 1 .1 2Z" /></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  };
  return (
    <svg aria-hidden="true" className="nav-icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24">
      {paths[name]}
    </svg>
  );
}

export default App;
