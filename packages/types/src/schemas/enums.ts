import { z } from 'zod';

export const invoiceStatusSchema = z.enum(['DRAFT', 'OPEN', 'PAID', 'EXPIRED', 'CANCELED']);
export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;

export const paymentStatusSchema = z.enum(['PENDING', 'CONFIRMED', 'FAILED']);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

export const webhookEventTypeSchema = z.enum([
  'invoice.created',
  'invoice.expired',
  'payment.submitted',
  'payment.confirmed',
  'webhook.delivery.succeeded',
  'webhook.delivery.failed'
]);
export type WebhookEventType = z.infer<typeof webhookEventTypeSchema>;

export const auditActionCategorySchema = z.enum(['ADMIN', 'SECURITY', 'BILLING', 'OPERATIONS']);
export type AuditActionCategory = z.infer<typeof auditActionCategorySchema>;
