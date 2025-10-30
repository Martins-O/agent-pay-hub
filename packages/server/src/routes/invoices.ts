import { FastifyInstance } from 'fastify';
import {
  createInvoiceRequestSchema,
  createInvoiceResponseSchema,
  getInvoiceResponseSchema,
  cancelInvoiceResponseSchema,
  ulidSchema
} from '@agentpay/types';
import { InvoiceService } from '../services/invoice-service';
import { parseWithZod } from '../utils/zod';
import { IdempotencyService } from '../services/idempotency-service';
import { AgentPayError } from '../errors/agentpay-error';

export interface RegisterInvoiceRoutesOptions {
  invoiceService: InvoiceService;
  idempotencyService: IdempotencyService;
}

const idParamSchema = ulidSchema;

export async function registerInvoiceRoutes(
  app: FastifyInstance,
  opts: RegisterInvoiceRoutesOptions
): Promise<void> {
  const { invoiceService, idempotencyService } = opts;

  app.post('/v1/invoices', async (request, reply) => {
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

    const payload = parseWithZod(createInvoiceRequestSchema, request.body);
    const invoice = await invoiceService.createInvoice(agent, payload);
    const response = parseWithZod(createInvoiceResponseSchema, { invoice });

    const statusCode = 201;

    const location = `/v1/invoices/${invoice.id}`;

    await idempotencyService.set(agent.id, idempotencyKey, {
      statusCode,
      body: response,
      headers: {
        location
      }
    });

    reply.status(statusCode);
    reply.header('location', location);
    return response;
  });

  app.get('/v1/invoices/:invoiceId', async (request) => {
    const agent = request.agent;
    if (!agent) {
      throw new AgentPayError({
        statusCode: 401,
        code: 'AUTH_MISSING_API_KEY',
        message: 'Authentication required.'
      });
    }

    const params = request.params as Record<string, string>;
    const invoiceId = parseWithZod(idParamSchema, params.invoiceId);
    const invoice = await invoiceService.getInvoice(agent, invoiceId);
    return parseWithZod(getInvoiceResponseSchema, { invoice });
  });

  app.post('/v1/invoices/:invoiceId/cancel', async (request) => {
    const agent = request.agent;
    if (!agent) {
      throw new AgentPayError({
        statusCode: 401,
        code: 'AUTH_MISSING_API_KEY',
        message: 'Authentication required.'
      });
    }

    const params = request.params as Record<string, string>;
    const invoiceId = parseWithZod(idParamSchema, params.invoiceId);
    const invoice = await invoiceService.cancelInvoice(agent, invoiceId);
    return parseWithZod(cancelInvoiceResponseSchema, { invoice });
  });
}
