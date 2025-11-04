# AgentPay API Guide

This guide walks through the core HTTP APIs exposed by the AgentPay Hub server. It explains authentication requirements, the purpose of each endpoint, and how to exercise them from the CLI. All examples assume the server is running locally on `http://localhost:8080` and that you have seeded an agent API key (see `packages/server/prisma/seed.mjs`).

> **Authentication**
>
> - Add your agent key in the `x-api-key` header for every non-public route.
> - Some POST endpoints require an `Idempotency-Key` header to guarantee safe retries.
> - The optional wallet-signature headers (`x-wallet-address`, `x-wallet-signature`, `x-wallet-nonce`, `x-wallet-timestamp`) allow the server to verify requests on behalf of end-user wallets.

## Health & Metrics

| Method | Path                  | Purpose                              |
|--------|-----------------------|--------------------------------------|
| GET    | `/health/liveness`    | Returns `200` when the process is up |
| GET    | `/health/readiness`   | Verifies database + Redis connectivity |
| GET    | `/metrics`            | Prometheus-compatible metrics feed   |

```bash
curl http://localhost:8080/health/liveness
```

Readiness responds with a `checks` object. Any failure returns `503` so you can wire it into container orchestrators.

## Invoices

Endpoints defined in `packages/server/src/routes/invoices.ts`:

| Method | Path                           | Notes |
|--------|--------------------------------|-------|
| POST   | `/v1/invoices`                 | Create a new invoice (requires `Idempotency-Key`) |
| GET    | `/v1/invoices/:invoiceId`      | Fetch invoice details |
| POST   | `/v1/invoices/:invoiceId/cancel` | Cancel an open/draft invoice |

Create example:

```bash
IDEMPOTENCY_KEY=$(uuidgen)
curl -X POST http://localhost:8080/v1/invoices \
  -H "x-api-key: $AGENTPAY_API_KEY" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "recipientWalletAddress": "F62i8C3CshnB6a2EePxX61fNULmKM2SUkieJgP6FkERZ",
    "amount": "1.25",
    "assetSymbol": "USDC",
    "memo": "Demo invoice"
  }'
```

The response wraps the invoice object: `{ "invoice": { ... } }`. Reusing the same `Idempotency-Key` returns the cached response.

Fetch example:

```bash
curl -H "x-api-key: $AGENTPAY_API_KEY" \
  http://localhost:8080/v1/invoices/<INVOICE_ID>
```

Cancel example:

```bash
curl -X POST -H "x-api-key: $AGENTPAY_API_KEY" \
  http://localhost:8080/v1/invoices/<INVOICE_ID>/cancel
```

## Payments & Balances

Implemented in `packages/server/src/routes/payments.ts` and `packages/server/src/routes/balances.ts`:

| Method | Path                      | Notes |
|--------|---------------------------|-------|
| POST   | `/v1/payments`            | Execute or simulate a payment (requires `Idempotency-Key`) |
| GET    | `/v1/payments/:paymentId` | Retrieve payment status |
| GET    | `/v1/balances/:wallet`    | Query latest observed balance (`asset` query param required) |

Payment execution example (simulation mode):

```bash
IDEMPOTENCY_KEY=$(uuidgen)
curl -X POST http://localhost:8080/v1/payments \
  -H "x-api-key: $AGENTPAY_API_KEY" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "invoiceId": "<INVOICE_ID>",
    "simulateOnly": true
  }'
```

If `simulateOnly` is false and the server is configured with signer secrets, the endpoint will submit and confirm the transfer, returning the payment payload with `confirmationStatus`.

Balance example:

```bash
curl -H "x-api-key: $AGENTPAY_API_KEY" \
  "http://localhost:8080/v1/balances/<WALLET_ADDRESS>?asset=USDC"
```

Response includes the current lamport amount, the slot when it was observed, and a `stale` flag.

## Webhooks

Routes live in `packages/server/src/routes/webhooks.ts` and cover registration, listing, verification, and dead-letter management.

| Method | Path                                       | Purpose |
|--------|--------------------------------------------|---------|
| POST   | `/v1/webhooks`                             | Register a webhook target |
| POST   | `/v1/webhooks/:id/verify`                  | Acknowledge verification challenge |
| GET    | `/v1/webhooks`                             | List webhook registrations (pagination supported) |
| DELETE | `/v1/webhooks/:id`                         | Remove a registration |
| GET    | `/v1/events/:eventId/deliveries`           | Inspect delivery attempts for an event |
| GET    | `/v1/webhooks/dlq`                         | View dead letters (failed deliveries) |
| POST   | `/v1/webhooks/dlq/:deadLetterId/replay`    | Trigger a replay and remove from DLQ |

Register example:

```bash
curl -X POST http://localhost:8080/v1/webhooks \
  -H "x-api-key: $AGENTPAY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "targetUrl": "https://example.com/webhooks/agentpay",
    "sharedSecret": "super-secure-shared-secret",
    "eventTypes": ["invoice.created", "payment.confirmed"]
  }'
```

The response includes `registration` data and a `verificationChallenge`. Call `POST /v1/webhooks/:id/verify` with that challenge to activate the webhook.

Dead-letter replay example:

```bash
curl -X POST http://localhost:8080/v1/webhooks/dlq/<DEAD_LETTER_ID>/replay \
  -H "x-api-key: $AGENTPAY_API_KEY"
```

## Idempotency & Rate Limits

- **Idempotency**: Both the invoice creation and payment execution endpoints require an `Idempotency-Key`. Keys are scoped per agent and persist for `IDEMPOTENCY_TTL_SECONDS` (default 24h). If a matching key exists, the API returns the stored response without reprocessing.
- **Rate Limiting**: Every authenticated request consumes from the agent’s bucket (`RATE_LIMIT_BUCKET_SIZE`/`RATE_LIMIT_REFILL_RATE`) configured during seeding. Exceeding the limit yields `429 RATE_LIMIT_EXCEEDED`.

## Error Envelope

All application errors share a standard shape:

```json
{
  "code": "VALIDATION_FAILED",
  "message": "...",
