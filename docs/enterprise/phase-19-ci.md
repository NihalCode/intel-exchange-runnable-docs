# Phase 19: CI scaffolding

The GitHub Actions workflow runs on pull requests and pushes to `main` or
`enterprise/**`, using Node.js 20 from `.nvmrc`.

It installs locked dependencies and gates changes with:

- secret scanning (`npm run security:scan-secrets`)
- linting with zero allowed warnings
- TypeScript type-checking
- Vitest unit tests
- a production Next.js build with authentication disabled and no live secrets
