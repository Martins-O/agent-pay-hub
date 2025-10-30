import fp from 'fastify-plugin';
import { FastifyInstance } from 'fastify';
import { AgentPayError } from '../errors/agentpay-error';

interface ErrorResponseBody {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  correlationId: string;
  retryable: boolean;
}

export default fp(async function errorHandlerPlugin(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    const correlationId = request.id;

    if (error instanceof AgentPayError) {
      const body: ErrorResponseBody = {
        code: error.code,
        message: error.message,
        details: error.details,
        correlationId,
        retryable: error.retryable
      };

      request.log.warn({ err: error, correlationId }, 'AgentPayError encountered');
      return reply.status(error.statusCode).send(body);
    }

    request.log.error({ err: error, correlationId }, 'Unhandled error');

    const body: ErrorResponseBody = {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
      correlationId,
      retryable: false
    };

    return reply.status(500).send(body);
  });
});
