import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';
import { FastifyInstance } from 'fastify';
import Redis from 'ioredis';

export interface RateLimitPluginOptions {
  max: number;
  timeWindowMs: number;
  redis: Redis;
}

export default fp<RateLimitPluginOptions>(async function rateLimitPlugin(app: FastifyInstance, opts) {
  await app.register(rateLimit, {
    max: opts.max,
    timeWindow: opts.timeWindowMs,
    redis: opts.redis,
    keyGenerator: (request) => {
      const apiKey = request.headers['x-api-key'];
      if (typeof apiKey === 'string' && apiKey.length > 0) {
        return apiKey;
      }
      // fallback to remote address to still prevent abuse
      return request.ip;
    },
    skipOnError: false,
    hook: 'onRequest'
  });
});
