import { z } from 'zod';

export const ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/;
export const solanaAddressRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export const ulidSchema = z.string().regex(ulidRegex, 'Invalid ULID');
export const solanaAddressSchema = z
  .string()
  .regex(solanaAddressRegex, 'Invalid Solana address format');

export const iso8601Schema = z.string().datetime({ offset: true });
export const nullableIso8601Schema = iso8601Schema.nullable();

export const decimalStringSchema = z
  .string()
  .regex(/^[0-9]+(\.[0-9]+)?$/, 'Invalid decimal string');

export const optionalMemoSchema = z
  .string()
  .max(280, 'Memo must be 280 characters or fewer')
  .optional();

export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

export type Pagination = z.infer<typeof paginationSchema>;

export const errorEnvelopeSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
  correlationId: z.string(),
  retryable: z.boolean().default(false)
});

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
