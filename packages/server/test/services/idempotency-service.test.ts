import { describe, expect, it } from 'vitest';
import { IdempotencyService } from '../../src/services/idempotency-service';

class InMemoryRedis {
  store = new Map<string, string>();

  async get(key: string) {
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string) {
    this.store.set(key, value);
    return 'OK';
  }

  async del(key: string) {
    this.store.delete(key);
  }
}

describe('IdempotencyService', () => {
  it('stores and retrieves cached responses', async () => {
    const redis = new InMemoryRedis();
    const service = new IdempotencyService(redis as never, 60);

    const agentId = 'agent-1';
    const key = 'req-123';
    const response = {
      statusCode: 201,
      body: { ok: true },
      headers: { location: '/v1/resource' }
    };

    expect(await service.get(agentId, key)).toBeNull();

    await service.set(agentId, key, response);

    const cached = await service.get(agentId, key);
    expect(cached).toEqual(response);
  });

  it('returns null when cached payload is corrupted', async () => {
    const redis = new InMemoryRedis();
    const service = new IdempotencyService(redis as never, 60);

    const agentId = 'agent-1';
    const key = 'req-123';
    const cacheKey = `agentpay:idempotency:${agentId}:${key}`;

    redis.store.set(cacheKey, 'not-json');

    const cached = await service.get(agentId, key);
    expect(cached).toBeNull();
    expect(redis.store.has(cacheKey)).toBe(false);
  });
});
