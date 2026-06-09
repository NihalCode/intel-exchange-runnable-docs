import type { Metadata } from "next";
import { AgentChat } from "@/components/AgentChat";

export const metadata: Metadata = {
  title: "AI Agent — Intel Exchange API",
  description:
    "Chat with the Cyware CTIX documentation agent — plan workflows, run API steps, and build deployable apps.",
};

export default function AgentPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Documentation Agent</h1>
      <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
        Chat to plan Cyware CTIX workflows, edit and run API steps, or build full Next.js apps.
        Follow up to refine — the agent keeps conversation context.
      </p>
      <AgentChat />
    </div>
  );
}
