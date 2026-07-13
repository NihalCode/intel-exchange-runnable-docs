"use client";

import { useAdmin, ENVIRONMENTS } from "@/components/admin/context/AdminContext";
import { inputClass } from "@/components/admin/ui/tokens";
import type { EnterpriseEnvironment } from "@/lib/enterprise/types";

export function EnvironmentSelector() {
  const { selectedEnvironment, setEnvironment } = useAdmin();

  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="hidden text-zinc-500 sm:inline">Environment</span>
      <select
        className={`${inputClass} py-1.5 text-xs`}
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
      className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
      role="status"
    >
      Production environment — changes may affect live Documentation Agent resources.
    </div>
  );
}
