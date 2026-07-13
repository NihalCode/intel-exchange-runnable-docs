/**
 * PLACEHOLDER — mock data for admin screens without backend APIs yet.
 * Do not treat these values as production telemetry.
 */

import type { EnterpriseEnvironment } from "@/lib/enterprise/types";

export interface MockMetric {
  label: string;
  value: string;
  change: string;
  trend: "up" | "down" | "flat";
  sparkline: number[];
}

export interface MockHealthService {
  name: string;
  status: "healthy" | "degraded" | "down";
  latencyMs: number;
  lastChecked: string;
}

export interface MockActivityItem {
  id: string;
  action: string;
  actor: string;
  environment: EnterpriseEnvironment;
  timestamp: string;
  placeholder?: boolean;
}

export interface MockSupportIntegration {
  id: string;
  name: string;
  category: string;
  status: "connected" | "pending" | "error";
  lastSync: string;
}

export interface MockSupportChannel {
  id: string;
  name: string;
  type: "email" | "chat" | "slack" | "teams";
  status: "active" | "paused";
  volume24h: number;
}

export interface MockSupportResponse {
  id: string;
  title: string;
  category: string;
  usageCount: number;
  updatedAt: string;
}

export interface MockRateLimit {
  id: string;
  name: string;
  environment: EnterpriseEnvironment;
  limit: number;
  window: string;
  current: number;
}

export interface MockRole {
  id: string;
  name: string;
  members: number;
  permissions: number;
  system: boolean;
}

export interface MockServiceAccount {
  id: string;
  name: string;
  role: string;
  lastUsed: string | null;
  status: "active" | "disabled";
}

export interface MockDocSource {
  id: string;
  name: string;
  type: "openapi" | "markdown" | "postman";
  environment: EnterpriseEnvironment;
  lastSync: string;
  status: "synced" | "pending" | "error";
}

export interface MockWebhook {
  id: string;
  url: string;
  events: string[];
  environment: EnterpriseEnvironment;
  status: "active" | "disabled";
}

export const MOCK_OVERVIEW_METRICS: MockMetric[] = [
  {
    label: "API requests (24h)",
    value: "128.4K",
    change: "+12%",
    trend: "up",
    sparkline: [40, 52, 48, 61, 58, 72, 68, 80, 76, 88, 84, 92],
  },
  {
    label: "Active resources",
    value: "24",
    change: "+2",
    trend: "up",
    sparkline: [18, 18, 19, 20, 20, 21, 22, 22, 23, 23, 24, 24],
  },
  {
    label: "Pending changes",
    value: "3",
    change: "−1",
    trend: "down",
    sparkline: [5, 4, 4, 5, 4, 3, 4, 3, 3, 3, 3, 3],
  },
  {
    label: "Failed jobs (7d)",
    value: "2",
    change: "0",
    trend: "flat",
    sparkline: [1, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0],
  },
];

export const MOCK_HEALTH_SERVICES: MockHealthService[] = [
  {
    name: "Control plane API",
    status: "healthy",
    latencyMs: 42,
    lastChecked: new Date().toISOString(),
  },
  {
    name: "Documentation sync worker",
    status: "healthy",
    latencyMs: 118,
    lastChecked: new Date().toISOString(),
  },
  {
    name: "Support agent gateway",
    status: "degraded",
    latencyMs: 340,
    lastChecked: new Date().toISOString(),
  },
  {
    name: "Webhook delivery",
    status: "healthy",
    latencyMs: 89,
    lastChecked: new Date().toISOString(),
  },
];

export function mockActivityFeed(): MockActivityItem[] {
  const now = Date.now();
  return [
    {
      id: "mock-1",
      action: "Documentation source indexed",
      actor: "system",
      environment: "production",
      timestamp: new Date(now - 3600_000).toISOString(),
      placeholder: true,
    },
    {
      id: "mock-2",
      action: "Support integration health check",
      actor: "system",
      environment: "staging",
      timestamp: new Date(now - 7200_000).toISOString(),
      placeholder: true,
    },
    {
      id: "mock-3",
      action: "Rate limit threshold adjusted",
      actor: "admin@example.com",
      environment: "production",
      timestamp: new Date(now - 86400_000).toISOString(),
      placeholder: true,
    },
  ];
}

