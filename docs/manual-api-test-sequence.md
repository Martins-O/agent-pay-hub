# Manual API Test Sequence

Use this checklist when exercising the local AgentPay server (`pnpm --dir=packages/server dev`). Unless noted otherwise, requests require the seeded API key in the `x-api-key` header.

## Prerequisites

- Base URL: `http://localhost:8080`
- `x-api-key`: copy from bootstrap output or `SEED_AGENT_API_KEY`
- For idempotent POSTs: generate a unique `Idempotency-Key` (UUID/ULID)
- Optional wallet signature headers (`x-wallet-address`, `x-wallet-signature`, `x-wallet-nonce`, `x-wallet-timestamp`) are only needed when testing signed requests.

## Sequence

1. **Liveness probe** – `GET /health/liveness`
   - Expect `200 OK` with `{ "status": "ok" }`.

2. **Readiness probe** – `GET /health/readiness`
   - Expect `200 OK` with `checks.database === 'ok'` and `checks.cache === 'ok'`.

3. **Metrics (optional)** – `GET /metrics`
   - Confirms Prometheus export is reachable (no auth required).

4. **Create invoice** – `POST /v1/invoices`
   ```bash
   curl -X POST http://localhost:8080/v1/invoices \
     -H 'x-api-key: <API_KEY>' \
     -H 'Idempotency-Key: <UNIQUE_KEY>' \
     -H 'Content-Type: application/json' \
     -d '{
       "recipientWalletAddress": "F62i8C3CshnB6a2EePxX61fNULmKM2SUkieJgP6FkERZ",
       "amount": "1.23",
       "assetSymbol": "USDC",
       "memo": "Test invoice"
     }'
   ```
   - Capture `invoice.id`, `x402Intent`, and `Location` header.

5. **Idempotency replay** – repeat Step 4 with the same `Idempotency-Key`
   - Expect identical response and status `201 Created` without new record insertion.

6. **Fetch invoice** – `GET /v1/invoices/{invoiceId}`
   - Replace `{invoiceId}` with the ID from Step 4.

7. **Execute payment (simulation)** – `POST /v1/payments`
   ```bash
   curl -X POST http://localhost:8080/v1/payments \
     -H 'x-api-key: <API_KEY>' \
     -H 'Idempotency-Key: <UNIQUE_KEY>' \
     -H 'Content-Type: application/json' \
     -d '{
       "invoiceId": "<INVOICE_ID>",
       "simulateOnly": true
     }'
   ```
   - Record `payment.id`, `confirmationStatus`, and `Location` header.

8. **Fetch payment** – `GET /v1/payments/{paymentId}`
   - Confirm the status matches the simulation result.

9. **Balance check** – `GET /v1/balances/{walletAddress}?asset=USDC`
   - Use the recipient wallet from Step 4. Response includes `amount`, `lastObservedSlot`, and `stale` flag.

10. **Register webhook** – `POST /v1/webhooks`
    ```bash
    curl -X POST http://localhost:8080/v1/webhooks \
      -H 'x-api-key: <API_KEY>' \
      -H 'Content-Type: application/json' \
      -d '{
        "targetUrl": "https://example.com/webhooks/agentpay",
        "eventTypes": ["invoice.created", "payment.confirmed"],
        "sharedSecret": "dev-webhook-secret-123"
      }'
    ```
    - Save `registration.id` and `verificationChallenge`.

11. **Verify webhook** – `POST /v1/webhooks/{webhookId}/verify`
    - Provide the challenge response payload defined by the implementation.

12. **List webhooks** – `GET /v1/webhooks`
    - Confirm the new registration appears; note pagination cursors if returned.

13. **Delivery attempts** – `GET /v1/events/{eventId}/deliveries`
    - Use an event ID from ledger output (e.g., after invoice creation or payment).

14. **Dead-letter queue** – `GET /v1/webhooks/dlq`
    - Expect empty array in normal conditions; if populated, optionally call `POST /v1/webhooks/dlq/{deadLetterId}/replay`.

15. **Cleanup (optional)** – `DELETE /v1/webhooks/{webhookId}` to deactivate the registration.

Document actual responses and deviations after each run to keep regression notes current.
