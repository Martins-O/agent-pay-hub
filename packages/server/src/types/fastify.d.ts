import 'fastify';
import type { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';
import type { AppEnv } from '../config';
import type { AgentIdentity } from '../auth/api-key-service';
import type { WalletAuthContext } from '../auth/types';
import type { WebhookDispatcher } from '../services/webhook-dispatcher';
import type { WalletSignatureService } from '../services/wallet-signature-service';
import type { NonceService } from '../services/nonce-service';

declare module 'fastify' {
  interface FastifyInstance {
    config: AppEnv;
    prisma: PrismaClient;
    redis: Redis;
    webhookDispatcher: WebhookDispatcher;
    walletSignatureService: WalletSignatureService;
    nonceService: NonceService;
  }

  interface FastifyRequest {
    agent?: AgentIdentity;
    walletIdentity?: WalletAuthContext;
  }
}
