import { verifyAsync } from '@noble/ed25519';
import bs58 from 'bs58';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { AgentPayError } from '../errors/agentpay-error';

export interface SignaturePayload {
  walletAddress: string;
  nonce: string;
  timestamp: string;
  signature: string;
  method: string;
  path: string;
  body?: unknown;
}

function toCanonicalBody(body: unknown): string {
  if (body === undefined || body === null) {
    return '';
  }
  if (typeof body === 'string') {
    return body;
  }
  if (Buffer.isBuffer(body)) {
    return body.toString('utf8');
  }
  if (ArrayBuffer.isView(body)) {
    return Buffer.from(body.buffer, body.byteOffset, body.byteLength).toString('utf8');
  }
  return JSON.stringify(body);
}

export class WalletSignatureService {
  async verifySignature(payload: SignaturePayload): Promise<void> {
    const { walletAddress, nonce, timestamp, signature, method, path, body } = payload;

    if (!walletAddress || !nonce || !timestamp || !signature) {
      throw new AgentPayError({
        statusCode: 401,
        code: 'AUTH_INVALID_SIGNATURE',
        message: 'Wallet signature headers missing or invalid.'
      });
    }

    const ts = Date.parse(timestamp);
    if (Number.isNaN(ts)) {
      throw new AgentPayError({
        statusCode: 401,
        code: 'AUTH_INVALID_SIGNATURE',
        message: 'Wallet signature timestamp invalid.'
      });
    }

    const now = Date.now();
    const driftMs = Math.abs(now - ts);
    if (driftMs > 5 * 60 * 1000) {
      throw new AgentPayError({
        statusCode: 401,
        code: 'AUTH_INVALID_SIGNATURE',
        message: 'Wallet signature timestamp drift exceeded allowance.'
      });
    }

    const canonical = [
      walletAddress,
      nonce,
      timestamp,
      method.toUpperCase(),
      path,
      createHash('sha256').update(toCanonicalBody(body)).digest('base64url')
    ].join('.');

    const messageBytes = Buffer.from(canonical, 'utf8');
    let signatureBytes: Uint8Array;
    let publicKeyBytes: Uint8Array;

    try {
      signatureBytes = bs58.decode(signature);
      publicKeyBytes = bs58.decode(walletAddress);
    } catch (error) {
      throw new AgentPayError({
        statusCode: 401,
        code: 'AUTH_INVALID_SIGNATURE',
        message: 'Wallet signature encoding invalid.'
      });
    }

    const verified = await verifyAsync(signatureBytes, messageBytes, publicKeyBytes).catch(() => false);

    if (!verified) {
      throw new AgentPayError({
        statusCode: 401,
        code: 'AUTH_INVALID_SIGNATURE',
        message: 'Wallet signature verification failed.'
      });
    }
  }
}
