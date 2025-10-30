import { FastifyInstance } from 'fastify';
import { ulidSchema } from '@agentpay/types';
import { PaymentService } from '../services/payment-service';
import { IdempotencyService } from '../services/idempotency-service';
import { AgentPayError } from '../errors/agentpay-error';
import { parseWithZod } from '../utils/zod';

export interface RegisterPaymentRoutesOptions {
  paymentService: PaymentService;
  idempotencyService: IdempotencyService;
}

export async function registerPaymentRoutes(
  app: FastifyInstance,
  opts: RegisterPaymentRoutesOptions
): Promise<void> {
  const { paymentService, idempotencyService } = opts;

  app.post('/v1/payments', async (request, reply) => {
    const agent = request.agent;
    if (!agent) {
      throw new AgentPayError({
        statusCode: 401,
        code: 'AUTH_MISSING_API_KEY',
        message: 'Authentication required.'
      });
    }

    const idempotencyKeyHeader = request.headers['idempotency-key'];
    const idempotencyKey = typeof idempotencyKeyHeader === 'string' ? idempotencyKeyHeader : undefined;

    if (!idempotencyKey) {
      throw new AgentPayError({
        statusCode: 400,
        code: 'VALIDATION_FAILED',
        message: 'Missing Idempotency-Key header.'
      });
    }

    const cached = await idempotencyService.get(agent.id, idempotencyKey);
    if (cached) {
      reply.status(cached.statusCode);
      if (cached.headers) {
        Object.entries(cached.headers).forEach(([key, value]) => {
          reply.header(key, value);
        });
      }
      return cached.body;
    }

    const result = await paymentService.executePayment(agent, request.body);
    const location = `/v1/payments/${result.payment.id}`;
    const statusCode = result.payment.confirmationStatus === 'CONFIRMED' ? 200 : 202;

    await idempotencyService.set(agent.id, idempotencyKey, {
      statusCode,
      body: result,
      headers: {
        location
      }
    });

    reply.status(statusCode).header('location', location);
    return result;
  });

  app.get('/v1/payments/:paymentId', async (request) => {
    const agent = request.agent;
    if (!agent) {
      throw new AgentPayError({
        statusCode: 401,
        code: 'AUTH_MISSING_API_KEY',
        message: 'Authentication required.'
      });
    }

    const params = request.params as Record<string, string>;
    const paymentId = parseWithZod(ulidSchema, params.paymentId);
    return paymentService.getPayment(agent, paymentId);
  });
}
