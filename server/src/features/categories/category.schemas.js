import { z } from "zod";
import { CATEGORY_TYPES } from "./category.model.js";

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "A valid category ID is required.");
const nameSchema = z.string().trim().min(1).max(60);
const typeSchema = z.enum(CATEGORY_TYPES);
const colorSchema = z.string().regex(/^#[\da-f]{6}$/i);

export const categoryIdSchema = objectIdSchema;

export const createCategorySchema = z
  .object({
    name: nameSchema,
    type: typeSchema,
    color: colorSchema.optional(),
  })
  .strict();

export const updateCategorySchema = z
  .object({
    name: nameSchema.optional(),
    type: typeSchema.optional(),
    color: colorSchema.optional(),
  })
  .strict()
  .refine((values) => Object.keys(values).length > 0, "Provide at least one category field to update.");

export const listCategoriesSchema = z
  .object({
    type: typeSchema.optional(),
    search: z.string().trim().max(100).optional(),
    includeArchived: z.enum(["true", "false"]).optional(),
    page: z.coerce.number().int().min(1).max(1_000_000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
