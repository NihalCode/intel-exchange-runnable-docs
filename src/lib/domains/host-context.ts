import "server-only";

import { headers } from "next/headers";

import { parseHostContextHeader, HOST_CONTEXT_HEADER } from "@/lib/domains/host-headers";
import type { ResolvedHostContext } from "@/lib/domains/types";

export async function getResolvedHostContext(): Promise<ResolvedHostContext | null> {
  const headerStore = await headers();
  return parseHostContextHeader(headerStore.get(HOST_CONTEXT_HEADER));
}
