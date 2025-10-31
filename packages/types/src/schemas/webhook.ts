import { z } from 'zod';
import {
  iso8601Schema,
  nullableIso8601Schema,
  solanaAddressSchema,
  ulidSchema
} from './common';
import { webhookEventTypeSchema } from './enums';
import { invoiceSchema } from './invoice';
import { paymentSchema } from './payment';

export const webhookRegistrationSchema = z.object({
  id: ulidSchema,
  ownerAgentId: ulidSchema,
  targetUrl: z.string().url(),
  eventFilter: z.array(webhookEventTypeSchema),
  active: z.boolean(),
  verificationNonce: z.string(),
  lastDeliveryAt: nullableIso8601Schema,
  failureCount: z.number().int(),
  createdAt: iso8601Schema,
  updatedAt: iso8601Schema
});

export type WebhookRegistration = z.infer<typeof webhookRegistrationSchema>;

export const registerWebhookRequestSchema = z.object({
  targetUrl: z.string().url(),
  eventTypes: z.array(webhookEventTypeSchema).nonempty(),
  sharedSecret: z.string().min(16),
  description: z.string().optional()
});

export const registerWebhookResponseSchema = z.object({
  registration: webhookRegistrationSchema,
  verificationChallenge: z.string()
});

export type RegisterWebhookResponse = z.infer<typeof registerWebhookResponseSchema>;

export const listWebhooksResponseSchema = z.object({
  webhooks: z.array(webhookRegistrationSchema),
  nextCursor: z.string().nullable()
});

export const deleteWebhookResponseSchema = z.object({
  success: z.boolean()
});

export type DeleteWebhookResponse = z.infer<typeof deleteWebhookResponseSchema>;

export const deliveryAttemptSchema = z.object({
  id: ulidSchema,
  eventId: ulidSchema,
  attemptNumber: z.number().int().positive(),
  requestBodyHash: z.string(),
  responseStatus: z.number().int().nullable(),
  latencyMs: z.number().int().nullable(),
  failureReason: z.string().nullable(),
  signatureUsed: z.string().nullable(),
  createdAt: iso8601Schema
});

export const getDeliveryAttemptsResponseSchema = z.object({
  attempts: z.array(deliveryAttemptSchema)
});

export type GetDeliveryAttemptsResponse = z.infer<typeof getDeliveryAttemptsResponseSchema>;

export const webhookDeadLetterSchema = z.object({
  id: ulidSchema,
  registrationId: ulidSchema,
  eventId: ulidSchema,
  failureReason: z.string(),
  attemptCount: z.number().int().nonnegative(),
  body: z.string(),
  bodyHash: z.string(),
  lastAttemptAt: iso8601Schema,
  createdAt: iso8601Schema,
  updatedAt: iso8601Schema
});

export type WebhookDeadLetter = z.infer<typeof webhookDeadLetterSchema>;

export const listWebhookDeadLettersResponseSchema = z.object({
  deadLetters: z.array(webhookDeadLetterSchema),
  nextCursor: z.string().nullable()
});

export const replayWebhookDeadLetterResponseSchema = z.object({
  success: z.boolean()
});

export const webhookEventPayloadSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('invoice.created'),
    invoice: invoiceSchema
  }),
  z.object({
    type: z.literal('invoice.expired'),
    invoice: invoiceSchema
  }),
  z.object({
    type: z.literal('payment.submitted'),
    payment: paymentSchema
  }),
  z.object({
    type: z.literal('payment.confirmed'),
    payment: paymentSchema
  }),
  z.object({
    type: z.literal('webhook.delivery.succeeded'),
    registrationId: ulidSchema,
    eventId: ulidSchema
  }),
  z.object({
    type: z.literal('webhook.delivery.failed'),
    registrationId: ulidSchema,
    eventId: ulidSchema,
    failureReason: z.string()
  })
]);

export type WebhookEventPayload = z.infer<typeof webhookEventPayloadSchema>;

export const webhookSignatureHeadersSchema = z.object({
  'x-agentpay-signature': z.string(),
  'x-agentpay-timestamp': z.string(),
  'x-agentpay-event-id': ulidSchema
});

export const balanceResponseSchema = z.object({
  walletAddress: solanaAddressSchema,
  assetSymbol: z.string(),
  amount: z.string(),
  lastObservedSlot: z.string(),
  observedAt: iso8601Schema,
  stale: z.boolean()
});

export type BalanceResponse = z.infer<typeof balanceResponseSchema>;
