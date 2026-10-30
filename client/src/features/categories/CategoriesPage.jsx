import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { archiveCategory, createCategory, listCategories, updateCategory } from "./categoriesApi.js";
import {
  buttonClass,
  EmptyState,
  inputClass,
  LoadingState,
  Modal,
  Notice,
  PageHeading,
  Panel,
  secondaryButtonClass,
} from "../../components/ui.jsx";

const categorySchema = z.object({
  name: z.string().trim().min(1, "Enter a category name.").max(60),
  type: z.enum(["expense", "income"]),
  color: z.string().regex(/^#[\da-f]{6}$/i, "Choose a valid color."),
});

const baseValues = { name: "", type: "expense", color: "#6366f1" };

function CategoriesPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState("error");
  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: () => listCategories(),
  });
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({ resolver: zodResolver(categorySchema), defaultValues: baseValues });

  useEffect(() => {
    reset(editing ? { name: editing.name, type: editing.type, color: editing.color ?? "#64748b" } : baseValues);
  }, [editing, reset]);

  async function refreshRelatedData() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["categories"] }),
      queryClient.invalidateQueries({ queryKey: ["transactions"] }),
      queryClient.invalidateQueries({ queryKey: ["budgets"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
    ]);
  }

  const saveMutation = useMutation({
    mutationFn: (values) =>
      editing ? updateCategory(editing._id, values) : createCategory(values),
    onSuccess: async () => {
      setMessage(editing ? "Category updated." : "Category created.");
      setMessageTone("success");
      setEditing(null);
      setFormOpen(false);
      reset(baseValues);
      await refreshRelatedData();
    },
    onError: (error) => {
      setMessageTone("error");
      setMessage(error.message);
    },
  });
  const archiveMutation = useMutation({
    mutationFn: archiveCategory,
    onSuccess: async () => {
      setMessage("Category archived. Existing transaction history is preserved.");
      setMessageTone("success");
      await refreshRelatedData();
    },
    onError: (error) => {
      setMessageTone("error");
      setMessage(error.message);
    },
  });

  async function onSubmit(values) {
    setMessage("");
    saveMutation.mutate(values);
  }

  function handleArchive(category) {
    if (!window.confirm(`Archive "${category.name}"? It will no longer be available for new transactions.`)) return;
    setMessage("");
    archiveMutation.mutate(category._id);
  }

  const categories = categoriesQuery.data ?? [];
  const expenses = categories.filter((category) => category.type === "expense");
  const incomes = categories.filter((category) => category.type === "income");

  function openCreateForm() {
    setEditing(null);
    setMessage("");
    reset(baseValues);
    setFormOpen(true);
  }

  function closeForm() {
    setEditing(null);
    setFormOpen(false);
  }

  return (
    <div className="space-y-7">
      <PageHeading
        eyebrow="Organize"
        title="Categories"
        description="Create and manage the labels used to organize income and expenses."
        action={<button className={buttonClass} onClick={openCreateForm} type="button">＋ Add category</button>}
      />
      {message && <Notice tone={messageTone}>{message}</Notice>}
      {formOpen && (
        <Modal
          description="Category names are unique within each type."
          onClose={closeForm}
          title={editing ? "Edit category" : "New category"}
        >
          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
            <label className="block text-sm font-medium text-slate-700">
              Name
              <input className={inputClass} maxLength={60} placeholder="e.g. Groceries" {...register("name")} />
              {errors.name && <span className="mt-1 block text-xs text-rose-700">{errors.name.message}</span>}
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Type
              <select className={inputClass} {...register("type")}>
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Color
              <input aria-label="Category color" className="mt-2 h-11 w-full cursor-pointer rounded-xl border border-slate-200 bg-white p-1" type="color" {...register("color")} />
              {errors.color && <span className="mt-1 block text-xs text-rose-700">{errors.color.message}</span>}
            </label>
            <div className="flex gap-2">
              <button className={buttonClass} disabled={saveMutation.isPending} type="submit">
                {saveMutation.isPending ? "Saving…" : editing ? "Save changes" : "Add category"}
              </button>
              {editing && (
                <button className={secondaryButtonClass} onClick={closeForm} type="button">
                  Cancel
                </button>
              )}
              {!editing && <button className={secondaryButtonClass} onClick={closeForm} type="button">Cancel</button>}
            </div>
          </form>
        </Modal>
      )}

      <div className="space-y-6">
          {categoriesQuery.isPending ? (
            <Panel title="Your categories"><LoadingState /></Panel>
          ) : categoriesQuery.isError ? (
            <Notice>{categoriesQuery.error.message}</Notice>
          ) : (
            <>
              <CategoryGroup
                categories={expenses}
                onArchive={handleArchive}
                onEdit={(category) => {
                  setMessage("");
                  setEditing(category);
                  setFormOpen(true);
                }}
                title="Expenses"
              />
              <CategoryGroup
                categories={incomes}
                onArchive={handleArchive}
                onEdit={(category) => {
                  setMessage("");
                  setEditing(category);
                  setFormOpen(true);
                }}
                title="Income"
              />
            </>
          )}
      </div>
    </div>
  );
}

function CategoryGroup({ categories, title, onEdit, onArchive }) {
  return (
    <Panel title={title} action={<span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{categories.length}</span>}>
      {categories.length === 0 ? (
        <EmptyState title={`No ${title.toLowerCase()} categories yet`} description="Use the form to add your first category." />
      ) : (
        <ul className="divide-y divide-slate-100">
          {categories.map((category) => (
            <li className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0" key={category._id}>
              <div className="flex min-w-0 items-center gap-3">
                <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: category.color }} />
                <span className="truncate text-sm font-medium text-slate-800">{category.name}</span>
              </div>
              <div className="flex gap-2">
                <button className={secondaryButtonClass} onClick={() => onEdit(category)} type="button">Edit</button>
                <button className="rounded-xl px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50" onClick={() => void onArchive(category)} type="button">Archive</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export default CategoriesPage;
