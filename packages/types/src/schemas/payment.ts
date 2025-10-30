import { z } from 'zod';
import {
  decimalStringSchema,
  iso8601Schema,
  nullableIso8601Schema,
  solanaAddressSchema,
  ulidSchema
} from './common';
import { paymentStatusSchema } from './enums';

export const paymentSchema = z.object({
  id: ulidSchema,
  invoiceId: ulidSchema,
  submittedByAgentId: ulidSchema,
  payerWalletAddress: solanaAddressSchema,
  recipientWalletAddress: solanaAddressSchema,
  onChainSignature: z.string(),
  slot: z.string().optional().nullable(),
  confirmationStatus: paymentStatusSchema,
  feeEstimateLamports: decimalStringSchema.optional().nullable(),
  feeActualLamports: decimalStringSchema.optional().nullable(),
  errorCode: z.string().optional().nullable(),
  createdAt: iso8601Schema,
  submittedAt: nullableIso8601Schema,
  confirmedAt: nullableIso8601Schema
});

export type Payment = z.infer<typeof paymentSchema>;

export const executePaymentByInvoiceRequestSchema = z.object({
  invoiceId: ulidSchema,
  payerWalletAddress: solanaAddressSchema,
  maxFeeLamports: decimalStringSchema.optional(),
  simulateOnly: z.boolean().optional()
});

export type ExecutePaymentByInvoiceRequest = z.infer<typeof executePaymentByInvoiceRequestSchema>;

export const executePaymentByIntentRequestSchema = z.object({
  x402Intent: z.string(),
  payerWalletAddress: solanaAddressSchema,
  maxFeeLamports: decimalStringSchema.optional(),
  simulateOnly: z.boolean().optional()
});

export type ExecutePaymentByIntentRequest = z.infer<typeof executePaymentByIntentRequestSchema>;

export const executePaymentResponseSchema = z.object({
  payment: paymentSchema
});

export type ExecutePaymentResponse = z.infer<typeof executePaymentResponseSchema>;

export const getPaymentResponseSchema = z.object({
  payment: paymentSchema
});

export type GetPaymentResponse = z.infer<typeof getPaymentResponseSchema>;
