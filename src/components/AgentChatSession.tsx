"use client";

import type { ReactNode } from "react";
import { AgentChatProvider } from "./agent-chat-state";

/** Client wrapper so the root layout can keep agent chat state across route changes. */
export function AgentChatSession({ children }: { children: ReactNode }) {
  return <AgentChatProvider>{children}</AgentChatProvider>;
}
