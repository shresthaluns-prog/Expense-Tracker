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
import { Modal, secondaryButtonClass } from "./components/ui.jsx";

const ReportsPage = lazy(() => import("./features/reports/ReportsPage.jsx"));

const navigation = [
  { to: "/", label: "Overview", icon: "home", end: true },
  { to: "/transactions", label: "Transactions", icon: "swap" },
  { to: "/budgets", label: "Budgets", icon: "wallet" },
  { to: "/reports", label: "Reports", icon: "chart" },
  { to: "/categories", label: "Categories", icon: "tag" },
  { to: "/settings", label: "Settings", icon: "settings" },
];

function App() {
  const { user, status, logout, logoutEverywhere } = useAuth();
  const [logoutError, setLogoutError] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [confirmSidebarSignOut, setConfirmSidebarSignOut] = useState(false);
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
          <span>Pockii</span>
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
            <span>Pockii</span>
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
              onClick={() => setConfirmSidebarSignOut(true)}
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
            <p className="topbar-brand-slogan">Small Steps. Smarter Money.</p>
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
      {confirmSidebarSignOut && (
        <Modal
          description="You will need to sign in again to access your account."
          onClose={() => setConfirmSidebarSignOut(false)}
          title="Sign out?"
        >
          <div className="flex justify-end gap-2">
            <button className={`${secondaryButtonClass} signout-confirm-button h-10 w-28 justify-center`} onClick={() => setConfirmSidebarSignOut(false)} type="button">
              Cancel
            </button>
            <button
              className="signout-confirm-button inline-flex h-10 w-28 items-center justify-center rounded-xl border border-rose-200 bg-white px-3 py-2 font-medium text-rose-700 transition hover:bg-rose-50"
              onClick={() => {
                setConfirmSidebarSignOut(false);
                void handleLogout(logout);
              }}
              type="button"
            >
              Sign out
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function BrandMark() {
  return (
    <span aria-hidden="true" className="brand-mark">
      <svg fill="none" viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="12" stroke="currentColor" strokeWidth="2.5" />
        <path d="M19.5 11.5c-.7-1-2-1.5-3.5-1.5-2 0-3.5 1-3.5 2.5s1.2 2.2 3.5 2.5 3.5 1.1 3.5 2.5-1.5 2.5-3.5 2.5c-1.6 0-3-.6-3.8-1.7M16 8.5v15" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
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
