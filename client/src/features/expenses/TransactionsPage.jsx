import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { listCategories } from "../categories/categoriesApi.js";
import {
  buttonClass,
  EmptyState,
  inputClass,
  LoadingState,
  Modal,
  Notice,
  PageHeading,
  Pagination,
  Panel,
  secondaryButtonClass,
} from "../../components/ui.jsx";
import { amountToMinor, formatMoney, minorToAmount } from "../../utils/money.js";
import { loadPreferences } from "../settings/preferences.js";
import { createTransaction, deleteTransaction, listTransactions, updateTransaction } from "./transactionsApi.js";

const transactionSchema = z.object({
  amount: z.string().trim().min(1, "Enter an amount.").max(20),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/, "Use a three-letter currency code."),
  date: z.string().min(1, "Choose a date."),
  type: z.enum(["expense", "income"]),
  categoryId: z.string().min(1, "Choose a category."),
  note: z.string().max(500),
  paymentMethod: z.enum(["cash", "card", "bank_transfer", "mobile_wallet", "other"]),
});

function dateInputValue(value) {
  if (!value) return new Date().toISOString().slice(0, 10);
  return new Date(value).toISOString().slice(0, 10);
}

function TransactionsPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ search: "", type: "", categoryId: "", startDate: "", endDate: "" });
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const categoriesQuery = useQuery({
    queryKey: ["categories", "active"],
    queryFn: () => listCategories(),
  });
  const transactionQuery = useQuery({
    queryKey: ["transactions", { ...appliedFilters, page }],
    queryFn: () => listTransactions({ ...appliedFilters, page, limit: 20 }),
  });
  const categories = categoriesQuery.data ?? [];
  const form = useForm({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      amount: "",
      currency: loadPreferences().currency,
      date: dateInputValue(),
      type: "expense",
      categoryId: "",
      note: "",
      paymentMethod: "other",
    },
  });
  const { reset } = form;
  const selectedType = useWatch({ control: form.control, name: "type" });
  const availableCategories = useMemo(
    () => categories.filter((category) => category.type === selectedType),
    [categories, selectedType],
  );

  useEffect(() => {
    if (editing) {
      reset({
        amount: minorToAmount(editing.amountMinor, editing.currency),
        currency: editing.currency,
        date: dateInputValue(editing.date),
        type: editing.type,
        categoryId: typeof editing.categoryId === "object" ? editing.categoryId?._id : editing.categoryId,
        note: editing.note ?? "",
        paymentMethod: editing.paymentMethod ?? "other",
      });
    } else {
      reset({
        amount: "",
        currency: loadPreferences().currency,
        date: dateInputValue(),
        type: "expense",
        categoryId: "",
        note: "",
        paymentMethod: "other",
      });
    }
    setFormError("");
  }, [editing, reset]);

  useEffect(() => {
    const selected = form.getValues("categoryId");
    if (selected && !availableCategories.some((category) => category._id === selected)) {
      form.setValue("categoryId", "", { shouldValidate: false });
    }
  }, [availableCategories, form]);

  async function refreshData() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["transactions"] }),
      queryClient.invalidateQueries({ queryKey: ["budgets"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
    ]);
  }

  const saveMutation = useMutation({
    mutationFn: (values) =>
      editing ? updateTransaction(editing._id, values) : createTransaction(values),
    onSuccess: async () => {
      setEditing(null);
      setFormOpen(false);
      setFormError("");
      await refreshData();
    },
    onError: (error) => setFormError(error.message),
  });
  const deleteMutation = useMutation({
    mutationFn: deleteTransaction,
    onSuccess: refreshData,
    onError: (error) => setFormError(error.message),
  });

  async function onSubmit(values) {
    setFormError("");
    try {
      const payload = {
        amountMinor: amountToMinor(values.amount, values.currency.toUpperCase()),
        currency: values.currency.toUpperCase(),
        date: new Date(`${values.date}T12:00:00.000Z`).toISOString(),
        type: values.type,
        categoryId: values.categoryId,
        note: values.note.trim(),
        paymentMethod: values.paymentMethod,
      };
      await saveMutation.mutateAsync(payload);
    } catch (error) {
      setFormError(error.message);
    }
  }

  function handleDelete(transaction) {
    if (!window.confirm("Delete this transaction? This cannot be undone.")) return;
    setFormError("");
    deleteMutation.mutate(transaction._id);
  }

  function applyFilters(event) {
    event.preventDefault();
    if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) return;
    setPage(1);
    setAppliedFilters({ ...filters });
  }

  const transactions = transactionQuery.data?.data ?? [];
  const fieldError = form.formState.errors;
  const invalidDateRange = Boolean(filters.startDate && filters.endDate && filters.startDate > filters.endDate);

  function openCreateForm() {
    setEditing(null);
    setFormError("");
    reset({
      amount: "",
      currency: loadPreferences().currency,
      date: dateInputValue(),
      type: "expense",
      categoryId: "",
      note: "",
      paymentMethod: "other",
    });
    setFormOpen(true);
  }

  function closeForm() {
    setEditing(null);
    setFormOpen(false);
  }

  return (
    <div className="space-y-7">
      <PageHeading
        eyebrow="Your activity"
        title="Transactions"
        description="Record income and expenses, then filter your history to find what you need."
        action={<button className={buttonClass} onClick={openCreateForm} type="button">＋ Add transaction</button>}
      />
      {formError && <Notice>{formError}</Notice>}
      {formOpen && (
        <Modal
          description="Amounts are entered in the major currency unit."
          onClose={closeForm}
          title={editing ? "Edit transaction" : "Add a transaction"}
        >
          {categoriesQuery.isError && <Notice>{categoriesQuery.error.message}</Notice>}
          {!categoriesQuery.isPending && categories.length === 0 && (
            <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Create a category before adding a transaction.</p>
          )}
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium text-slate-700">
                Type
                <select className={inputClass} {...form.register("type")}>
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Category
                <select className={inputClass} {...form.register("categoryId")}>
                  <option value="">Select</option>
                  {availableCategories.map((category) => <option key={category._id} value={category._id}>{category.name}</option>)}
                </select>
                {fieldError.categoryId && <span className="mt-1 block text-xs text-rose-700">{fieldError.categoryId.message}</span>}
              </label>
            </div>
            <div className="grid grid-cols-[1fr_100px] gap-3">
              <label className="block text-sm font-medium text-slate-700">
                Amount
                <input className={inputClass} inputMode="decimal" placeholder="0.00" {...form.register("amount")} />
                {fieldError.amount && <span className="mt-1 block text-xs text-rose-700">{fieldError.amount.message}</span>}
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Currency
                <input className={`${inputClass} uppercase`} maxLength={3} {...form.register("currency")} />
                {fieldError.currency && <span className="mt-1 block text-xs text-rose-700">{fieldError.currency.message}</span>}
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium text-slate-700">
                Date
                <input className={inputClass} type="date" {...form.register("date")} />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Payment
                <select className={inputClass} {...form.register("paymentMethod")}>
                  <option value="other">Other</option>
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="mobile_wallet">Mobile wallet</option>
                </select>
              </label>
            </div>
            <label className="block text-sm font-medium text-slate-700">
              Note <span className="font-normal text-slate-400">(optional)</span>
              <textarea className={`${inputClass} min-h-20 resize-y`} maxLength={500} placeholder="Add a note" {...form.register("note")} />
            </label>
            <div className="flex flex-wrap gap-2">
              <button className={buttonClass} disabled={saveMutation.isPending || categories.length === 0} type="submit">
                {saveMutation.isPending ? "Saving…" : editing ? "Save changes" : "Add transaction"}
              </button>
              <button className={secondaryButtonClass} onClick={closeForm} type="button">Cancel</button>
            </div>
          </form>
        </Modal>
      )}

      <Panel title="Transaction history" description="Your newest activity appears first.">
          <form className="mb-5 grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-2 xl:grid-cols-6" onSubmit={applyFilters}>
            <label className="text-xs font-semibold text-slate-600 sm:col-span-2 xl:col-span-2">
              Search notes
              <input className={`${inputClass} bg-white`} placeholder="Search transactions" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Type
              <select className={`${inputClass} bg-white`} value={filters.type} onChange={(event) => setFilters({ ...filters, type: event.target.value })}>
                <option value="">All</option><option value="expense">Expense</option><option value="income">Income</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Category
              <select className={`${inputClass} bg-white`} value={filters.categoryId} onChange={(event) => setFilters({ ...filters, categoryId: event.target.value })}>
                <option value="">All</option>
                {categories.map((category) => <option key={category._id} value={category._id}>{category.name}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">
              From
              <input className={`${inputClass} bg-white`} max={filters.endDate || undefined} type="date" value={filters.startDate} onChange={(event) => setFilters({ ...filters, startDate: event.target.value })} />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Through
              <input className={`${inputClass} bg-white`} min={filters.startDate || undefined} type="date" value={filters.endDate} onChange={(event) => setFilters({ ...filters, endDate: event.target.value })} />
            </label>
            <button className={`${secondaryButtonClass} sm:col-span-2 xl:col-span-6`} type="submit">Apply filters</button>
          </form>
          {invalidDateRange && (
            <Notice>Start date must be on or before end date.</Notice>
          )}
          {transactionQuery.isPending ? <LoadingState label="Loading transactions…" /> : null}
          {transactionQuery.isError && <Notice>{transactionQuery.error.message}</Notice>}
          {transactionQuery.isSuccess && transactions.length === 0 && (
            <EmptyState title="No transactions found" description="Add a transaction or adjust your filters." />
          )}
          {transactions.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <tr><th className="pb-3 font-semibold">Description</th><th className="pb-3 font-semibold">Category</th><th className="pb-3 font-semibold">Date</th><th className="pb-3 text-right font-semibold">Amount</th><th className="pb-3 text-right font-semibold">Actions</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {transactions.map((transaction) => {
                    const category = transaction.categoryId && typeof transaction.categoryId === "object" ? transaction.categoryId : null;
                    return (
                      <tr key={transaction._id}>
                        <td className="py-3 pr-3">
                          <span className="block font-medium text-slate-800">{transaction.note || (transaction.type === "income" ? "Income" : "Expense")}</span>
                          <span className="mt-0.5 block text-xs capitalize text-slate-400">{transaction.paymentMethod?.replaceAll("_", " ")}</span>
                        </td>
                        <td className="py-3 pr-3">
                          <span className="inline-flex items-center gap-2 text-slate-600">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: category?.color ?? "#94a3b8" }} />
                            {category?.name ?? "Category"}
                          </span>
                        </td>
                        <td className="py-3 pr-3 text-slate-500">{dateInputValue(transaction.date)}</td>
                        <td className={`py-3 text-right font-semibold ${transaction.type === "income" ? "text-emerald-700" : "text-slate-800"}`}>
                          {transaction.type === "income" ? "+" : "−"}{formatMoney(transaction.amountMinor, transaction.currency)}
                        </td>
                        <td className="py-3 pl-3 text-right">
                          <button aria-label={`Edit ${transaction.note || "transaction"}`} className="mr-1 rounded-lg px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50" onClick={() => { setEditing(transaction); setFormOpen(true); }} type="button">Edit</button>
                          <button aria-label={`Delete ${transaction.note || "transaction"}`} className="rounded-lg px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50" onClick={() => void handleDelete(transaction)} type="button">Delete</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <Pagination pagination={transactionQuery.data?.pagination} onPageChange={setPage} />
      </Panel>
    </div>
  );
}

export default TransactionsPage;
