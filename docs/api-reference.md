# API Reference (Outline)

> Looking for step-by-step examples? See [API Guide](./api-guide.md) for sample requests and endpoint walk-throughs.

This document will enumerate every MCP server endpoint, request/response schema, authentication requirements, idempotency behavior, rate limits, and error semantics. The structure will include:

- **Authentication**: API key header (`x-api-key`) with optional wallet signature extension.
  - Wallet signature headers: `x-wallet-address`, `x-wallet-signature`, `x-wallet-nonce`, `x-wallet-timestamp`.
  - Canonical string: `<wallet>.<nonce>.<timestamp>.<HTTP_METHOD>.<PATH>.<sha256(body)>` signed using the Solana wallet private key (base58 signatures).
  - Nonces are single-use; replay attempts within `CACHE_NAMESPACE_TTL_NONCE` are rejected.
- **Error Envelope**: `code`, `message`, `details`, `correlationId`, `retryable` flag.
- **Endpoints**:
  - `POST /v1/invoices` – create invoice.
  - `GET /v1/invoices/:id` – retrieve invoice.
  - `POST /v1/invoices/:id/cancel` – cancel invoice.
  - `POST /v1/payments` – execute payment (invoice ID or x402 intent).
  - `GET /v1/payments/:id` – fetch payment.
  - `GET /v1/balances/:wallet` – balance query.
  - `POST /v1/webhooks` – register webhook.
  - `POST /v1/webhooks/:id/verify` – activate webhook registration using verification challenge.
  - `GET /v1/webhooks` – list webhooks with pagination.
  - `DELETE /v1/webhooks/:id` – deactivate webhook.
  - `GET /v1/events/:eventId/deliveries` – inspect delivery attempts for a specific event.
  - `GET /v1/webhooks/dlq` – list outstanding webhook dead-letter entries.
  - `POST /v1/webhooks/dlq/:deadLetterId/replay` – trigger a manual redelivery for a dead-lettered webhook.
  - Support endpoints for health, metrics, readiness.
    - `GET /health/liveness`
    - `GET /health/readiness`
    - `GET /metrics` (Prometheus export, unauthenticated)
- **Events & Webhooks**: payload schemas for `invoice.created`, `invoice.expired`, `payment.submitted`, `payment.confirmed`, `webhook.delivery.succeeded`, `webhook.delivery.failed`.
- **Examples**: cURL + SDK usage snippets (see README `SDK Usage` preview for quickstart).

Detailed tables with field descriptions will be completed after DTOs are implemented in shared types.
