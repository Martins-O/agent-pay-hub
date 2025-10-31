import type Redis from 'ioredis';
import { AgentPayError } from '../errors/agentpay-error';
import { walletNonceReplaysTotal } from '../metrics/metrics';

const NONCE_PREFIX = 'agentpay:wallet-nonce';

export class NonceService {
  constructor(private readonly redis: Redis, private readonly ttlSeconds: number) {}

  private buildKey(agentId: string, walletAddress: string, nonce: string): string {
    return `${NONCE_PREFIX}:${agentId}:${walletAddress}:${nonce}`;
  }

  async consume(agentId: string, walletAddress: string, nonce: string): Promise<void> {
    const cacheKey = this.buildKey(agentId, walletAddress, nonce);
    const result = await this.redis.set(cacheKey, '1', 'NX', 'EX', this.ttlSeconds);

    if (result === null) {
      walletNonceReplaysTotal.inc();
      throw new AgentPayError({
        statusCode: 401,
        code: 'AUTH_INVALID_SIGNATURE',
        message: 'Wallet nonce already used.',
        retryable: false
      });
    }
  }
}
