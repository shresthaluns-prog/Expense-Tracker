import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DashboardPage from "../src/pages/DashboardPage.jsx";

const api = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  listCategories: vi.fn(),
  listTransactions: vi.fn(),
  fetchReport: vi.fn(),
}));

vi.mock("../src/api/request.js", () => ({ apiRequest: api.apiRequest }));
vi.mock("../src/features/categories/categoriesApi.js", () => ({
  listCategories: api.listCategories,
}));
vi.mock("../src/features/expenses/transactionsApi.js", () => ({
  listTransactions: api.listTransactions,
}));
vi.mock("../src/features/reports/reportsApi.js", () => ({
  fetchReport: api.fetchReport,
}));
vi.mock("../src/pages/DashboardCharts.jsx", () => ({
  CashFlowChart: () => null,
  CategoryDoughnut: () => null,
}));

const categories = [
  { _id: "food-id", name: "Food", type: "expense", color: "#f59e0b" },
  { _id: "rent-id", name: "Rent", type: "expense", color: "#6366f1" },
  { _id: "salary-id", name: "Salary", type: "income", color: "#10b981" },
];

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <DashboardPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  api.apiRequest.mockResolvedValue({ success: true });
  api.listCategories.mockResolvedValue(categories);
  api.listTransactions.mockResolvedValue({ data: [], pagination: { page: 1, totalPages: 1 } });
  api.fetchReport.mockResolvedValue({});
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Quick Add category dropdown", () => {
  it("shows a styled menu, filters by transaction type, and submits the selected category", async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByRole("button", { name: "Category Select category" }));
    const menu = screen.getByRole("menu");
    const foodOption = within(menu).getByRole("menuitemradio", { name: "Food" });
    expect(foodOption).toHaveAttribute("aria-checked", "false");
    expect(within(menu).queryByRole("menuitemradio", { name: "Salary" })).not.toBeInTheDocument();

    await user.click(foodOption);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByText("Food")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Amount"), "12.50");
    await user.click(screen.getByRole("button", { name: "Add transaction" }));

    expect(api.apiRequest).toHaveBeenCalledWith("/transactions", {
      method: "POST",
      body: expect.objectContaining({ categoryId: "food-id", type: "expense" }),
    });
  });
});
