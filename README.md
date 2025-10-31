# AgentPay Hub

AgentPay Hub is an open-source MCP server that enables AI agents to create invoices, execute x402 payment intents, and reconcile Solana devnet payments through a single, well-defined interface. The project is structured as a mono-repo containing the backend server, TypeScript SDK, browser dashboard, and shared type definitions.

## Current Status
- [x] Architecture specification drafted (`docs/architecture.md`).
- [x] Environment variable catalog drafted (`docs/environment.md`).
- [x] Repository scaffolding (`packages/` for server, sdk, dashboard, types).
- [x] Core server foundation (config loader, auth skeleton, rate limiting, health endpoints, persistence schema).
- [x] Invoice, payment, balance, and webhook API scaffolding with ledger + idempotency + dispatcher plumbing.
- [x] Webhook dispatcher, Solana submission/confirmation lifecycle, and ledger projections (initial pass).
- [x] Prometheus `/metrics` export with default process stats, domain counters, and wallet signature telemetry.
- [x] Webhook dead-letter queue surfacing with list + replay endpoints.
- [x] Optional wallet signature verification with nonce replay protection.
- [ ] SDK ergonomics, dashboard UI flows, and Solana failover hardening.
- [ ] Tests, CI, documentation suite, and demo assets.

## Getting Started

### Local Development

1. Install prerequisites: Node.js 20, pnpm 8.15.4, Docker, and Docker Compose.
2. Bootstrap the workspace:
   ```bash
   bash scripts/bootstrap-dev.sh
   ```
   The script copies `.env.example` files, starts Postgres + Redis via Docker, applies Prisma migrations, and seeds a development API key. The generated key (if one was created) is echoed to the console.
3. Start the packages in watch mode:
   ```bash
   pnpm dev
   ```
   The server binds to `http://localhost:8080` with simulation-only Solana behavior by default.
4. Launch only the dashboard (optional) to interact with invoices, payments, and webhooks:
   ```bash
   pnpm --filter @agentpay/dashboard dev
   ```
   The app runs at `http://localhost:5173` and uses your locally stored API key to call the server.

### Quality Gates

- Run the server test suite: `pnpm --filter @agentpay/server test`
- Run all workspace tests/lints/type checks: `pnpm test`, `pnpm lint`, `pnpm typecheck`
- CI (GitHub Actions) executes the same commands on every push and pull request.

## SDK Usage (Preview)
```ts
import { AgentPayClient, verifyWebhookSignature } from '@agentpay/sdk';

const client = new AgentPayClient({
  baseUrl: process.env.AGENTPAY_URL!,
  apiKey: process.env.AGENTPAY_API_KEY!
});

const { invoice } = await client.createInvoice({
  recipientWalletAddress: 'RecipientPubkey',
  assetSymbol: 'USDC',
  amount: '1.50',
  memo: 'Sample invoice'
});

for await (const webhook of client.iterateWebhooks({ limit: 25 })) {
  console.log('Registered webhook', webhook.id);
}

function handleWebhook(headers: Record<string, string>, body: string) {
  const valid = verifyWebhookSignature({
    secret: process.env.AGENTPAY_WEBHOOK_SECRET!,
    timestamp: headers['x-agentpay-timestamp'],
    signature: headers['x-agentpay-signature'],
    body
  });
  if (!valid) throw new Error('Invalid webhook signature');
}
```
