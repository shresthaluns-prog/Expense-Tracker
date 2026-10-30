import { z } from "zod";
import { BUDGET_PERIOD_TYPES } from "./budget.model.js";

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "A valid category ID is required.");
const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Dates must use YYYY-MM-DD in UTC.")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Date is not a valid calendar day.");
const amountSchema = z.number().int().safe().positive();
const currencySchema = z.string().regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase());
const periodTypeSchema = z.enum(BUDGET_PERIOD_TYPES);

const budgetFields = {
  categoryId: objectIdSchema.nullable().optional(),
  amountMinor: amountSchema,
  currency: currencySchema.default("NPR"),
  periodType: periodTypeSchema,
  startDate: dateOnlySchema,
  endDate: dateOnlySchema.optional(),
};

function validatePeriod(value, context) {
  if (value.periodType === "custom" && !value.endDate) {
    context.addIssue({
      code: "custom",
      path: ["endDate"],
      message: "endDate is required for a custom budget period.",
    });
  }
  if (value.periodType !== "custom" && value.endDate) {
    context.addIssue({
      code: "custom",
      path: ["endDate"],
      message: "endDate is derived for weekly and monthly budget periods.",
    });
  }
  if (value.periodType === "custom" && value.endDate && value.endDate <= value.startDate) {
    context.addIssue({
      code: "custom",
      path: ["endDate"],
      message: "endDate must be later than startDate.",
    });
  }
}

export const createBudgetSchema = z
  .object(budgetFields)
  .strict()
  .superRefine(validatePeriod);

export const updateBudgetSchema = z
  .object({
    categoryId: objectIdSchema.nullable().optional(),
    amountMinor: amountSchema.optional(),
    currency: currencySchema.optional(),
    periodType: periodTypeSchema.optional(),
    startDate: dateOnlySchema.optional(),
    endDate: dateOnlySchema.optional(),
  })
  .strict()
  .refine((values) => Object.keys(values).length > 0, "Provide at least one budget field to update.");

export const budgetIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "A valid budget ID is required.");

export const listBudgetsSchema = z
  .object({
    periodType: periodTypeSchema.optional(),
    categoryId: objectIdSchema.nullable().optional(),
    scope: z.enum(["overall", "category"]).optional(),
    page: z.coerce.number().int().min(1).max(1_000_000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict()
  .superRefine(({ categoryId, scope }, context) => {
    if (scope === "overall" && categoryId !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["categoryId"],
        message: "Do not provide categoryId when scope=overall.",
      });
    }
    if (scope === "category" && (categoryId === undefined || categoryId === null)) {
      context.addIssue({
        code: "custom",
        path: ["categoryId"],
        message: "categoryId is required when scope=category.",
      });
    }
  });

export { dateOnlySchema };
