import { PrismaClient, WebhookEventType } from '@prisma/client';
import { EventBus, LedgerEventMessage } from '../events/event-bus';
import { AppEnv } from '../config';
import { WebhookService } from './webhook-service';
import { LedgerService } from './ledger-service';
import { prismaToApiEventType } from '../utils/webhook-events';
import { createWebhookSignature } from '../utils/crypto';
import { AgentPayError } from '../errors/agentpay-error';
import { createHash } from 'node:crypto';
import { fetch } from 'undici';

export interface WebhookDispatcherOptions {
  prisma: PrismaClient;
  env: AppEnv;
  eventBus: EventBus;
  webhookService: WebhookService;
  ledgerService: LedgerService;
}

export class WebhookDispatcher {
  private readonly prisma: PrismaClient;
  private readonly env: AppEnv;
  private readonly eventBus: EventBus;
  private readonly webhookService: WebhookService;
  private readonly ledgerService: LedgerService;

  constructor(options: WebhookDispatcherOptions) {
    this.prisma = options.prisma;
    this.env = options.env;
    this.eventBus = options.eventBus;
    this.webhookService = options.webhookService;
    this.ledgerService = options.ledgerService;

    this.eventBus.onLedgerEvent((event) => {
      void this.handleLedgerEvent(event).catch((error) => {
        // eslint-disable-next-line no-console
        console.error('WebhookDispatcher error handling ledger event', error);
      });
    });
  }

  private async handleLedgerEvent(event: LedgerEventMessage): Promise<void> {
    if (
      event.eventType === WebhookEventType.WEBHOOK_DELIVERY_FAILED ||
      event.eventType === WebhookEventType.WEBHOOK_DELIVERY_SUCCEEDED
    ) {
      return;
    }

    const fullEvent = await this.prisma.ledgerEvent.findUnique({
      where: { id: event.id },
      include: {
        invoice: true,
        payment: {
          include: {
            invoice: true
          }
        }
      }
    });

    if (!fullEvent) {
      throw new AgentPayError({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Ledger event not found.'
      });
    }

    const ownerAgentIds = new Set<string>();
    if (fullEvent.invoice) {
      ownerAgentIds.add(fullEvent.invoice.creatorAgentId);
    }
    if (fullEvent.payment) {
      ownerAgentIds.add(fullEvent.payment.submittedById);
      if (fullEvent.payment.invoice) {
        ownerAgentIds.add(fullEvent.payment.invoice.creatorAgentId);
      }
    }

    if (ownerAgentIds.size === 0) {
      return;
    }

    const registrations = await this.prisma.webhookRegistration.findMany({
      where: {
        ownerAgentId: { in: Array.from(ownerAgentIds) },
        active: true,
        eventFilter: {
          has: event.eventType
        }
      }
    });

    if (registrations.length === 0) {
      return;
    }

    const bodyPayload = {
      id: fullEvent.id,
      type: prismaToApiEventType[event.eventType],
      invoiceId: fullEvent.invoiceId,
      paymentId: fullEvent.paymentId,
      createdAt: fullEvent.createdAt.toISOString(),
      data: fullEvent.payload
    };
    const bodyString = JSON.stringify(bodyPayload);
    const bodyHash = createHash('sha256').update(bodyString).digest('base64url');

    await Promise.all(
      registrations.map((registration) =>
        this.dispatchWithRetry({
          registrationId: registration.id,
          targetUrl: registration.targetUrl,
          eventId: fullEvent.id,
          eventType: event.eventType,
          body: bodyString,
          bodyHash,
          attempt: 1
        })
      )
    );
  }

  private async dispatchWithRetry(params: {
    registrationId: string;
    targetUrl: string;
    eventId: string;
    eventType: WebhookEventType;
    body: string;
    bodyHash: string;
    attempt: number;
  }): Promise<void> {
    const { registrationId, targetUrl, eventId, eventType, body, bodyHash, attempt } = params;
    const timestamp = new Date().toISOString();
    const secret = await this.webhookService.getSecretForRegistration(registrationId);
    const signature = createWebhookSignature(secret, timestamp, body);

    const start = Date.now();
    let responseStatus: number | undefined;
    let failureReason: string | undefined;

    try {
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-agentpay-timestamp': timestamp,
          'x-agentpay-event-id': eventId,
          'x-agentpay-signature': signature
        },
        body
      });

      responseStatus = response.status;

      if (!response.ok) {
        failureReason = `HTTP ${response.status}`;
        throw new Error(failureReason);
      }
    } catch (error) {
      failureReason = failureReason ?? (error instanceof Error ? error.message : 'Unknown error');
    }

    const latency = Date.now() - start;

    await this.prisma.deliveryAttempt.create({
      data: {
        id: generateAttemptId(eventId, attempt),
        registrationId,
        ledgerEventId: eventId,
        attemptNumber: attempt,
        requestBodyHash: bodyHash,
        responseStatus: responseStatus ?? null,
        latencyMs: latency,
        failureReason: failureReason ?? null,
        signatureUsed: signature
      }
    });

    if (failureReason) {
      await this.prisma.webhookRegistration.update({
        where: { id: registrationId },
        data: {
          failureCount: { increment: 1 }
        }
      });

      if (attempt < this.env.WEBHOOK_MAX_RETRIES) {
        const delay = this.env.WEBHOOK_RETRY_BACKOFF_BASE_MS * Math.pow(this.env.WEBHOOK_RETRY_BACKOFF_FACTOR, attempt - 1);
        setTimeout(() => {
          void this.dispatchWithRetry({
            registrationId,
            targetUrl,
            eventId,
            eventType,
            body,
            bodyHash,
            attempt: attempt + 1
          }).catch((error) => {
            // eslint-disable-next-line no-console
            console.error('WebhookDispatcher retry failure', error);
          });
        }, delay).unref?.();
        return;
      }

      await this.ledgerService.recordEvent({
        type: WebhookEventType.WEBHOOK_DELIVERY_FAILED,
        payload: {
          type: 'webhook.delivery.failed',
          eventId,
          registrationId,
          failureReason
        }
      });
      return;
    }

    await this.prisma.webhookRegistration.update({
      where: { id: registrationId },
      data: {
        failureCount: 0,
        lastDeliveryAt: new Date()
      }
    });

    await this.ledgerService.recordEvent({
      type: WebhookEventType.WEBHOOK_DELIVERY_SUCCEEDED,
      payload: {
        type: 'webhook.delivery.succeeded',
        eventId,
        registrationId
      }
    });
  }
}

function generateAttemptId(eventId: string, attempt: number): string {
  return `${eventId}-${attempt}`;
}
