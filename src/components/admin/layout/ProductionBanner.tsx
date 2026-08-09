"use client";

import { useAdmin, ENVIRONMENTS } from "@/components/admin/context/AdminContext";
import { inputClass } from "@/components/admin/ui/tokens";
import type { EnterpriseEnvironment } from "@/lib/enterprise/types";

export function EnvironmentSelector() {
  const { selectedEnvironment, setEnvironment } = useAdmin();

  return (
    <label className="flex items-center gap-1.5 text-[11px]">
      <span className="atlas-micro-label hidden !inline sm:inline">Environment</span>
      <select
        className={`${inputClass} rounded-[var(--radius-sm)] py-1 text-[11px]`}
        value={selectedEnvironment}
        onChange={(e) => setEnvironment(e.target.value as EnterpriseEnvironment)}
        aria-label="Select environment"
      >
        {ENVIRONMENTS.map((env) => (
          <option key={env} value={env}>
            {env.charAt(0).toUpperCase() + env.slice(1)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ProductionBanner() {
  const { selectedEnvironment } = useAdmin();
  if (selectedEnvironment !== "production") return null;

  return (
    <div
      className="border-b border-[color-mix(in_srgb,var(--atlas-amber)_45%,transparent)] bg-[color-mix(in_srgb,var(--atlas-amber)_14%,var(--atlas-elevated))] px-4 py-1.5 text-center font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--atlas-amber)]"
      role="status"
    >
      Production environment — changes may affect live Documentation Agent resources.
    </div>
  );
}
