import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import { utf8ToBytes } from '@noble/hashes/utils';

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  const base64 = typeof btoa === 'function'
    ? btoa(binary)
    : Buffer.from(bytes).toString('base64');

  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export interface VerifyWebhookSignatureOptions {
  secret: string;
  timestamp: string;
  body: string;
  signature: string;
  toleranceSeconds?: number;
}

export function verifyWebhookSignature(options: VerifyWebhookSignatureOptions): boolean {
  const { secret, timestamp, body, signature, toleranceSeconds = 300 } = options;
  const expected = computeWebhookSignature(secret, timestamp, body);

  if (!timingSafeEqual(signature, expected)) {
    return false;
  }

  const ts = Date.parse(timestamp);
  if (Number.isNaN(ts)) {
    return false;
  }

  const diffSeconds = Math.abs(Date.now() - ts) / 1000;
  return diffSeconds <= toleranceSeconds;
}

export function computeWebhookSignature(secret: string, timestamp: string, body: string): string {
  const payload = `${timestamp}.${body}`;
  const mac = hmac.create(sha256, utf8ToBytes(secret));
  mac.update(utf8ToBytes(payload));
  return toBase64Url(mac.digest());
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
