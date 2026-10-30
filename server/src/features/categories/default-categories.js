export const DEFAULT_EXPENSE_CATEGORIES = [
  { name: "Food", color: "#f59e0b" },
  { name: "Rent", color: "#6366f1" },
  { name: "Entertainment", color: "#ec4899" },
  { name: "Education", color: "#0ea5e9" },
  { name: "Miscellaneous", color: "#64748b" },
];

export async function ensureDefaultExpenseCategories(CategoryModel, userId) {
  if (!CategoryModel) return;

  await Promise.all(
    DEFAULT_EXPENSE_CATEGORIES.map(({ name, color }) =>
      CategoryModel.updateOne(
        { userId, type: "expense", name },
        {
          $setOnInsert: {
            userId,
            type: "expense",
            name,
            color,
            isArchived: false,
          },
        },
        { upsert: true, collation: { locale: "en", strength: 2 } },
      ),
    ),
  );
}
