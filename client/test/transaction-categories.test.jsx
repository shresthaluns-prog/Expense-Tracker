import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TransactionsPage from "../src/features/expenses/TransactionsPage.jsx";

const api = vi.hoisted(() => ({
  listCategories: vi.fn(),
  listTransactions: vi.fn(),
  createTransaction: vi.fn(),
  updateTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
}));

vi.mock("../src/features/categories/categoriesApi.js", () => ({
  listCategories: api.listCategories,
}));

vi.mock("../src/features/expenses/transactionsApi.js", () => ({
  listTransactions: api.listTransactions,
  createTransaction: api.createTransaction,
  updateTransaction: api.updateTransaction,
  deleteTransaction: api.deleteTransaction,
}));

const expenseNames = ["Food", "Rent", "Entertainment", "Education", "Miscellaneous"];
const categories = expenseNames.map((name, index) => ({
  _id: `category-${index}`,
  name,
  type: "expense",
}));
const transaction = {
  _id: "transaction-1",
  categoryId: categories[0],
  type: "expense",
  amountMinor: 1250,
  currency: "NPR",
  date: "2026-03-10T12:00:00.000Z",
  note: "Lunch",
  paymentMethod: "cash",
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TransactionsPage />
    </QueryClientProvider>,
  );
}

function expectExpenseOptions(select) {
  const options = within(select).getAllByRole("option");
  expect(options.map((option) => option.textContent)).toEqual(["Select", ...expenseNames]);
  expect(options.slice(1).map((option) => option.value)).toEqual(categories.map(({ _id }) => _id));
}

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close() {
    this.open = false;
  };
  api.listCategories.mockResolvedValue(categories);
  api.listTransactions.mockResolvedValue({ data: [transaction], pagination: { page: 1, totalPages: 1 } });
  api.createTransaction.mockResolvedValue(transaction);
  api.updateTransaction.mockResolvedValue(transaction);
  api.deleteTransaction.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("predefined expense transaction categories", () => {
  it("offers all predefined categories in both create and edit forms", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /add transaction/i }));
    const dialog = screen.getByRole("dialog");
    const createCategorySelect = within(dialog).getByLabelText("Category");
    expectExpenseOptions(createCategorySelect);
    for (const { _id } of categories) {
      await user.selectOptions(createCategorySelect, _id);
      expect(createCategorySelect).toHaveValue(_id);
    }

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(await screen.findByRole("button", { name: "Edit Lunch" }));
    const editCategorySelect = within(screen.getByRole("dialog")).getByLabelText("Category");
    expectExpenseOptions(editCategorySelect);
    expect(editCategorySelect).toHaveValue(categories[0]._id);
  });
});
