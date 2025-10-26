# Repository Guidelines

## Project Structure & Module Organization
- `packages/` hosts the active workspaces (`scanner`, `api`, `rules-engine`, `ui`, etc.); each ships its own `package.json`, `tsconfig.json`, and `src/`.
- `src/` contains legacy language corpora used by the scanner; treat it as read-only reference data.
- `tests/` is split into `unit/`, `e2e/`, and `goldsets/` fixtures; prefer colocating new package tests under their workspace as well.
- `docs/`, `specs/`, and the Japanese design notes capture architecture and product requirements—review before major changes.

## Build, Test, and Development Commands
- `npm run build` executes the workspace build pipeline (currently `packages/scanner` via `tsc -p tsconfig.json`).
- `npm test` runs `tsc --noEmit` type checking and then the Vitest suite; use this before every push.
- `npm run unit` focuses on package-level unit tests; `npm run -w packages/scanner dev` starts the CLI with ts-node for iterative work.

## Coding Style & Naming Conventions
- TypeScript targets ES2022 with strict mode enabled (`tsconfig.base.json`); keep compiler warnings at zero.
- Use two-space indentation, double quotes, and trailing commas where TypeScript’s formatter would keep them; avoid Prettier overrides.
- Favor `camelCase` for variables/functions, `PascalCase` for types/classes, and kebab-case file names inside workspaces.
- Exported API shapes live in `types.ts` files; update barrel exports when adding new types.

## Testing Guidelines
- Unit tests rely on Vitest; name files `*.test.ts` alongside implementation or under `tests/unit`.
- Goldset fixtures drive regression checks—update snapshots thoughtfully and document reasoning in the PR.
- Aim to cover new branches and error paths; add integration coverage under `tests/e2e` when touching multi-package flows.

## Commit & Pull Request Guidelines
- Follow Conventional Commits (`feat(scanner): add git diff support`); wrap subject lines at ~72 chars and keep commits scoped.
- Reference related specs or docs in the body; include short bullet lists of noteworthy changes where helpful.
- PRs should describe intent, testing performed (`npm test`, targeted scripts), and attach CLI output or screenshots if UI assets change.
- Request reviews from domain owners noted in `codex.yml`; keep PRs focused to ease review and backports.

## Agent Workflow Tips
- Run commands from the repo root to respect workspace tooling; avoid editing `dist/` or `node_modules/`.
- Capture temporary artifacts in `tmp/` and clean them before opening a PR to keep diffs minimal.
- After any WSL/VM reboot, start backend services with `docker compose up -d neo4j opensearch` and confirm with `docker compose ps` before running dependent scripts.
