# AgentPay Hub

AgentPay Hub is an open-source MCP server that enables AI agents to create invoices, execute x402 payment intents, and reconcile Solana devnet payments through a single, well-defined interface. The project is structured as a mono-repo containing the backend server, TypeScript SDK, browser dashboard, and shared type definitions.

## Current Status
- [x] Architecture specification drafted (`docs/architecture.md`).
- [x] Environment variable catalog drafted (`docs/environment.md`).
- [x] Repository scaffolding (`packages/` for server, sdk, dashboard, types).
- [x] Core server foundation (config loader, auth skeleton, rate limiting, health endpoints, persistence schema).
- [x] Invoice, payment, balance, and webhook API scaffolding with ledger + idempotency + dispatcher plumbing.
- [x] Webhook dispatcher, Solana submission/confirmation lifecycle, and ledger projections (initial pass).
- [x] Prometheus `/metrics` export with default process stats and domain counters.
- [ ] SDK ergonomics, dashboard UI flows, and Solana failover hardening.
- [ ] Tests, CI, documentation suite, and demo assets.

## Getting Started
Detailed setup instructions, local-run scripts, and documentation will be added as the build progresses. Refer to `docs/architecture.md` for the planned system design.

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
