import 'fastify';
import type { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';
import type { AppEnv } from '../config';
import type { AgentIdentity } from '../auth/api-key-service';

declare module 'fastify' {
  interface FastifyInstance {
    config: AppEnv;
    prisma: PrismaClient;
    redis: Redis;
  }

  interface FastifyRequest {
    agent?: AgentIdentity;
  }
}
