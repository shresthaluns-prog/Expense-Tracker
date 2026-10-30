import { z } from "zod";
import { CATEGORY_TYPES } from "../categories/category.model.js";
import { PAYMENT_METHODS } from "./transaction.model.js";

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "A valid category ID is required.");
const amountSchema = z.number().int().safe().positive();
const currencySchema = z.string().regex(/^[A-Za-z]{3}$/);
const dateSchema = z.coerce.date();
const noteSchema = z.string().trim().max(500);
const paymentMethodSchema = z.enum(PAYMENT_METHODS);
const typeSchema = z.enum(CATEGORY_TYPES);

export const transactionIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "A valid transaction ID is required.");

export const createTransactionSchema = z
  .object({
    categoryId: objectIdSchema,
    type: typeSchema,
    amountMinor: amountSchema,
    currency: currencySchema.default("NPR"),
    date: dateSchema.optional(),
    note: noteSchema.optional(),
    paymentMethod: paymentMethodSchema.optional(),
  })
  .strict();

export const updateTransactionSchema = z
  .object({
    categoryId: objectIdSchema.optional(),
    type: typeSchema.optional(),
    amountMinor: amountSchema.optional(),
    currency: currencySchema.optional(),
    date: dateSchema.optional(),
    note: noteSchema.optional(),
    paymentMethod: paymentMethodSchema.optional(),
  })
  .strict()
  .refine((values) => Object.keys(values).length > 0, "Provide at least one transaction field to update.");

export const listTransactionsSchema = z
  .object({
    type: typeSchema.optional(),
    categoryId: objectIdSchema.optional(),
    startDate: dateSchema.optional(),
    endDate: dateSchema.optional(),
    search: z.string().trim().max(200).optional(),
    page: z.coerce.number().int().min(1).max(1_000_000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict()
  .refine(
    ({ startDate, endDate }) => !startDate || !endDate || startDate <= endDate,
    "startDate must be on or before endDate.",
  );
