# Install & Setup Guide

## Prerequisites

- Node.js 20.x
- pnpm 8.15.4 (the repo is configured with `packageManager: "pnpm@8.15.4"`)
- Docker Desktop (or Docker Engine) with Docker Compose
- Access to the public Solana devnet (default RPC: `https://api.devnet.solana.com`)

## Bootstrap the Workspace

1. Clone the repository and install dependencies:
   ```bash
   pnpm install
   ```
2. Copy the provided environment templates or let the helper script do it for you:
   ```bash
   bash scripts/bootstrap-dev.sh
   ```
   - Copies `.env.example` → `.env` for server, sdk, and dashboard packages if they are missing.
   - Starts Postgres (port 5432) and Redis (port 6379) in Docker.
   - Applies Prisma migrations and seeds a development agent/API key.
3. (Optional) Tear everything down when finished:
   ```bash
   bash scripts/teardown-dev.sh
   ```

## Running the Stack

- Launch all packages in watch mode: `pnpm dev`
- Run only the server: `pnpm --filter @agentpay/server dev`
- The Fastify server listens on `http://localhost:8080`.

## Quality Checks

- Lint all packages: `pnpm lint`
- Execute tests: `pnpm test`
- Type-check everything: `pnpm typecheck`

## Troubleshooting

- **Missing dependencies** – rerun `pnpm install` to restore the workspace `node_modules` directory.
- **Database connection errors** – ensure the Docker containers are running (`docker compose ps`).
- **Regenerate seed credentials** – delete the existing agent record and rerun `pnpm --dir packages/server prisma db seed`.

Refer to `docs/architecture.md` for deeper context on the system design.
