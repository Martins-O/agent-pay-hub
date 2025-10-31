import { FastifyInstance } from 'fastify';
import {
  registerWebhookResponseSchema,
  listWebhooksResponseSchema,
  deleteWebhookResponseSchema,
  getDeliveryAttemptsResponseSchema,
  webhookRegistrationSchema,
  ulidSchema,
  paginationSchema,
  listWebhookDeadLettersResponseSchema,
  replayWebhookDeadLetterResponseSchema
} from '@agentpay/types';
import { WebhookService } from '../services/webhook-service';
import { parseWithZod } from '../utils/zod';
import { AgentPayError } from '../errors/agentpay-error';

export interface RegisterWebhookRoutesOptions {
  webhookService: WebhookService;
}

export async function registerWebhookRoutes(
  app: FastifyInstance,
  opts: RegisterWebhookRoutesOptions
): Promise<void> {
  const { webhookService } = opts;

  app.post('/v1/webhooks', async (request, reply) => {
    const agent = request.agent;
    if (!agent) {
      throw new AgentPayError({
        statusCode: 401,
        code: 'AUTH_MISSING_API_KEY',
        message: 'Authentication required.'
      });
    }

    const response = await webhookService.registerWebhook(agent, request.body);
    reply.status(201);
    return parseWithZod(registerWebhookResponseSchema, response);
  });

  app.post('/v1/webhooks/:webhookId/verify', async (request) => {
    const agent = request.agent;
    if (!agent) {
      throw new AgentPayError({
        statusCode: 401,
        code: 'AUTH_MISSING_API_KEY',
        message: 'Authentication required.'
      });
    }

    const params = request.params as Record<string, string>;
    const webhookId = parseWithZod(ulidSchema, params.webhookId);
    const registration = await webhookService.verifyWebhook(agent, webhookId, request.body);
    return parseWithZod(webhookRegistrationSchema, registration);
  });

  app.get('/v1/webhooks', async (request) => {
    const agent = request.agent;
    if (!agent) {
      throw new AgentPayError({
        statusCode: 401,
        code: 'AUTH_MISSING_API_KEY',
        message: 'Authentication required.'
      });
    }

    const query = parseWithZod(
      paginationSchema.extend({
        cursor: ulidSchema.optional()
      }),
      request.query
    );

    const response = await webhookService.listWebhooks(agent, query);
    return parseWithZod(listWebhooksResponseSchema, response);
  });

  app.delete('/v1/webhooks/:webhookId', async (request) => {
    const agent = request.agent;
    if (!agent) {
      throw new AgentPayError({
        statusCode: 401,
        code: 'AUTH_MISSING_API_KEY',
        message: 'Authentication required.'
      });
    }

    const params = request.params as Record<string, string>;
    const webhookId = parseWithZod(ulidSchema, params.webhookId);
    const success = await webhookService.deleteWebhook(agent, webhookId);
    return parseWithZod(deleteWebhookResponseSchema, { success });
  });

  app.get('/v1/webhooks/dlq', async (request) => {
    const agent = request.agent;
    if (!agent) {
      throw new AgentPayError({
        statusCode: 401,
        code: 'AUTH_MISSING_API_KEY',
        message: 'Authentication required.'
      });
    }

    const query = parseWithZod(
      paginationSchema.extend({
        cursor: ulidSchema.optional()
      }),
      request.query
    );

    const response = await webhookService.listDeadLetters(agent, query);
    return parseWithZod(listWebhookDeadLettersResponseSchema, response);
  });

  app.post('/v1/webhooks/dlq/:deadLetterId/replay', async (request) => {
    const agent = request.agent;
    if (!agent) {
      throw new AgentPayError({
        statusCode: 401,
        code: 'AUTH_MISSING_API_KEY',
        message: 'Authentication required.'
      });
    }

    const params = request.params as Record<string, string>;
    const deadLetterId = parseWithZod(ulidSchema, params.deadLetterId);
    const deadLetter = await webhookService.getDeadLetterForReplay(agent, deadLetterId);

    await request.server.webhookDispatcher.dispatchForRegistration(
      deadLetter.registrationId,
      deadLetter.ledgerEventId
    );

    await webhookService.removeDeadLetter(deadLetterId);

    return parseWithZod(replayWebhookDeadLetterResponseSchema, { success: true });
  });

  app.get('/v1/events/:eventId/deliveries', async (request) => {
    const agent = request.agent;
    if (!agent) {
      throw new AgentPayError({
        statusCode: 401,
        code: 'AUTH_MISSING_API_KEY',
        message: 'Authentication required.'
      });
    }

    const params = request.params as Record<string, string>;
    const eventId = parseWithZod(ulidSchema, params.eventId);
    const response = await webhookService.getDeliveryAttempts(agent, eventId);
    return parseWithZod(getDeliveryAttemptsResponseSchema, response);
  });
}
