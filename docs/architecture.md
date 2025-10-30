# AgentPay Hub Architecture

## Overview
AgentPay Hub is an MCP-compliant payment orchestration server that exposes a unified API for AI agents to create invoices, execute x402-compliant Solana payments, and consume webhook events. The system is designed as a mono-repo with clearly separated packages for the backend server, TypeScript SDK, minimal dashboard, and shared types. All components are wired together through a local event bus and persistent ledger while remaining loosely coupled via domain interfaces.

## Component Map
- **MCP Server (`packages/server`)**
  - HTTP/REST entry point with optional WebSocket streaming for live events.
  - Modules: `AgentAuth`, `PaymentsCore`, `LedgerDB`, `EventBus`, `WebhookDispatcher`, `SolanaAdapter`, `x402Adapter`, `Observability`.
  - Responsibilities: authentication, request validation, rate limiting, error envelope, orchestration of payment flows, persistence, metrics, logging, tracing, health signaling.
- **SDK (`packages/sdk`)**
  - TypeScript client library that provides typed wrappers for every public API endpoint, handles retries, idempotency helpers, and includes a webhook signature verifier.
- **Dashboard (`packages/dashboard`)**
  - Browser application for agents/operators to authenticate, create invoices, review payment status, and inspect webhook delivery attempts.
- **Shared Types (`packages/types`)**
  - Central definitions for DTOs, enums, and schema contracts reused by server, SDK, and dashboard.

## Core Services
### AgentAuth
- Validates API keys (hashed in storage) and optional wallet signatures using nonce and timestamp headers.
- Enforces per-key scopes and rate-limiting buckets with sliding-window configuration.
- Issues correlation IDs per request for traceability.

### PaymentsCore
- Accepts invoice and payment actions.
- Delegates to `x402Adapter` for intent parsing and serialization.
- Orchestrates Solana simulations and submissions via `SolanaAdapter`.
- Emits domain events to `EventBus` for ledger updates and webhook dispatching.

### LedgerDB
- Backed by Postgres with migration-managed schema.
- Tables: `agents`, `invoices`, `payments`, `webhook_registrations`, `delivery_attempts`, `audit_logs`, `events`.
- Guarantees write-ahead logging for auditability and immutable payment records.

### EventBus & Observability
- In-process publish/subscribe abstraction with typed topics for invoices, payments, webhooks.
- Metrics exporters (Prometheus format) and structured JSON logs with correlation IDs.
- Trace spans covering HTTP handlers, adapters, and datastore interactions.

### WebhookDispatcher
- Manages registration verification challenges, signed callbacks, exponential backoff, and dead-letter queue (DLQ) behavior persisted in `delivery_attempts`.
- Provides admin APIs to enumerate attempts and manual replay hooks.

### Adapters
- **x402Adapter**: Validates, normalizes, and generates x402 payment intents; rejects malformed inputs with detailed error codes.
- **SolanaAdapter**: Handles keypair guidance, transaction assembly, simulation-before-submit policy, confirmation polling to configured commitment levels, and error mapping from RPC responses to domain error envelopes.

## Data Flow Summary
1. Agent authenticates via API key (and optional wallet signature) with nonce replay protection.
2. Invoice creation persists ledger records, generates x402 intent + QR-ready URI, and emits `invoice.created` event.
3. Payment execution simulates against Solana devnet, submits upon success, stores payment record, and emits `payment.submitted` & `payment.confirmed` events.
4. Webhook dispatcher consumes events, signs payloads with HMAC, delivers with retries and DLQ tracking.
5. Dashboard subscribes to event stream or polls the server to display live status; SDK handles the client interactions.

## Reliability & Performance
- All APIs target sub-1s latency excluding Solana confirmation by leveraging simulation caching and asynchronous confirmation tracking.
- Idempotency enforced via unique ULID request IDs stored with invoices/payments.
- Rate limiting and circuit-breaking guard against RPC outages; metrics feed into readiness probes and CI smoke tests.

## Deployment & Operations
- Dev/test orchestrated through a single local-run script that brings up Postgres, Redis (for nonce/rate limit caching), seeds dev agents, funds Solana devnet wallets, and launches server + SDK watcher + dashboard.
- CI pipeline executes format/lint/type-check/build/test/coverage steps, builds container images, and publishes SDK artifacts to the local registry.
- Observability stack exposes logs, metrics, health endpoints, and traces suitable for deployment monitors.

## Security Posture
- Secrets managed via environment variables; never persisted in logs.
- STRIDE threat model documented under `docs/security-notes.md`.
- Clear separation of hot (dev) vs. guidance for cold keys; documentation warns against production custody.
- Webhooks signed with HMAC including timestamp and nonce to prevent replay.

## Future Enhancements
- Multi-RPC failover for Solana adapter, streaming WebSocket for live dashboards, and advanced analytics dashboard modules.
