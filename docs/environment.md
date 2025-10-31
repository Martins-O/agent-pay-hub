# Environment Variables
The following environment variables are required across packages. Example values and descriptions will drive `.env.example` templates for each package.

## Core Server
- `SERVER_HOST`: Host interface for the MCP server (e.g., `0.0.0.0`).
- `SERVER_PORT`: Port for HTTP server (e.g., `8080`).
- `LOG_LEVEL`: Log verbosity (`debug`, `info`, `warn`, `error`).
- `LOG_JSON_ENABLED`: `true` to emit structured JSON logs.
- `DATABASE_URL`: Postgres connection string with credentials.
- `DATABASE_POOL_MIN`: Minimum pool size for DB connections.
- `DATABASE_POOL_MAX`: Maximum pool size for DB connections.
- `CACHE_URL`: Redis connection string for nonce cache, rate limit counters, and idempotency keys.
- `CACHE_NAMESPACE_TTL_INVOICE`: Seconds until invoice cache entries expire.
- `CACHE_NAMESPACE_TTL_NONCE`: Seconds until wallet signature nonces expire for replay defense.
- `API_KEY_ENCRYPTION_SECRET`: Secret used to encrypt API key materials at rest.
- `API_KEY_HASH_COST`: Argon2 cost parameter (JSON string or integer depending on library).
- `RATE_LIMIT_BUCKET_SIZE`: Max tokens per API key.
- `RATE_LIMIT_REFILL_RATE`: Tokens per second refill rate.
- `WEBHOOK_BASE_URL`: Base URL for webhook callbacks (for generating verification challenges).
- `WEBHOOK_SIGNING_SECRET`: HMAC secret for webhook signatures.
- `WEBHOOK_MAX_RETRIES`: Integer limit for retry attempts before DLQ.
- `WEBHOOK_RETRY_BACKOFF_BASE_MS`: Base backoff duration in milliseconds.
- `WEBHOOK_RETRY_BACKOFF_FACTOR`: Multiplier applied per retry attempt.
- `SOLANA_RPC_ENDPOINT`: Solana devnet RPC endpoint URL.
- `SOLANA_COMMITMENT_LEVEL`: Commitment level for confirmations (e.g., `confirmed`).
- `SOLANA_TX_TIMEOUT_MS`: Milliseconds before considering a transaction timed out.
- `SOLANA_SIMULATION_ONLY`: `true` to disable submission (useful for smoke tests).
- `SOLANA_PAYER_SECRET`: Base58-encoded secret key for the server-controlled payer (required when `SOLANA_SIMULATION_ONLY` is `false`).
- `DEVNET_FAUCET_ADDRESS`: Authority used to fund dev wallets.
- `ALLOWED_ASSETS`: JSON map of allowed asset symbols to mint addresses.
- `ALLOWED_ASSET_DECIMALS`: JSON map of asset symbols to decimals.
- `IDEMPOTENCY_TTL_SECONDS`: Duration invoices/payments idempotency keys persist.

## SDK Specific
- `SDK_BASE_URL`: Default server base URL.
- `SDK_API_KEY`: Default API key for local demos/tests.
- `SDK_TIMEOUT_MS`: HTTP request timeout.
- `SDK_MAX_RETRIES`: Number of retries for transient failures.

## Dashboard
- `VITE_AGENTPAY_API_URL`: Base URL for API calls.
- `VITE_AGENTPAY_WEBSOCKET_URL`: Optional WebSocket endpoint.
- `VITE_AGENTPAY_DOCS_URL`: Link to hosted documentation.
- `SESSION_SECRET`: Secret for dashboard session cookies (if auth is session-based).

## Tooling / Scripts
- `SEED_AGENT_ID`: Optional ULID to assign to the seeded development agent (defaults to a generated ULID).
- `SEED_AGENT_API_KEY`: Full API key (`prefix.secret`) provisioned during local setup. Generated automatically when omitted.
- `SEED_AGENT_SCOPES`: JSON array or comma-separated list of scopes granted to the seed agent (defaults to `[*]`).
- `SEED_AGENT_RATE_LIMIT_BUCKET`: Overrides the agent-specific rate limit bucket size.
- `DEV_WALLET_MNEMONIC`: Local mnemonic for dev wallet (devnet only).
- `CI`: Flag toggled in CI environment to enforce non-interactive behavior.

Each package will include an `.env.example` file with the subset of variables it uses, linking back to this reference for deeper descriptions.
