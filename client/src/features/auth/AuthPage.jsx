import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useAuth } from "./AuthProvider.jsx";

function getAuthSchema(isRegistering) {
  const password = z
    .string()
    .min(1, "Enter your password.")
    .refine(
      (value) => !isRegistering || /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9\s])\S{8,}$/.test(value),
      "Use at least 8 characters with uppercase, lowercase, a number, and a special character; do not use spaces.",
    )
    .refine((value) => new TextEncoder().encode(value).length <= 72, "Password must be no more than 72 bytes.");
  const fields = {
    email: z.string().trim().email().max(254),
    password,
  };
  return z.object({
    ...fields,
    name: isRegistering
      ? z.string().trim().min(1, "Enter your name.").max(100)
      : z.string().max(100).optional(),
  }).strict();
}

function AuthPage() {
  const [isRegistering, setIsRegistering] = useState(false);
  const { login, register } = useAuth();
  const [serverError, setServerError] = useState("");
  const schema = useMemo(() => getAuthSchema(isRegistering), [isRegistering]);
  const {
    register: registerField,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
    reset,
  } = useForm({ mode: "onChange", reValidateMode: "onChange", resolver: zodResolver(schema) });
  const passwordValue = watch("password", "");
  const passwordRules = [
    ["At least 8 characters", passwordValue.length >= 8],
    ["An uppercase letter (A–Z)", /[A-Z]/.test(passwordValue)],
    ["A lowercase letter (a–z)", /[a-z]/.test(passwordValue)],
    ["A number (0–9)", /\d/.test(passwordValue)],
    ["A special character, no spaces", /[^A-Za-z0-9\s]/.test(passwordValue) && !/\s/.test(passwordValue)],
  ];

  async function onSubmit(values) {
    setServerError("");
    try {
      if (isRegistering) await register(values);
      else await login({ email: values.email, password: values.password });
    } catch (error) {
      setServerError(error.message);
    }
  }

  function toggleMode() {
    setServerError("");
    setIsRegistering((current) => !current);
    reset();
  }

  return (
    <section className="auth-card mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <p className="auth-eyebrow text-sm font-medium uppercase tracking-wide text-indigo-600">Personal finance, made clear</p>
      <h1 className="mt-2 text-2xl font-semibold">{isRegistering ? "Create your account" : "Welcome back"}</h1>
      <p className="mt-2 text-sm text-slate-600">
        {isRegistering ? "Sign up to start organizing your finances." : "Sign in to continue to your dashboard."}
      </p>

      <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)}>
        {isRegistering && (
          <label className="block text-sm font-medium">
            Name
            <input
              autoComplete="name"
              className="auth-input mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal"
              {...registerField("name")}
            />
            {errors.name && <span className="mt-1 block text-rose-700">{errors.name.message}</span>}
          </label>
        )}
        <label className="block text-sm font-medium">
          Email
          <input
            autoComplete="email"
            className="auth-input mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal"
            type="email"
            {...registerField("email")}
          />
          {errors.email && <span className="mt-1 block text-rose-700">{errors.email.message}</span>}
        </label>
        <label className="block text-sm font-medium">
          Password
          <input
            autoComplete={isRegistering ? "new-password" : "current-password"}
            className="auth-input mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal"
            type="password"
            {...registerField("password")}
          />
          {errors.password && <span className="mt-1 block text-sm text-rose-700">{errors.password.message}</span>}
          {isRegistering && (
            <ul aria-label="Password requirements" className="password-requirements mt-2 grid gap-1">
              {passwordRules.map(([label, passed]) => (
                <li className={passwordValue ? (passed ? "is-valid" : "is-invalid") : ""} key={label}>
                  <span aria-hidden="true">{passwordValue ? (passed ? "✓" : "•") : "○"}</span>
                  {label}
                </li>
              ))}
            </ul>
          )}
        </label>

        {serverError && <p className="text-sm text-rose-700" role="alert">{serverError}</p>}
        <button
          className="auth-submit w-full rounded-lg bg-indigo-600 px-4 py-2.5 font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "Please wait…" : isRegistering ? "Create account" : "Sign in"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-600">
        {isRegistering ? "Already have an account?" : "New to Pockii?"}{" "}
        <button className="auth-toggle font-medium text-indigo-700 hover:underline" onClick={toggleMode} type="button">
          {isRegistering ? "Sign in" : "Create an account"}
        </button>
      </p>
    </section>
  );
}

export default AuthPage;
