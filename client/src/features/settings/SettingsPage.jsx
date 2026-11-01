import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useAuth } from "../auth/AuthProvider.jsx";
import { buttonClass, inputClass, Modal, Notice, PageHeading, Panel, secondaryButtonClass } from "../../components/ui.jsx";
import {
  getDefaultPreferences,
  loadPreferences,
  preferencesSchema,
  savePreferences,
} from "./preferences.js";

function SettingsPage() {
  const queryClient = useQueryClient();
  const { user, logout } = useAuth();
  const [preferences, setPreferences] = useState(loadPreferences);
  const [notice, setNotice] = useState(null);
  const [sessionError, setSessionError] = useState("");
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const form = useForm({
    resolver: zodResolver(preferencesSchema),
    defaultValues: preferences,
  });
  const { reset } = form;
  const saveMutation = useMutation({
    mutationFn: savePreferences,
    onSuccess: async (saved) => {
      setPreferences(saved);
      setNotice({ tone: "success", text: "Preferences saved in this browser." });
      await queryClient.invalidateQueries({ queryKey: ["reports"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error) => setNotice({ tone: "error", text: error.message }),
  });

  useEffect(() => {
    reset(preferences);
  }, [preferences, reset]);

  async function signOut() {
    setSessionError("");
    try {
      await logout();
    } catch (error) {
      setSessionError(error.message);
    }
  }

  const createdAt = user?.createdAt ? new Date(user.createdAt) : null;

  return (
    <div className="space-y-7">
      <PageHeading
        eyebrow="Your account"
        title="Settings"
        description="Manage display preferences and account sessions."
      />
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      {sessionError && <Notice>{sessionError}</Notice>}

      <div className="grid items-stretch gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <Panel title="Display and reports" description="These preferences are saved in this browser only.">
            <form
              className="space-y-5"
              onSubmit={form.handleSubmit((values) => {
                setNotice(null);
                saveMutation.mutate(values);
              })}
            >
              <label className="block text-sm font-medium text-slate-700">
                Preferred currency
                <input
                  autoCapitalize="characters"
                  className={`${inputClass} uppercase`}
                  maxLength={3}
                  placeholder="NPR"
                  {...form.register("currency", { setValueAs: (value) => value.toUpperCase() })}
                />
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  Financial records retain their own currency. Reports keep currencies separate and will not convert totals.
                </span>
                {form.formState.errors.currency && (
                  <span className="mt-1 block text-xs text-rose-700">{form.formState.errors.currency.message}</span>
                )}
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Reporting timezone
                <input
                  autoComplete="off"
                  className={inputClass}
                  list="expense-tracker-timezones"
                  placeholder="e.g. Asia/Kathmandu"
                  {...form.register("timezone")}
                />
                <datalist id="expense-tracker-timezones">
                  {[preferences.timezone, "UTC", "Asia/Kathmandu", "America/Los_Angeles", "America/New_York", "Europe/London", "Europe/Paris", "Asia/Tokyo"].map((timezone) => (
                    <option key={timezone} value={timezone} />
                  ))}
                </datalist>
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  Use an IANA timezone, such as Asia/Kathmandu. Report date boundaries follow this timezone, including daylight-saving changes.
                </span>
                {form.formState.errors.timezone && (
                  <span className="mt-1 block text-xs text-rose-700">{form.formState.errors.timezone.message}</span>
                )}
              </label>

              <div className="flex flex-wrap gap-2">
                <button className={buttonClass} disabled={saveMutation.isPending} type="submit">
                  {saveMutation.isPending ? "Saving…" : "Save preferences"}
                </button>
                <button
                  className={secondaryButtonClass}
                  onClick={() => {
                    const defaults = getDefaultPreferences();
                    reset(defaults);
                    setNotice(null);
                  }}
                  type="button"
                >
                  Use browser defaults
                </button>
              </div>
            </form>
          </Panel>

          <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-500">
            Access tokens remain in memory and are never saved to browser storage. Only your display preferences are kept in local browser storage; refresh credentials stay in secure cookies managed by the server.
          </p>
        </div>

        <div className="flex flex-col gap-6">
          <Panel title="Account profile" description="Profile information associated with this signed-in account.">
            <dl className="divide-y divide-slate-100">
              <ProfileRow label="Name" value={user?.name || "—"} />
              <ProfileRow label="Email" value={user?.email || "—"} />
              <ProfileRow label="Member since" value={createdAt ? createdAt.toLocaleDateString() : "—"} />
            </dl>
          </Panel>

          <Panel className="flex-1" title="Sessions" description="Sign out of your current session.">
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm leading-6 text-slate-500">
                Sign out of this account on the current device.
              </p>
              <button
                className="inline-flex items-center justify-center rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50"
                onClick={() => setConfirmSignOut(true)}
                type="button"
              >
                Sign out
              </button>
            </div>
          </Panel>

        </div>
      </div>
      {confirmSignOut && (
        <Modal
          description="You will need to sign in again to access your account."
          onClose={() => setConfirmSignOut(false)}
          title="Sign out?"
        >
          <div className="flex justify-end gap-2">
            <button className={`${secondaryButtonClass} signout-confirm-button h-10 w-28 justify-center`} onClick={() => setConfirmSignOut(false)} type="button">
              Cancel
            </button>
            <button
              className="signout-confirm-button inline-flex h-10 w-28 items-center justify-center rounded-xl border border-rose-200 bg-white px-3 py-2 font-medium text-rose-700 transition hover:bg-rose-50"
              onClick={() => {
                setConfirmSignOut(false);
                void signOut();
              }}
              type="button"
            >
              Sign out
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ProfileRow({ label, value }) {
  return (
    <div className="flex flex-wrap justify-between gap-2 py-3 first:pt-0 last:pb-0">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-sm font-medium text-slate-800">{value}</dd>
    </div>
  );
}

export default SettingsPage;
