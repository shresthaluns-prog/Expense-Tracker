import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App.jsx";
import AuthPage from "../src/features/auth/AuthPage.jsx";

const authState = vi.hoisted(() => ({
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  logoutEverywhere: vi.fn(),
  user: null,
  status: "ready",
}));

vi.mock("../src/features/auth/AuthProvider.jsx", () => ({
  useAuth: () => authState,
}));

vi.mock("../src/pages/DashboardPage.jsx", () => ({
  default: () => <h1>Dashboard test page</h1>,
}));

afterEach(cleanup);

beforeEach(() => {
  authState.login.mockReset();
  authState.register.mockReset();
  authState.logout.mockReset();
  authState.logoutEverywhere.mockReset();
  authState.user = null;
  authState.status = "ready";
});

describe("authentication form", () => {
  it("shows field errors and does not submit invalid credentials", async () => {
    const user = userEvent.setup();
    render(<AuthPage />);

    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Invalid email address", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("Enter your password.")).toBeInTheDocument();
    expect(authState.login).not.toHaveBeenCalled();
  });

  it("validates registration name and password before calling registration", async () => {
    const user = userEvent.setup();
    render(<AuthPage />);

    await user.click(screen.getByRole("button", { name: "Create an account" }));
    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.type(screen.getByLabelText("Password", { exact: false, selector: "input" }), "short");
    expect(screen.getByText("An uppercase letter (A–Z)")).toHaveClass("is-invalid");
    expect(screen.getByText("A lowercase letter (a–z)")).toHaveClass("is-valid");
    expect(screen.getByText("A special character, no spaces")).toHaveClass("is-invalid");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("Enter your name.")).toBeInTheDocument();
    expect(screen.getByText(/Use at least 8 characters/)).toBeInTheDocument();
    expect(authState.register).not.toHaveBeenCalled();
  });

  it("accepts a strong registration password and leaves legacy login passwords unrestricted", async () => {
    const user = userEvent.setup();
    authState.register.mockResolvedValue(undefined);
    authState.login.mockResolvedValue(undefined);
    render(<AuthPage />);
    await user.click(screen.getByRole("button", { name: "Create an account" }));
    await user.type(screen.getByLabelText("Name"), "Test User");
    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.type(screen.getByLabelText("Password", { exact: false, selector: "input" }), "Aa1!bcde");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(authState.register).toHaveBeenCalledWith({
      name: "Test User",
      email: "person@example.com",
      password: "Aa1!bcde",
    });

    cleanup();
    render(<AuthPage />);
    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.type(screen.getByLabelText("Password", { exact: false, selector: "input" }), "oldpass");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(authState.login).toHaveBeenCalledWith({ email: "person@example.com", password: "oldpass" });
  });

  it("allows an existing password after switching from registration to login", async () => {
    const user = userEvent.setup();
    authState.login.mockResolvedValue(undefined);
    render(<AuthPage />);

    await user.click(screen.getByRole("button", { name: "Create an account" }));
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByRole("heading", { name: "Welcome back" })).toBeInTheDocument();

    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.type(screen.getByLabelText("Password", { exact: false, selector: "input" }), "oldpass");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(authState.login).toHaveBeenCalledWith({ email: "person@example.com", password: "oldpass" });
  });
});

describe("protected routes", () => {
  it("redirects unauthenticated users to sign-in", () => {
    render(
      <MemoryRouter initialEntries={["/transactions"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Transactions" })).not.toBeInTheDocument();
  });

  it("shows navigation after the user is authenticated", () => {
    authState.user = { id: "user-1", name: "Test User" };
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Transactions" })).toBeInTheDocument();
  });
});
