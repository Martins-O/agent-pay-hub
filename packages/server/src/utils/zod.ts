import { ZodTypeAny, z } from 'zod';
import { AgentPayError } from '../errors/agentpay-error';

export function parseWithZod<TSchema extends ZodTypeAny>(
  schema: TSchema,
  data: unknown
): z.infer<TSchema> {
  const result = schema.safeParse(data);

  if (!result.success) {
    const details = result.error.flatten();
    throw new AgentPayError({
      statusCode: 400,
      code: 'VALIDATION_FAILED',
      message: 'Validation failed.',
      details: {
        fieldErrors: details.fieldErrors,
        formErrors: details.formErrors
      }
    });
  }

  return result.data;
}

export type Infer<T extends ZodTypeAny> = z.infer<T>;
