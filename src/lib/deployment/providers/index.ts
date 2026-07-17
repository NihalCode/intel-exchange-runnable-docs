import "server-only";

import { createFakeVercelProvider } from "@/lib/deployment/providers/fake-vercel-provider";
import {
  createHttpVercelProvider,
  isVercelProviderConfigured,
} from "@/lib/deployment/providers/vercel-provider";
import type { VercelProvider } from "@/lib/deployment/providers/types";

export function getVercelProvider(allowedTeamId?: string): VercelProvider {
  if (process.env.VERCEL_PROVIDER_FAKE === "true") {
    return createFakeVercelProvider();
  }
  if (!isVercelProviderConfigured()) {
    return createFakeVercelProvider();
  }
  return createHttpVercelProvider(allowedTeamId);
}
