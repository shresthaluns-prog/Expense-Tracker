import { z } from "zod";

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Dates must use YYYY-MM-DD.")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Date is not a valid calendar day.");

const timezoneSchema = z.string().min(1).max(100).refine((value) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}, "timezone must be a valid IANA timezone.");

export const reportQuerySchema = z
  .object({
    startDate: dateOnlySchema.optional(),
    endDate: dateOnlySchema.optional(),
    currency: z.string().regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase()).optional(),
    timezone: timezoneSchema.default("UTC"),
  })
  .strict()
  .superRefine(({ startDate, endDate }, context) => {
    if (Boolean(startDate) !== Boolean(endDate)) {
      context.addIssue({
        code: "custom",
        path: [startDate ? "endDate" : "startDate"],
        message: "Provide both startDate and endDate.",
      });
      return;
    }

    if (startDate && endDate) {
      const start = new Date(`${startDate}T00:00:00.000Z`);
      const end = new Date(`${endDate}T00:00:00.000Z`);
      if (end < start) {
        context.addIssue({
          code: "custom",
          path: ["endDate"],
          message: "endDate must be on or after startDate.",
        });
      } else if (end.getTime() - start.getTime() >= 366 * 24 * 60 * 60 * 1000) {
        context.addIssue({
          code: "custom",
          path: ["endDate"],
          message: "Report date ranges cannot exceed 366 days.",
        });
      }
    }
  });
