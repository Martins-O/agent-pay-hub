import { z } from 'zod';
import { AppEnv } from '../config';
import { generateUlid } from '../utils/id';

interface CreateIntentInput {
  invoiceId: string;
  assetSymbol: string;
  amount: string;
  recipientWalletAddress: string;
  payerWalletAddress?: string;
  memo?: string;
  expiresAt?: string;
  nonce: string;
}

const x402IntentSchema = z.object({
  version: z.literal('x402:1'),
  invoiceId: z.string(),
  assetSymbol: z.string(),
  amount: z.string(),
  recipientWalletAddress: z.string(),
  payerWalletAddress: z.string().optional(),
  memo: z.string().optional(),
  expiresAt: z.string().optional(),
  nonce: z.string(),
  issuedAt: z.string()
});

export type X402Intent = z.infer<typeof x402IntentSchema>;

export class X402Adapter {
  constructor(private readonly _env: AppEnv) {}

  createInvoiceIntent(input: CreateIntentInput): X402Intent {
    const intent: X402Intent = {
      version: 'x402:1',
      invoiceId: input.invoiceId,
      assetSymbol: input.assetSymbol,
      amount: input.amount,
      recipientWalletAddress: input.recipientWalletAddress,
      payerWalletAddress: input.payerWalletAddress,
      memo: input.memo,
      expiresAt: input.expiresAt,
      nonce: input.nonce,
      issuedAt: new Date().toISOString()
    };

    return x402IntentSchema.parse(intent);
  }

  encodeIntent(intent: X402Intent): string {
    const payload = JSON.stringify(intent);
    return Buffer.from(payload, 'utf-8').toString('base64url');
  }

  decodeIntent(intentBlob: string): X402Intent {
    const json = Buffer.from(intentBlob, 'base64url').toString('utf-8');
    const parsed = JSON.parse(json);
    return x402IntentSchema.parse(parsed);
  }

  buildPaymentRequestUri(intentBlob: string): string {
    return `x402:${intentBlob}`;
  }

  extractIntentFromUri(uri: string): X402Intent {
    if (!uri.startsWith('x402:')) {
      throw new Error('Invalid x402 URI');
    }

    const encoded = uri.slice('x402:'.length);
    return this.decodeIntent(encoded);
  }

  generateNonce(): string {
    return generateUlid();
  }
}
