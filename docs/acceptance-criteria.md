# Acceptance Criteria Overview

This document consolidates the hackathon acceptance criteria for quick reference during implementation.

## MCP Server
- All documented endpoints respond with JSON payloads matching shared DTOs.
- Authentication via API key and optional wallet signature with nonce.
- Consistent error envelope; clear differentiation between client, transient, and chain errors.
- Idempotency enforced for invoice creation and payment execution.
- Structured logs, metrics, readiness/liveness endpoints in place.

## x402 Integration
- Intent encoding/decoding, strict validation, normalized output.
- Reject malformed or unsupported intents with precise error codes.

## Solana Integration
- Simulate before submit; support devnet configuration.
- Return transaction signatures, slots, and confirmation status to configured commitment.

## Ledger Store
- Durable storage of invoices, payments, balances, webhook registrations, delivery attempts, audit logs.
- Immutable records with timestamps, status transitions, actor IDs.

## Webhooks
- Registration, verification, signed deliveries, retry with exponential backoff, DLQ visibility.
- HMAC signature reproducible by consumers; timestamp and nonce for replay defense.

## SDK
- Typed wrappers for each endpoint with retries and idempotency helpers.
- Webhook signature verification helper included.

## Dashboard
- Auth (API key/session) flow, create invoice, observe payment status, view webhook delivery logs.
- Minimal but functional UI optimized for clarity.

## Testing & CI
- Unit, integration, chain, SDK, dashboard E2E tests with coverage thresholds.
- Fuzz/property tests for canonicalization and memo handling.
- CI pipeline blocking on lint, type check, build, tests, coverage, container smoke, SDK artifact publish.

## Documentation & Demo
- README, INSTALL, API Reference, Architecture, Security Notes, Contributing, Changelog.
- Demo script and recorded walkthrough.
- Environment templates and local run script instructions.
- Submission checklist including devnet addresses, reproducible steps, and issue list with next steps.
