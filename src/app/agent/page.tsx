import type { Metadata } from "next";
import { AgentChat } from "@/components/AgentChat";

export const metadata: Metadata = {
  title: "AI Agent — Intel Exchange API",
  description:
    "Describe your Cyware CTIX workflow in plain English and get documented endpoints with runnable code.",
};

export default function AgentPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Documentation Agent</h1>
      <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
        Describe what you want to do with the Intel Exchange API. The agent searches the
        official docs mirror, plans a workflow from real endpoints only, and generates runnable
        code you can execute with your tenant credentials.
      </p>
      <AgentChat />
    </div>
  );
}
