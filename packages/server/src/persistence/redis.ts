import Redis from 'ioredis';
import { AppEnv } from '../config';

let redis: Redis | null = null;

export function getRedisClient(env: AppEnv): Redis {
  if (redis) {
    return redis;
  }

  redis = new Redis(env.CACHE_URL, {
    lazyConnect: true
  });

  return redis;
}

export async function disconnectRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
