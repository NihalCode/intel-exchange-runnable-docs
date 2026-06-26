import type { Metadata } from "next";
import { AgentChat } from "@/components/AgentChat";

export const metadata: Metadata = {
  title: "AI Agent — Cyware API Docs",
  description:
    "Unified Cyware AI Agent — ask in plain English, fetch API snippets, build apps, preview, deploy, and explain code.",
};

export default function AgentPage() {
  return (
    <div className="mx-auto max-w-[1600px]">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Cyware AI Agent</h1>
      <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
        One workspace for questions, API examples, app building, and plain-English explanations across
        CTIX, CSAP, Orchestrate, and CFTR.
      </p>
      <AgentChat />
    </div>
  );
}
