# API Reference (Outline)

This document will enumerate every MCP server endpoint, request/response schema, authentication requirements, idempotency behavior, rate limits, and error semantics. The structure will include:

- **Authentication**: API key header, optional wallet signature procedure, nonce rules, example canonical string.
- **Error Envelope**: `code`, `message`, `details`, `correlationId`, `retryable` flag.
- **Endpoints**:
  - `POST /v1/invoices` – create invoice.
  - `GET /v1/invoices/:id` – retrieve invoice.
  - `POST /v1/invoices/:id/cancel` – cancel invoice.
  - `POST /v1/payments` – execute payment (invoice ID or x402 intent).
  - `GET /v1/payments/:id` – fetch payment.
  - `GET /v1/balances/:wallet` – balance query.
  - `POST /v1/webhooks` – register webhook.
  - `GET /v1/webhooks` – list webhooks with pagination.
  - `DELETE /v1/webhooks/:id` – delete webhook.
  - `GET /v1/webhooks/:id/deliveries` – list delivery attempts.
  - `POST /v1/webhooks/verify` – webhook verification challenge response.
  - Support endpoints for health, metrics, readiness.
- **Events & Webhooks**: payload schemas for `invoice.created`, `invoice.expired`, `payment.submitted`, `payment.confirmed`, `webhook.delivery.succeeded`, `webhook.delivery.failed`.
- **Examples**: cURL + SDK usage snippets.

Detailed tables with field descriptions will be completed after DTOs are implemented in shared types.
