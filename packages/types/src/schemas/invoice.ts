import { z } from 'zod';
import {
  decimalStringSchema,
  iso8601Schema,
  nullableIso8601Schema,
  optionalMemoSchema,
  solanaAddressSchema,
  ulidSchema
} from './common';
import { invoiceStatusSchema } from './enums';
import { paymentSchema } from './payment';

export const invoiceSchema = z.object({
  id: ulidSchema,
  creatorAgentId: ulidSchema,
  payerWalletAddress: solanaAddressSchema.nullable(),
  recipientWalletAddress: solanaAddressSchema,
  assetSymbol: z.string().min(1),
  amount: decimalStringSchema,
  currencyPrecision: z.number().int().min(0),
  memo: z.string().nullable(),
  createdAt: iso8601Schema,
  expiry: nullableIso8601Schema,
  status: invoiceStatusSchema,
  x402Intent: z.string(),
  nonce: z.string(),
  paymentRequestUri: z.string().regex(/^x402:[A-Za-z0-9_-]+$/, 'Invalid x402 payment URI'),
  shortCode: z.string(),
  payment: paymentSchema.nullable().optional()
});

export type Invoice = z.infer<typeof invoiceSchema>;

export const createInvoiceRequestSchema = z.object({
  recipientWalletAddress: solanaAddressSchema,
  amount: decimalStringSchema,
  assetSymbol: z.string().min(1),
  payerWalletAddress: solanaAddressSchema.optional(),
  memo: optionalMemoSchema,
  expiry: iso8601Schema.optional()
});

export type CreateInvoiceRequest = z.infer<typeof createInvoiceRequestSchema>;

export const createInvoiceResponseSchema = z.object({
  invoice: invoiceSchema
});

export type CreateInvoiceResponse = z.infer<typeof createInvoiceResponseSchema>;

export const getInvoiceResponseSchema = z.object({
  invoice: invoiceSchema
});

export type GetInvoiceResponse = z.infer<typeof getInvoiceResponseSchema>;

export const cancelInvoiceResponseSchema = z.object({
  invoice: invoiceSchema
});

export type CancelInvoiceResponse = z.infer<typeof cancelInvoiceResponseSchema>;
