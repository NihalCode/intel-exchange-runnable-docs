import type { AgentAppBlueprint, AgentStepResult } from "./types";
import {
  packageJson,
  tsconfigJson,
  nextConfig,
  appLayout,
  envExample,
  clientFile,
} from "./app-builder-boilerplate";
import { defaultGlobalsCss } from "./app-builder-css";
import {
  routeForStep,
  searchRoute,
  createIntelRoute,
  phishingFrontend,
  genericFrontend,
  readme,
} from "./app-builder-routes";

export {
  defaultGlobalsCss,
  uploadListCss,
  themeSwitcherCss,
  phishingGlobalsCss,
  themeAwareGlobalsCss,
} from "./app-builder-css";

export function generateAppBlueprint(
  query: string,
  title: string,
  description: string,
  steps: AgentStepResult[]
): AgentAppBlueprint {
  const appSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const isPhishing = /phishing|email/i.test(query);

  const architecture = [
    "Browser (React UI)",
    "  ↓ fetch /api/cyware/*",
    "Next.js API Routes (server)",
    "  ↓ HMAC-signed requests",
    "Cyware Intel Exchange Open API",
  ].join("\n");

  const boilerplate = [
    { path: "package.json", language: "json", description: "Project dependencies and scripts", code: packageJson(appSlug) },
    { path: "tsconfig.json", language: "json", description: "TypeScript configuration", code: tsconfigJson() },
    { path: "next.config.ts", language: "typescript", description: "Next.js configuration", code: nextConfig() },
    { path: "app/layout.tsx", language: "typescript", description: "Root layout with metadata", code: appLayout(title) },
    { path: "app/globals.css", language: "css", description: "Global styles", code: defaultGlobalsCss() },
    { path: ".env.example", language: "bash", description: "Environment variables template", code: envExample() },
    { path: "lib/cyware/client.ts", language: "typescript", description: "Reusable Cyware API client with HMAC auth", code: clientFile() },
  ];

  const stepRoutes = steps.map((step) => ({
    path: `app/api/cyware/${step.slug.replace(/\//g, "-")}/route.ts`,
    language: "typescript",
    description: `${step.method} ${step.spec.path} — ${step.title}`,
    code: routeForStep(step),
  }));

  const extraRoutes = isPhishing
    ? [
        { path: "app/api/cyware/search/route.ts", language: "typescript", description: "IOC lookup in Cyware threat data", code: searchRoute() },
        { path: "app/api/cyware/create-intel/route.ts", language: "typescript", description: "Create new intel for unknown IOCs", code: createIntelRoute() },
      ]
    : [];

  const frontend = {
    path: "app/page.tsx",
    language: "typescript",
    description: isPhishing ? "Phishing analyzer UI with IOC extraction + Cyware lookup" : "Workflow runner UI",
    code: isPhishing ? phishingFrontend(title) : genericFrontend(title, steps),
  };

  const files = [...boilerplate, ...stepRoutes, ...extraRoutes, frontend, {
    path: "README.md",
    language: "markdown",
    description: "Setup and deployment instructions",
    code: readme(title, steps),
  }];

  return {
    title,
    description,
    architecture,
    setupInstructions:
      "1. Copy .env.example → .env.local and add your Cyware credentials. 2. npm install && npm run dev. 3. For production: deploy to Vercel and set the 3 env vars in Project Settings.",
    envExample: envExample(),
    files,
  };
}

export function appTitleFromQuery(query: string): string {
  if (/phishing/i.test(query)) return "Phishing Email Analyzer";
  if (/stix/i.test(query)) return "STIX Import Portal";
  if (/threat.*dashboard|dashboard.*threat/i.test(query)) return "Threat Intel Dashboard";
  const m = query.match(/build\s+(?:a\s+)?(.{3,60}?)(?:\s+app|\s+website|\s+dashboard|$)/i);
  if (m?.[1]) return m[1].replace(/\b\w/g, (c) => c.toUpperCase()).trim();
  return "Cyware Integration App";
}
