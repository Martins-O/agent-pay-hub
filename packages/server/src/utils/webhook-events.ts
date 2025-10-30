import { WebhookEventType } from '@prisma/client';

export const prismaToApiEventType: Record<WebhookEventType, string> = {
  INVOICE_CREATED: 'invoice.created',
  INVOICE_EXPIRED: 'invoice.expired',
  PAYMENT_SUBMITTED: 'payment.submitted',
  PAYMENT_CONFIRMED: 'payment.confirmed',
  WEBHOOK_DELIVERY_SUCCEEDED: 'webhook.delivery.succeeded',
  WEBHOOK_DELIVERY_FAILED: 'webhook.delivery.failed'
};

const apiToPrisma = Object.entries(prismaToApiEventType).reduce<Record<string, WebhookEventType>>(
  (acc, [prismaValue, apiValue]) => {
    acc[apiValue] = prismaValue as WebhookEventType;
    return acc;
  },
  {}
);

export function toPrismaEventType(apiValue: string): WebhookEventType {
  const mapped = apiToPrisma[apiValue];
  if (!mapped) {
    throw new Error(`Unsupported webhook event type: ${apiValue}`);
  }
  return mapped;
}

export function toApiEventType(prismaValue: WebhookEventType): string {
  return prismaToApiEventType[prismaValue];
}
