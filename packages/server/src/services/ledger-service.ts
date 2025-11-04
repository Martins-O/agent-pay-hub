import { PrismaClient, WebhookEventType, Prisma } from '@prisma/client';
import { generateUlid } from '../utils/id';
import { EventBus } from '../events/event-bus';

export interface LedgerEventPayload {
  type: string;
  [key: string]: unknown;
}

export class LedgerService {
  constructor(private readonly prisma: PrismaClient, private readonly eventBus: EventBus) {}

  async recordEvent(params: {
    type: WebhookEventType;
    invoiceId?: string;
    paymentId?: string;
    payload: LedgerEventPayload;
  }): Promise<string> {
    const eventId = generateUlid();

    const created = await this.prisma.ledgerEvent.create({
      data: {
        id: eventId,
        invoiceId: params.invoiceId,
        paymentId: params.paymentId,
        eventType: params.type,
        payload: params.payload as Prisma.InputJsonValue
      }
    });
    this.eventBus.publishLedgerEvent({
      id: created.id,
      eventType: created.eventType,
      invoiceId: created.invoiceId,
      paymentId: created.paymentId,
      createdAt: created.createdAt,
      payload: created.payload as Record<string, unknown>
    });
    return eventId;
  }
}
