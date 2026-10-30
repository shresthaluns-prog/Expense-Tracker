import { describe, expect, it } from "vitest";
import { compactMoney, formatMoney } from "../src/utils/money.js";
import { getDefaultPreferences } from "../src/features/settings/preferences.js";

describe("shared Rs. currency formatting", () => {
  it("formats zero, positive, and negative NPR minor units consistently", () => {
    expect(formatMoney(0, "NPR")).toBe("Rs. 0.00");
    expect(formatMoney(150000, "NPR")).toBe("Rs. 1,500.00");
    expect(formatMoney(-150000, "NPR")).toBe("-Rs. 1,500.00");
  });

  it("uses the same Rs. label for other currencies without converting their values", () => {
    expect(formatMoney(1234, "USD")).toBe("Rs. 12.34");
  });

  it("formats chart-axis values with Rs. and defaults preferences to NPR", () => {
    expect(compactMoney(125000000, "NPR")).toBe("Rs. 1.3m");
    expect(getDefaultPreferences().currency).toBe("NPR");
  });
});
