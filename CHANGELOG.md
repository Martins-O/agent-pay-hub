# Changelog

## Unreleased
- Initial architecture specification and documentation scaffolding.
- Local development bootstrap (Docker Compose, `.env.example` files, Prisma seeding script).
- Server-side Vitest harness with adapter/auth/idempotency coverage.
- GitHub Actions CI pipeline wired to lint, test, and type-check the workspace.
- Dashboard upgraded with invoice creation, payment execution, balance checks, webhook registration, and DLQ replay flows via the SDK.
- SDK now exposes dead-letter listing/replay helpers alongside tests covering the new endpoints.
