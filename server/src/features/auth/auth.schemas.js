import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((email) => email.toLowerCase());

export const NEW_PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9\s])\S{8,}$/;

const passwordSchema = z
  .string()
  .regex(
    NEW_PASSWORD_PATTERN,
    "Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character, with no whitespace.",
  )
  .refine((password) => Buffer.byteLength(password, "utf8") <= 72, {
    message: "Password must be no more than 72 bytes.",
  });

export const registerSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    email: emailSchema,
    password: passwordSchema,
  })
  .strict();

export const loginSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1).refine((password) => Buffer.byteLength(password, "utf8") <= 72),
  })
  .strict();
