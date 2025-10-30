# AgentPay Hub

AgentPay Hub is an open-source MCP server that enables AI agents to create invoices, execute x402 payment intents, and reconcile Solana devnet payments through a single, well-defined interface. The project is structured as a mono-repo containing the backend server, TypeScript SDK, browser dashboard, and shared type definitions.

## Current Status
- [x] Architecture specification drafted (`docs/architecture.md`).
- [x] Environment variable catalog drafted (`docs/environment.md`).
- [x] Repository scaffolding (`packages/` for server, sdk, dashboard, types).
- [x] Core server foundation (config loader, auth skeleton, rate limiting, health endpoints, persistence schema).
- [x] Invoice, payment, and balance API scaffolding with ledger + idempotency plumbing.
- [ ] Webhook dispatcher, Solana submission/confirmation lifecycle, and ledger projections.
- [ ] SDK, dashboard, webhooks, and Solana integration.
- [ ] Tests, CI, documentation suite, and demo assets.

## Getting Started
Detailed setup instructions, local-run scripts, and documentation will be added as the build progresses. Refer to `docs/architecture.md` for the planned system design.
