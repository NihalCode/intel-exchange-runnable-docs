/** Deploy credentials kept in memory for the browser session (never localStorage). */

export interface AgentDeploySettings {
  vercelToken: string;
  baseUrl: string;
  accessId: string;
  secretKey: string;
}

const EMPTY: AgentDeploySettings = {
  vercelToken: "",
  baseUrl: "",
  accessId: "",
  secretKey: "",
};

let memory: AgentDeploySettings = { ...EMPTY };

export function loadDeploySettings(): AgentDeploySettings {
  return { ...memory };
}

export function saveDeploySettings(partial: Partial<AgentDeploySettings>): void {
  memory = { ...memory, ...partial };
}

export function clearDeploySettings(): void {
  memory = { ...EMPTY };
}

export function hasDeploySettings(): boolean {
  const s = memory;
  return Boolean(s.vercelToken && s.baseUrl && s.accessId && s.secretKey);
}
