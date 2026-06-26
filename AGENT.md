# Cyware AI Agent

The **AI Agent** at [`/agent`](http://localhost:3000/agent) is a unified, chat-first workspace for non-technical users and developers. You describe what you want in plain English; the agent decides internally whether to retrieve documentation, generate API snippets, plan workflows, build apps, or explain code.

## Unified workspace (no mode tabs)

Run Workflow and Build App are merged into one interface:

- **Left:** chat history (multiple chats, rename, delete)
- **Center:** conversation + quick-start suggestions
- **Right:** project panel (files, preview, deploy, commit, activity log)

You do not choose “workflow” vs “app” — the agent routes from your message.

## OpenAI configuration (server-side only)

The AI Agent uses **`OPENAI_API_KEY` from server environment variables** — clients never enter or see an OpenAI key.

- Local: add to `.env.local` (see `.env.example`)
- Production: Vercel → Project → Environment Variables (no `NEXT_PUBLIC_` prefix)
- Status: `GET /api/agent/status` (configured/missing only)
- Developer console diagnostics show **OpenAI API Key: Configured / Missing**

If the key is missing, clients see: *“The AI Agent is not configured yet. Please contact the workspace administrator.”*

## Quick starts

Try prompts like:

- “Build me a dashboard that shows threat intel alerts”
- “Fetch the API snippet for creating an Orchestrate workflow”
- “Explain this code like I am not a developer”
- “Add a filter” / “Make the UI cleaner” (when a project exists)

## Chat history

Chats persist in your browser (`localStorage` key `cyware-agent-workspace-v1`). Each chat keeps:

- Messages and assistant responses
- Linked saved app / generated files
- Selected file, deploy notes, activity log

Start **New** in the sidebar without losing other chats. Switch back anytime to resume app-building work.

## API snippets (all products)

Retrieval uses ingested docs for **CTIX**, **CSAP**, **Orchestrate**, and **CFTR**, plus Postman-derived indexes and Pinecone/BM25 fallback. Responses cite sources with product labels. Example code uses placeholders only (`<BASE_URL>`, `<ACCESS_ID>`, etc.) — never real credentials.

## Plain-English explanations

Ask “explain simply” or “like I’m not a developer” to get an **In simple terms** section covering what the code does, what you need, what you get, and what could go wrong.

## App building

The agent can scaffold small Next.js apps (dashboards, forms, search tools, etc.) with UI, API routes, placeholder auth, and README. Edit through chat; files appear in the **Project** panel.

## Preview

- **Project → Preview** opens a plain-English walkthrough of the app.
- Full interactive preview requires `npm run dev` locally or **Deploy**.
- In public documentation mode, preview messaging indicates **sample/mock data** when live credentials are unavailable.

## Deploy

**Project → Deploy** opens the Vercel deploy dialog (developer credentials). Non-technical users are not asked for secrets in normal chat; deployment uses the existing `/api/agent/deploy` flow.

## Commit

**Project → Commit** calls `POST /api/agent/commit`, protected by `DEVELOPER_ACCESS_TOKEN`. Without developer access, you get a clear message and a suggested commit message; download the zip to commit locally.

Optional: set `ENABLE_AGENT_GIT_COMMIT=true` on a developer machine for future automated commits.

## Developer-only actions

| Action | Requirement |
|--------|-------------|
| Live API Run (docs pages) | `NEXT_PUBLIC_ENABLE_LIVE_API_UI=true` |
| Deploy to Vercel | Vercel token + Cyware env in deploy dialog |
| Git commit via API | `DEVELOPER_ACCESS_TOKEN` |
| Developer console | `/developer` + server token |

Normal documentation and snippet generation work **without** credentials.

## Tests

```bash
npm test -- src/lib/__tests__/agent-workspace.test.ts
npm test -- src/lib/__tests__/agent-capabilities.test.ts
```

## Architecture notes

- Intent routing: `src/lib/agent/intent.ts`
- Workspace persistence: `src/lib/agent/workspace-client.ts`
- Orchestration: `src/lib/agent/orchestrate.ts`
- UI: `src/components/AgentChat.tsx`, `AgentChatSidebar.tsx`, `AgentProjectPanel.tsx`

Existing `/docs/*` documentation, runnable snippets, and the developer console are unchanged.
