import type Redis from 'ioredis';

export interface IdempotentResponse {
  statusCode: number;
  body: unknown;
  headers?: Record<string, string>;
}

interface StoredResponse {
  statusCode: number;
  body: unknown;
  headers?: Record<string, string>;
  storedAt: string;
}

const IDEMPOTENCY_PREFIX = 'agentpay:idempotency';

export class IdempotencyService {
  constructor(private readonly redis: Redis, private readonly ttlSeconds: number) {}

  private buildKey(agentId: string, key: string): string {
    return `${IDEMPOTENCY_PREFIX}:${agentId}:${key}`;
  }

  async get(agentId: string, key: string): Promise<IdempotentResponse | null> {
    const cacheKey = this.buildKey(agentId, key);
    const raw = await this.redis.get(cacheKey);
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as StoredResponse;
      return {
        statusCode: parsed.statusCode,
        body: parsed.body,
        headers: parsed.headers
      };
    } catch (error) {
      await this.redis.del(cacheKey);
      return null;
    }
  }

  async set(agentId: string, key: string, response: IdempotentResponse): Promise<void> {
    const cacheKey = this.buildKey(agentId, key);
    const payload: StoredResponse = {
      ...response,
      storedAt: new Date().toISOString()
    };

    await this.redis.set(cacheKey, JSON.stringify(payload), 'EX', this.ttlSeconds);
  }
}
