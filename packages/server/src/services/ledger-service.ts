import { PrismaClient, WebhookEventType } from '@prisma/client';
import { generateUlid } from '../utils/id';

export interface LedgerEventPayload {
  type: string;
  [key: string]: unknown;
}

export class LedgerService {
  constructor(private readonly prisma: PrismaClient) {}

  async recordEvent(params: {
    type: WebhookEventType;
    invoiceId?: string;
    paymentId?: string;
    payload: LedgerEventPayload;
  }): Promise<string> {
    const eventId = generateUlid();

    await this.prisma.ledgerEvent.create({
      data: {
        id: eventId,
        invoiceId: params.invoiceId,
        paymentId: params.paymentId,
        eventType: params.type,
        payload: params.payload
      }
    });

    return eventId;
  }
}
