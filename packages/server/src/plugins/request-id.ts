import fp from 'fastify-plugin';
import requestId from '@fastify/request-id';
import { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';

export default fp(async function requestIdPlugin(app: FastifyInstance) {
  await app.register(requestId, {
    generator: () => randomUUID(),
    header: 'x-request-id'
  });
});
