import { FastifyInstance } from 'fastify';

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health/liveness', { config: { public: true } }, async () => ({
    status: 'ok',
    timestamp: new Date().toISOString()
  }));

  app.get('/health/readiness', { config: { public: true } }, async (request, reply) => {
    const timestamp = new Date().toISOString();
    const checks: Record<string, 'ok' | 'failed'> = {
      database: 'ok',
      cache: 'ok'
    };

    try {
      await app.prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      request.log.error({ err: error }, 'Database readiness check failed');
      checks.database = 'failed';
    }

    try {
      await app.redis.ping();
    } catch (error) {
      request.log.error({ err: error }, 'Cache readiness check failed');
      checks.cache = 'failed';
    }

    const healthy = Object.values(checks).every((status) => status === 'ok');

    if (!healthy) {
      return reply.status(503).send({
        status: 'degraded',
        timestamp,
        checks
      });
    }

    return { status: 'ok', timestamp, checks };
  });
}
