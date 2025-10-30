import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';

interface EncryptionResult {
  iv: string;
  ciphertext: string;
  tag: string;
}

export function encryptSecret(secret: string, masterKey: string): string {
  const key = deriveKey(masterKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  const result: EncryptionResult = {
    iv: iv.toString('base64url'),
    ciphertext: ciphertext.toString('base64url'),
    tag: tag.toString('base64url')
  };

  return JSON.stringify(result);
}

export function decryptSecret(payload: string, masterKey: string): string {
  const key = deriveKey(masterKey);
  let result: EncryptionResult;

  try {
    result = JSON.parse(payload) as EncryptionResult;
  } catch (error) {
    throw new Error('Invalid encrypted payload');
  }

  const iv = Buffer.from(result.iv, 'base64url');
  const ciphertext = Buffer.from(result.ciphertext, 'base64url');
  const tag = Buffer.from(result.tag, 'base64url');

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

function deriveKey(masterKey: string): Buffer {
  return createHash('sha256').update(masterKey).digest();
}

export function createWebhookSignature(secret: string, timestamp: string, body: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('base64url');
}
