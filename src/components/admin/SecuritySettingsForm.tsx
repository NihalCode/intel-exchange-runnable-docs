"use client";

import { useState } from "react";

import { SignalButton, SignalCheckbox, SignalInput } from "@/components/fabric";
import type { OrganizationSecuritySettings } from "@/lib/enterprise/security-settings";
import type { SecuritySettingsRecord } from "@/lib/enterprise/security-settings";

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
    <section
      aria-labelledby="security-settings-heading"
      className="rounded-[var(--radius-sm)] border border-[var(--atlas-line)] border-l-2 border-l-[var(--atlas-amber)] bg-[color-mix(in_srgb,var(--atlas-elevated)_90%,transparent)] p-4"
      data-layout="sf-security-policy-form"
    >
      <p className="atlas-micro-label text-[var(--atlas-amber)]">Policy controls</p>
      <h2
        id="security-settings-heading"
        className="mt-1 text-sm font-semibold text-[var(--atlas-text)]"
      >
        Organization security settings
      </h2>
      <p className="mt-2 text-sm text-[var(--atlas-text-secondary)]">
        These controls apply to Documentation Agent administration. Values are sanitized before
        persistence and never include secrets.
      </p>
      <p
        className="mt-3 rounded-[var(--radius-sm)] border border-[var(--atlas-line)] bg-[var(--surface-sunken)] px-3 py-2 text-sm text-[var(--atlas-text-secondary)]"
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
        <SignalCheckbox
          checked={form.mfaRequired}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              mfaRequired: event.target.checked,
            }))
          }
          label="Require MFA for privileged Documentation Agent operations"
        />
        <SignalCheckbox
          checked={form.outboundUrlValidationEnabled}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              outboundUrlValidationEnabled: event.target.checked,
            }))
          }
          label="Validate outbound URLs through the control-plane proxy"
        />
        <SignalInput
          label="Audit retention (days)"
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
        <SignalCheckbox
          checked={form.emergencyOverrideRequiresReason}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              emergencyOverrideRequiresReason: event.target.checked,
            }))
          }
          label="Emergency override requires a documented reason"
        />
        <SignalButton type="submit" disabled={busy} loading={busy} className="justify-self-start">
          Save settings
        </SignalButton>
      </form>
    </section>
  );
}
