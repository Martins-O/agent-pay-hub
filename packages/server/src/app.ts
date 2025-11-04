import Fastify, { type FastifyInstance, type FastifyBaseLogger } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import { randomUUID } from 'node:crypto';
import { createLogger } from './utils/logger';
import { loadAppEnv } from './config';
import errorHandlerPlugin from './plugins/error-handler';
import rateLimitPlugin from './plugins/rate-limit';
import authPlugin from './plugins/auth';
import metricsPlugin from './plugins/metrics';
import { getPrismaClient, disconnectPrisma } from './persistence/prisma';
import { getRedisClient, disconnectRedis } from './persistence/redis';
import { registerHealthRoutes } from './routes/health';
import { ApiKeyAuthService } from './auth/api-key-service';
import { X402Adapter } from './adapters/x402-adapter';
import { SolanaAdapter } from './adapters/solana-adapter';
import { LedgerService } from './services/ledger-service';
import { InvoiceService } from './services/invoice-service';
import { PaymentService } from './services/payment-service';
import { BalanceService } from './services/balance-service';
import { IdempotencyService } from './services/idempotency-service';
import { WebhookService } from './services/webhook-service';
import { WebhookDispatcher } from './services/webhook-dispatcher';
import { WalletSignatureService } from './services/wallet-signature-service';
import { NonceService } from './services/nonce-service';
import { registerInvoiceRoutes } from './routes/invoices';
import { registerPaymentRoutes } from './routes/payments';
import { registerBalanceRoutes } from './routes/balances';
import { registerWebhookRoutes } from './routes/webhooks';
import { EventBus } from './events/event-bus';
import { registry as metricsRegistry } from './metrics/registry';

export async function buildApp(): Promise<FastifyInstance> {
  const env = loadAppEnv();
  const logger = createLogger(env, { service: 'agentpay-server' });
  const app: FastifyInstance = Fastify({
    logger: logger as unknown as FastifyBaseLogger,
    genReqId: () => randomUUID(),
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'correlationId'
  });

  const prisma = getPrismaClient(env);
  const redis = getRedisClient(env);

  try {
    await redis.connect();
  } catch (error) {
    app.log.warn({ err: error }, 'Failed to eagerly connect to Redis; will retry on first use');
  }

  app.decorate('config', env);
  app.decorate('prisma', prisma);
  app.decorate('redis', redis);

  await app.register(helmet, {
    contentSecurityPolicy: false
  });

  await app.register(cors, {
    origin: true,
    credentials: true
  });

  await app.register(sensible);
  await app.register(errorHandlerPlugin);
  await app.register(metricsPlugin);

  const rateLimitWindowMs = Math.max(
    Math.ceil((env.RATE_LIMIT_BUCKET_SIZE / env.RATE_LIMIT_REFILL_RATE) * 1000),
    1000
  );

  await app.register(rateLimitPlugin, {
    max: env.RATE_LIMIT_BUCKET_SIZE,
    timeWindowMs: rateLimitWindowMs,
    redis
  });

  const authService = new ApiKeyAuthService(prisma);
  const walletSignatureService = new WalletSignatureService();
  const nonceService = new NonceService(redis, env.CACHE_NAMESPACE_TTL_NONCE);
  await app.register(authPlugin, {
    authService,
    walletSignatureService,
    nonceService
  });
  app.decorate('walletSignatureService', walletSignatureService);
  app.decorate('nonceService', nonceService);

  const eventBus = new EventBus();
  const x402Adapter = new X402Adapter(env);
  const solanaAdapter = new SolanaAdapter(env);
  const ledgerService = new LedgerService(prisma, eventBus);
  const invoiceService = new InvoiceService(prisma, env, x402Adapter, ledgerService);
  const paymentService = new PaymentService(prisma, env, x402Adapter, solanaAdapter, ledgerService);
  const balanceService = new BalanceService(env, solanaAdapter);
  const webhookService = new WebhookService(prisma, env);
  const idempotencyService = new IdempotencyService(redis, env.IDEMPOTENCY_TTL_SECONDS);

  const webhookDispatcher = new WebhookDispatcher({
    prisma,
    env,
    eventBus,
    webhookService,
    ledgerService
  });
  app.decorate('webhookDispatcher', webhookDispatcher);

  await registerHealthRoutes(app);
  await registerInvoiceRoutes(app, { invoiceService, idempotencyService });
  await registerPaymentRoutes(app, { paymentService, idempotencyService });
  await registerBalanceRoutes(app, { balanceService });
  await registerWebhookRoutes(app, { webhookService });
  app.get('/metrics', { config: { public: true } }, async (_request, reply) => {
    reply.header('content-type', metricsRegistry.contentType);
    const metrics = await metricsRegistry.metrics();
    return reply.send(metrics);
  });

  app.setNotFoundHandler((request, reply) => {
    return reply.status(404).send({
      code: 'NOT_FOUND',
      message: 'Requested resource was not found.',
      correlationId: request.id,
      retryable: false
    });
  });

  app.addHook('onClose', async () => {
    await disconnectPrisma();
    await disconnectRedis();
  });

  return app;
}
