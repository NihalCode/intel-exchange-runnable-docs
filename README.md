# Intel Exchange API — Runnable Reference

An unofficial, **runnable** mirror of the [Cyware Intel Exchange API reference](https://ctixapiv3.cyware.com/intel-exchange-api-reference/intel-exchange-api-reference).
Every code block keeps its original highlighted source **and** gets a control to
run it directly in the browser — no copy/paste required.

## Features

- **Central code renderer** — every snippet (Markdown fences + generated endpoint
  examples) flows through one `CodeBlock` component (`src/components/CodeBlock.tsx`),
  so runnable behavior is implemented globally, not per page.
- **Syntax highlighting + copy button** on every block (highlight.js, GitHub Dark).
- **Run controls by snippet type:**
  - **cURL / HTTP / API requests** → parsed (method, URL, headers, body) and executed
    through a secure server-side proxy (`/api/run`). Direct browser `fetch` is also
    possible for CORS-enabled hosts.
  - **JSON** → **Validate / Format** instead of Run.
  - **JavaScript** → executed in a sandboxed `<iframe>` (`allow-scripts`, no
    same-origin, no `eval` in the app context).
  - **Python** → shows _"Python snippets are not runnable in this browser
    environment yet."_
  - **Non-curl shell** → shows a note (browsers can't run shell).
- **Security**
  - Mutating methods (POST/PUT/PATCH/DELETE) require an explicit **confirmation**.
  - API keys / bearer tokens / `Authorization` / placeholder credentials get
    **password inputs**; secrets live in memory only (**never** localStorage).
  - Secrets are **masked** in request previews, output, and logs.
  - Output is rendered as **text only** (no `dangerouslySetInnerHTML`) → XSS-safe.
  - The proxy enforces an **SSRF allowlist** (blocks localhost/private/link-local IPs),
    a 20s timeout, and a 2 MB response cap.
- **Loading / output / error** states render directly beneath each snippet.

## Content pipeline

The docs content is vendored from the source site's published `.md` export
(`/<project>/llms.txt` → 527 per-page `.md` files):

```bash
npm run ingest   # fetch + normalize -> src/content/pages/*.json + manifest.json
```

The ingested JSON is committed, so the site builds fully offline. Re-run `ingest`
to refresh from upstream (a local-only re-clean is available via
`node scripts/clean-local.mjs`).

## Develop

```bash
npm install
npm run dev      # http://localhost:3000
```

## Build

```bash
npm run build
npm run start
```

## Deploy (Vercel)

This is a standard Next.js app and deploys to Vercel with zero config:

```bash
# one-off CLI deploy
npx vercel --prod

# or with a token (non-interactive / CI)
npx vercel --prod --yes --token "$VERCEL_TOKEN"
```

The only server component is the `/api/run` proxy (Node.js runtime); all 531 doc
pages are statically generated.
