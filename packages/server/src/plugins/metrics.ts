import fp from 'fastify-plugin';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { httpRequestDurationSeconds } from '../metrics/metrics';

declare module 'fastify' {
  interface FastifyRequest {
    metricsStartTime?: bigint;
  }
}

function getRouteLabel(request: FastifyRequest): string {
  const route = request.routeOptions?.url ?? (request as { routerPath?: string }).routerPath;
  return route ?? 'unknown';
}

export default fp(async function metricsPlugin(app: FastifyInstance) {
  app.addHook('onRequest', (request, _reply, done) => {
    request.metricsStartTime = process.hrtime.bigint();
    done();
  });

  app.addHook('onResponse', (request: FastifyRequest, reply: FastifyReply, done) => {
    const start = request.metricsStartTime;

    if (typeof start === 'bigint') {
      const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
      if (Number.isFinite(durationSeconds) && durationSeconds >= 0) {
        httpRequestDurationSeconds
          .labels(request.method, getRouteLabel(request), String(reply.statusCode))
          .observe(durationSeconds);
      }
    }

    done();
  });
});
