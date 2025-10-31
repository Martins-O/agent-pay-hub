import { describe, expect, it } from 'vitest';
import { X402Adapter } from '../../src/adapters/x402-adapter';

const dummyEnv = {} as never;

describe('X402Adapter', () => {
  it('round-trips intents through encode/decode', () => {
    const adapter = new X402Adapter(dummyEnv);
    const intent = adapter.createInvoiceIntent({
      invoiceId: '01HABCDE1234567890ABCDE1',
      assetSymbol: 'USDC',
      amount: '10.5',
      recipientWalletAddress: 'F62i8C3CshnB6a2EePxX61fNULmKM2SUkieJgP6FkERZ',
      nonce: 'nonce-123'
    });

    const encoded = adapter.encodeIntent(intent);
    const decoded = adapter.decodeIntent(encoded);

    expect(decoded).toMatchObject({
      invoiceId: intent.invoiceId,
      assetSymbol: intent.assetSymbol,
      amount: intent.amount,
      nonce: intent.nonce
    });
  });

  it('throws when decoding malformed payloads', () => {
    const adapter = new X402Adapter(dummyEnv);
    expect(() => adapter.decodeIntent('not-base64')).toThrow();
  });
});
