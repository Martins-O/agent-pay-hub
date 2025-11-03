# Test Plan (Outline)

The final test plan will enumerate unit, integration, chain, SDK, and end-to-end scenarios alongside coverage goals. Current outline:

- **Unit Tests**
  - Input validation schemas.
  - Error envelope and mapper functions.
  - Rate limiter, nonce cache, idempotency store.
  - Webhook signature utilities and HMAC verifier.
  - Wallet signature canonical string builder and nonce consumption edge cases.
- **Integration Tests**
  - Invoice lifecycle (create, fetch, cancel, expire).
  - Payment simulation + submission path.
  - Balance queries with mocked Solana RPC.
  - Webhook registration, verification, and delivery with retry + DLQ.
  - Dead-letter listing and manual replay flows for failed webhook deliveries.
  - Admin endpoints for delivery attempts.
  - API key + wallet signature authenticated requests across invoice, payment, and webhook flows.
  - Manual smoke script: see `docs/manual-api-test-sequence.md` for step-by-step cURL checks.
- **Chain Tests (Devnet)**
  - Happy path payment confirmation.
  - Insufficient funds, invalid recipients, expired invoice rejection.
- **SDK Tests**
  - Request builders and typed responses.
  - Retry strategy and exponential backoff.
  - Webhook verifier helper against fixture payloads.
- **Dashboard E2E**
  - Auth flow (if applicable).
  - Invoice creation, payment trigger, status visualization, webhook log view.
- **Tooling**
  - Coverage thresholds (line + branch) enforced via CI gating.
  - Fuzz/property testing for amount/memo canonicalization.

Test ownership will be tracked in the project board once implementation begins.