export const MOCK_SUPPORT_INTEGRATIONS: MockSupportIntegration[] = [
  {
    id: "int-1",
    name: "ServiceNow",
    category: "Ticketing",
    status: "connected",
    lastSync: "2026-07-13T10:00:00Z",
  },
  {
    id: "int-2",
    name: "Slack",
    category: "Messaging",
    status: "connected",
    lastSync: "2026-07-13T09:45:00Z",
  },
  {
    id: "int-3",
    name: "Zendesk",
    category: "Support",
    status: "pending",
    lastSync: "—",
  },
];

export const MOCK_SUPPORT_CHANNELS: MockSupportChannel[] = [
  { id: "ch-1", name: "Email support", type: "email", status: "active", volume24h: 142 },
  { id: "ch-2", name: "In-app chat", type: "chat", status: "active", volume24h: 89 },
  { id: "ch-3", name: "#support-alerts", type: "slack", status: "paused", volume24h: 0 },
];

export const MOCK_SUPPORT_RESPONSES: MockSupportResponse[] = [
  {
    id: "resp-1",
    title: "Password reset instructions",
    category: "Account",
    usageCount: 234,
    updatedAt: "2026-07-10T14:00:00Z",
  },
  {
    id: "resp-2",
    title: "API rate limit exceeded",
    category: "Technical",
    usageCount: 156,
    updatedAt: "2026-07-11T09:30:00Z",
  },
];

export const MOCK_RATE_LIMITS: MockRateLimit[] = [
  {
    id: "rl-1",
    name: "Control plane mutations",
    environment: "production",
    limit: 30,
    window: "1 min",
    current: 12,
  },
  {
    id: "rl-2",
    name: "Documentation sync",
    environment: "staging",
    limit: 100,
    window: "1 hour",
    current: 34,
  },
];

export const MOCK_ROLES: MockRole[] = [
  { id: "role-1", name: "Owner", members: 2, permissions: 16, system: true },
  { id: "role-2", name: "Admin", members: 5, permissions: 16, system: true },
  { id: "role-3", name: "Developer", members: 12, permissions: 9, system: true },
];

export const MOCK_SERVICE_ACCOUNTS: MockServiceAccount[] = [
  {
    id: "sa-1",
    name: "ci-deploy-bot",
    role: "Developer",
    lastUsed: "2026-07-12T18:00:00Z",
    status: "active",
  },
  {
    id: "sa-2",
    name: "monitoring-agent",
    role: "Admin",
    lastUsed: null,
    status: "disabled",
  },
];

export const MOCK_DOC_SOURCES: MockDocSource[] = [
  {
    id: "src-1",
    name: "CTIX OpenAPI",
    type: "openapi",
    environment: "production",
    lastSync: "2026-07-13T08:00:00Z",
    status: "synced",
  },
  {
    id: "src-2",
    name: "Theneo export",
    type: "markdown",
    environment: "staging",
    lastSync: "2026-07-12T22:00:00Z",
    status: "pending",
  },
];

export const MOCK_WEBHOOKS: MockWebhook[] = [
  {
    id: "wh-1",
    url: "https://hooks.example.com/docs-sync",
    events: ["sync.completed", "change.activated"],
    environment: "production",
    status: "active",
  },
  {
    id: "wh-2",
    url: "https://hooks.example.com/staging",
    events: ["change.submitted"],
    environment: "staging",
    status: "disabled",
  },
];

export const MOCK_SUPPORT_ANALYTICS = {
  resolutionRate: 87,
  avgResponseMin: 4.2,
  satisfaction: 4.6,
  volumeTrend: [120, 135, 128, 142, 138, 155, 149, 162, 158, 170, 165, 178],
};

export const PLACEHOLDER_NOTICE =
  "Placeholder data — backend integration pending. Values shown for layout preview only.";
