import argon2 from 'argon2';
import { Prisma, PrismaClient, WebhookEventType } from '@prisma/client';
import { z } from 'zod';
import {
  deliveryAttemptSchema,
  getDeliveryAttemptsResponseSchema,
  listWebhooksResponseSchema,
  registerWebhookRequestSchema,
  registerWebhookResponseSchema,
  webhookRegistrationSchema,
  type RegisterWebhookResponse,
  type WebhookRegistration,
  type GetDeliveryAttemptsResponse
} from '@agentpay/types';
import { AgentIdentity } from '../auth/api-key-service';
import { AgentPayError } from '../errors/agentpay-error';
import { parseWithZod } from '../utils/zod';
import { generateUlid } from '../utils/id';
import { AppEnv } from '../config';
import { decryptSecret, encryptSecret } from '../utils/crypto';
import { prismaToApiEventType, toPrismaEventType } from '../utils/webhook-events';

export class WebhookService {
  constructor(private readonly prisma: PrismaClient, private readonly env: AppEnv) {}

  async registerWebhook(agent: AgentIdentity, rawBody: unknown): Promise<RegisterWebhookResponse> {
    const payload = parseWithZod(registerWebhookRequestSchema, rawBody);

    const secretHash = await argon2.hash(payload.sharedSecret, {
      type: argon2.argon2id,
      timeCost: this.env.API_KEY_HASH_COST
    });
    const ciphertext = encryptSecret(payload.sharedSecret, this.env.API_KEY_ENCRYPTION_SECRET);

    const id = generateUlid();
    const verificationNonce = generateUlid();

    const eventFilter = payload.eventTypes.map((type) => toPrismaEventType(type));

    const registration = await this.prisma.webhookRegistration.create({
      data: {
        id,
        ownerAgentId: agent.id,
        targetUrl: payload.targetUrl,
        sharedSecretHash: secretHash,
        sharedSecretCiphertext: ciphertext,
        eventFilter,
        active: false,
        verificationNonce
      }
    });

    const dto = this.toDto(registration);
    return parseWithZod(registerWebhookResponseSchema, {
      registration: dto,
      verificationChallenge: verificationNonce
    });
  }

  async verifyWebhook(agent: AgentIdentity, registrationId: string, token: unknown): Promise<WebhookRegistration> {
    const registration = await this.ensureOwnership(agent, registrationId);
    const body = typeof token === 'object' && token !== null ? (token as Record<string, unknown>) : {};
    const challenge = typeof body.challenge === 'string' ? body.challenge : undefined;

    if (!challenge) {
      throw new AgentPayError({
        statusCode: 400,
        code: 'VALIDATION_FAILED',
        message: 'Verification challenge is required.'
      });
    }

    if (challenge !== registration.verificationNonce) {
      throw new AgentPayError({
        statusCode: 400,
        code: 'VALIDATION_FAILED',
        message: 'Verification challenge mismatch.'
      });
    }

    const updated = await this.prisma.webhookRegistration.update({
      where: { id: registration.id },
      data: {
        active: true,
        verificationNonce: generateUlid(),
        failureCount: 0
      }
    });

    return this.toDto(updated);
  }

  async listWebhooks(
    agent: AgentIdentity,
    query: { cursor?: string; limit?: number }
  ): Promise<z.infer<typeof listWebhooksResponseSchema>> {
    const take = query.limit ?? 20;
    const cursor = query.cursor;

    const registrations = await this.prisma.webhookRegistration.findMany({
      where: {
        ownerAgentId: agent.id
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: take + 1,
      ...(cursor
        ? {
            skip: 1,
            cursor: {
              id: cursor
            }
          }
        : {})
    });

    const hasMore = registrations.length > take;
    const sliced = hasMore ? registrations.slice(0, take) : registrations;

    const response = parseWithZod(listWebhooksResponseSchema, {
      webhooks: sliced.map((reg) => this.toDto(reg)),
      nextCursor: hasMore ? registrations[registrations.length - 1].id : null
    });

    return response;
  }

  async deleteWebhook(agent: AgentIdentity, registrationId: string): Promise<boolean> {
    await this.ensureOwnership(agent, registrationId);

    await this.prisma.webhookRegistration.update({
      where: { id: registrationId },
      data: {
        active: false
      }
    });

    return true;
  }

  async getDeliveryAttempts(agent: AgentIdentity, eventId: string): Promise<GetDeliveryAttemptsResponse> {
    const event = await this.prisma.ledgerEvent.findUnique({
      where: { id: eventId },
      include: {
        invoice: true,
        payment: {
          include: {
            invoice: true
          }
        }
      }
    });

    if (!event) {
      throw new AgentPayError({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Event not found.'
      });
    }

    const agentIds = new Set<string>();
    if (event.invoice) {
      agentIds.add(event.invoice.creatorAgentId);
    }
    if (event.payment) {
      agentIds.add(event.payment.submittedById);
      if (event.payment.invoice) {
        agentIds.add(event.payment.invoice.creatorAgentId);
      }
    }

    if (!agentIds.has(agent.id)) {
      throw new AgentPayError({
        statusCode: 403,
        code: 'NOT_FOUND',
        message: 'Event inaccessible.'
      });
    }

    const attempts = await this.prisma.deliveryAttempt.findMany({
      where: { ledgerEventId: eventId },
      orderBy: {
        attemptNumber: 'asc'
      }
    });

    const response = parseWithZod(getDeliveryAttemptsResponseSchema, {
      attempts: attempts.map((attempt) =>
        parseWithZod(deliveryAttemptSchema, {
          id: attempt.id,
          eventId: attempt.ledgerEventId,
          attemptNumber: attempt.attemptNumber,
          requestBodyHash: attempt.requestBodyHash,
          responseStatus: attempt.responseStatus,
          latencyMs: attempt.latencyMs,
          failureReason: attempt.failureReason,
          signatureUsed: attempt.signatureUsed,
          createdAt: attempt.createdAt.toISOString()
        })
      )
    });

    return response;
  }

  async getSecretForRegistration(registrationId: string): Promise<string> {
    const registration = await this.prisma.webhookRegistration.findUnique({
      where: { id: registrationId }
    });

    if (!registration) {
      throw new Error('Webhook registration not found');
    }

    return decryptSecret(registration.sharedSecretCiphertext, this.env.API_KEY_ENCRYPTION_SECRET);
  }

  private async ensureOwnership(agent: AgentIdentity, registrationId: string) {
    const registration = await this.prisma.webhookRegistration.findUnique({
      where: { id: registrationId }
    });

    if (!registration || registration.ownerAgentId !== agent.id) {
      throw new AgentPayError({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Webhook registration not found.'
      });
    }

    return registration;
  }

  private toDto(model: Prisma.WebhookRegistrationGetPayload<{ include?: never }>): WebhookRegistration {
    return parseWithZod(webhookRegistrationSchema, {
      id: model.id,
      ownerAgentId: model.ownerAgentId,
      targetUrl: model.targetUrl,
      eventFilter: model.eventFilter.map((event) => prismaToApiEventType[event as WebhookEventType]),
      active: model.active,
      verificationNonce: model.verificationNonce,
      lastDeliveryAt: model.lastDeliveryAt ? model.lastDeliveryAt.toISOString() : null,
      failureCount: model.failureCount,
      createdAt: model.createdAt.toISOString(),
      updatedAt: model.updatedAt.toISOString()
    });
  }
}
