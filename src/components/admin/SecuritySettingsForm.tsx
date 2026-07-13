"use client";

import { useState } from "react";

import type { OrganizationSecuritySettings } from "@/lib/enterprise/security-settings";
import type { SecuritySettingsRecord } from "@/lib/enterprise/security-settings";

const inputClass =
  "rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-sky-600 dark:border-zinc-700 dark:bg-zinc-950";
const buttonClass =
  "rounded-md bg-sky-700 px-3 py-2 text-sm font-medium text-white hover:bg-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

interface Props {
  initial: SecuritySettingsRecord;
}

export function SecuritySettingsForm({ initial }: Props) {
  const [record, setRecord] = useState(initial);
  const [form, setForm] = useState<OrganizationSecuritySettings>(initial.settings);
  const [status, setStatus] = useState("Ready");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setStatus("Saving security settings");
    try {
      const contextResponse = await fetch("/api/admin/control-plane/context", {
        cache: "no-store",
      });
      if (!contextResponse.ok) throw new Error("Authorization refresh failed");
      const context = (await contextResponse.json()) as { csrfToken: string };
      const response = await fetch("/api/admin/control-plane/security-settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": context.csrfToken,
        },
        body: JSON.stringify({
          expectedVersion: record.version,
          settings: form,
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        settings?: SecuritySettingsRecord;
      };
      if (!response.ok) throw new Error(result.error ?? "Save failed");
      if (result.settings) {
        setRecord(result.settings);
        setForm(result.settings.settings);
      }
      setStatus("Security settings saved");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="security-settings-heading">
      <h2 id="security-settings-heading" className="text-xl font-semibold">
        Organization security settings
      </h2>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
        These controls apply to Documentation Agent administration. Values are
        sanitized before persistence and never include secrets.
      </p>
      <p
        className="mt-3 rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
        role="status"
        aria-live="polite"
      >
        Status: {status}
      </p>
      <form
        className="mt-4 grid max-w-xl gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={form.mfaRequired}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                mfaRequired: event.target.checked,
              }))
            }
          />
          Require MFA for privileged Documentation Agent operations
        </label>
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={form.outboundUrlValidationEnabled}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                outboundUrlValidationEnabled: event.target.checked,
              }))
            }
          />
          Validate outbound URLs through the control-plane proxy
        </label>
        <label className="grid gap-1 text-sm">
          Audit retention (days)
          <input
            className={inputClass}
            type="number"
            min={7}
            max={3650}
            value={form.auditRetentionDays}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                auditRetentionDays: Number(event.target.value),
              }))
            }
          />
        </label>
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={form.emergencyOverrideRequiresReason}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                emergencyOverrideRequiresReason: event.target.checked,
              }))
            }
          />
          Emergency override requires a documented reason
        </label>
        <button className={`${buttonClass} justify-self-start`} disabled={busy} type="submit">
          Save settings
        </button>
      </form>
    </section>
  );
}
