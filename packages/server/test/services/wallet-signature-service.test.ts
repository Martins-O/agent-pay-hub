import { describe, expect, it } from 'vitest';
import { utils, getPublicKey, signAsync, etc } from '@noble/ed25519';
import bs58 from 'bs58';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { WalletSignatureService } from '../../src/services/wallet-signature-service';
import { AgentPayError } from '../../src/errors/agentpay-error';

if (!etc.sha512Sync) {
  etc.sha512Sync = (...messages) => {
    const hash = createHash('sha512');
    for (const message of messages) {
      hash.update(Buffer.from(message));
    }
    return new Uint8Array(hash.digest());
  };
}

if (!etc.sha512Async) {
  etc.sha512Async = async (...messages) => etc.sha512Sync!(...messages);
}

function createSignaturePayload(body: unknown, overrides: Partial<{
  walletAddress: string;
  nonce: string;
  timestamp: string;
  method: string;
  path: string;
}> = {}) {
  const defaultTimestamp = new Date().toISOString();
  return {
    walletAddress: overrides.walletAddress ?? '',
    nonce: overrides.nonce ?? 'nonce-123',
    timestamp: overrides.timestamp ?? defaultTimestamp,
    method: overrides.method ?? 'POST',
    path: overrides.path ?? '/v1/test',
    body
  };
}

describe('WalletSignatureService', () => {
  it('verifies a valid signature', async () => {
    const privateKey = utils.randomPrivateKey();
    const publicKey = getPublicKey(privateKey);
    const walletAddress = bs58.encode(publicKey);
    const payload = createSignaturePayload({ amount: 1 }, { walletAddress });

    const canonicalBody = typeof payload.body === 'string' ? payload.body : JSON.stringify(payload.body);
    const hash = createHash('sha256').update(canonicalBody).digest('base64url');
    const canonical = [
      payload.walletAddress,
      payload.nonce,
      payload.timestamp,
      payload.method.toUpperCase(),
      payload.path,
      hash
    ].join('.');

    const signatureBytes = await signAsync(Buffer.from(canonical, 'utf8'), privateKey);
    const signature = bs58.encode(signatureBytes);

    const service = new WalletSignatureService();
    await expect(
      service.verifySignature({
        ...payload,
        signature
      })
    ).resolves.toBeUndefined();
  });

  it('rejects invalid signatures', async () => {
    const privateKey = utils.randomPrivateKey();
    const publicKey = getPublicKey(privateKey);
    const walletAddress = bs58.encode(publicKey);
    const payload = createSignaturePayload({ amount: 1 }, { walletAddress });

    const service = new WalletSignatureService();
    await expect(
      service.verifySignature({
        ...payload,
        signature: bs58.encode(utils.randomPrivateKey())
      })
    ).rejects.toBeInstanceOf(AgentPayError);
  });

  it('rejects signatures with excessive drift', async () => {
    const privateKey = utils.randomPrivateKey();
    const publicKey = getPublicKey(privateKey);
    const walletAddress = bs58.encode(publicKey);
    const pastTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const payload = createSignaturePayload({ amount: 1 }, { walletAddress, timestamp: pastTimestamp });

    const canonicalBody = typeof payload.body === 'string' ? payload.body : JSON.stringify(payload.body);
    const hash = createHash('sha256').update(canonicalBody).digest('base64url');
    const canonical = [
      payload.walletAddress,
      payload.nonce,
      payload.timestamp,
      payload.method.toUpperCase(),
      payload.path,
      hash
    ].join('.');
    const signatureBytes = await signAsync(Buffer.from(canonical, 'utf8'), privateKey);
    const signature = bs58.encode(signatureBytes);

    const service = new WalletSignatureService();
    await expect(
      service.verifySignature({
        ...payload,
        signature
      })
    ).rejects.toBeInstanceOf(AgentPayError);
  });
});
