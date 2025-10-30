import { describe, expect, it } from 'vitest';
import { computeWebhookSignature, verifyWebhookSignature } from '../src/utils/webhook';

describe('webhook utils', () => {
  const secret = 'super-secret';
  const timestamp = new Date().toISOString();
  const body = JSON.stringify({ example: true });

  it('computes signatures deterministically', () => {
    const sig1 = computeWebhookSignature(secret, timestamp, body);
    const sig2 = computeWebhookSignature(secret, timestamp, body);
    expect(sig1).toEqual(sig2);
  });

  it('verifies valid signatures within tolerance', () => {
    const signature = computeWebhookSignature(secret, timestamp, body);
    expect(
      verifyWebhookSignature({
        secret,
        timestamp,
        body,
        signature,
        toleranceSeconds: 60
      })
    ).toBe(true);
  });

  it('rejects signatures outside tolerance', () => {
    const signature = computeWebhookSignature(secret, timestamp, body);
    const oldTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    expect(
      verifyWebhookSignature({
        secret,
        timestamp: oldTimestamp,
        body,
        signature,
        toleranceSeconds: 60
      })
    ).toBe(false);
  });
});
