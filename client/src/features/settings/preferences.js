import { z } from "zod";

const preferencesKey = "expense-tracker-preferences";
const supportedCurrencies =
  typeof Intl.supportedValuesOf === "function"
    ? new Set(Intl.supportedValuesOf("currency"))
    : null;

export const preferencesSchema = z.object({
  currency: z.string().regex(/^[A-Z]{3}$/, "Enter a three-letter currency code.").refine((value) => {
    if (supportedCurrencies) return supportedCurrencies.has(value);
    try {
      new Intl.NumberFormat("en", { style: "currency", currency: value });
      return true;
    } catch {
      return false;
    }
  }, "Enter a supported ISO 4217 currency code."),
  timezone: z.string().min(1).refine((value) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "Choose a valid timezone."),
});

export function getDefaultPreferences() {
  let timezone = "UTC";
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    timezone = "UTC";
  }
  return { currency: "NPR", timezone };
}

export function loadPreferences() {
  const defaults = getDefaultPreferences();
  try {
    const stored = globalThis.localStorage?.getItem(preferencesKey);
    if (!stored) return defaults;
    const result = preferencesSchema.safeParse(JSON.parse(stored));
    return result.success ? result.data : defaults;
  } catch {
    return defaults;
  }
}

export function savePreferences(preferences) {
  const result = preferencesSchema.safeParse(preferences);
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Preferences are invalid.");
  }
  try {
    globalThis.localStorage?.setItem(preferencesKey, JSON.stringify(result.data));
  } catch {
    throw new Error("Could not save preferences in this browser.");
  }
  globalThis.dispatchEvent?.(
    new CustomEvent("expense-tracker-preferences-changed", { detail: result.data }),
  );
  return result.data;
}

export function subscribeToPreferences(listener) {
  if (typeof globalThis.addEventListener !== "function") return () => {};
  const handleChange = (event) => {
    listener(event.detail ?? loadPreferences());
  };
  const handleStorage = (event) => {
    if (event.key === preferencesKey) listener(loadPreferences());
  };
  globalThis.addEventListener("expense-tracker-preferences-changed", handleChange);
  globalThis.addEventListener("storage", handleStorage);
  return () => {
    globalThis.removeEventListener("expense-tracker-preferences-changed", handleChange);
    globalThis.removeEventListener("storage", handleStorage);
  };
}
