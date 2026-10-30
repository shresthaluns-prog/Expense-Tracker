export function currencyFractionDigits(currency) {
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).resolvedOptions().maximumFractionDigits;
  } catch {
    return 2;
  }
}

export function amountToMinor(amount, currency) {
  const digits = currencyFractionDigits(currency);
  const value = String(amount).trim();
  const match = value.match(/^(\d+)(?:\.(\d+))?$/);
  if (!match || (match[2]?.length ?? 0) > digits) {
    throw new Error(
      digits === 0
        ? `${currency} amounts cannot include decimal places.`
        : `Enter no more than ${digits} decimal places for ${currency}.`,
    );
  }

  const factor = 10n ** BigInt(digits);
  const fraction = (match[2] ?? "").padEnd(digits, "0");
  const minor = BigInt(match[1]) * factor + BigInt(fraction || "0");
  if (minor <= 0n || minor > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Enter an amount greater than zero within the supported range.");
  }
  return Number(minor);
}

export function minorToAmount(amountMinor, currency) {
  const digits = currencyFractionDigits(currency);
  const minor = BigInt(Math.trunc(amountMinor));
  const negative = minor < 0n;
  const value = negative ? -minor : minor;
  const factor = 10n ** BigInt(digits);
  const whole = value / factor;
  const fraction = digits ? `.${(value % factor).toString().padStart(digits, "0")}` : "";
  return `${negative ? "-" : ""}${whole}${fraction}`;
}

export function formatMoney(amountMinor, currency = "NPR") {
  const code = currency.toUpperCase();
  try {
    const digits = currencyFractionDigits(code);
    const amount = Number(minorToAmount(amountMinor, code));
    const formatted = new Intl.NumberFormat("en-IN", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(Math.abs(amount));
    return `${amount < 0 ? "-" : ""}Rs. ${formatted}`;
  } catch {
    const amount = minorToAmount(amountMinor, code);
    return `${amount.startsWith("-") ? "-" : ""}Rs. ${amount.replace(/^-/, "")}`;
  }
}

export function compactMoney(amountMinor, currency = "NPR") {
  const digits = currencyFractionDigits(currency);
  const amount = amountMinor / 10 ** digits;
  const magnitude = Math.abs(amount);
  if (magnitude >= 1_000_000) return `Rs. ${(amount / 1_000_000).toFixed(1)}m`;
  if (magnitude >= 1_000) return `Rs. ${(amount / 1_000).toFixed(1)}k`;
  return formatMoney(amountMinor, currency);
}
