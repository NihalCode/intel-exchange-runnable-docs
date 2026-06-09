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
        Describe a Cyware CTIX task or full app in plain English. The agent maps your request to
        documented endpoints, lets you edit path/query/body parameters like the docs playground,
        run each step in sequence, and (in Build app mode) generates a Next.js scaffold with secure
        backend routes — credentials stay in environment variables, never in frontend code.
      </p>
      <AgentChat />
    </div>
  );
}
