import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv();

const booleanSchema = z
  .union([z.string(), z.boolean()])
  .transform((value) => {
    if (typeof value === 'boolean') {
      return value;
    }

    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1';
  });

const parseJsonRecord = <T>(
  input: unknown,
  schema: z.ZodType<Record<string, T>>,
  fallback: Record<string, T>
): Record<string, T> => {
  if (typeof input === 'undefined' || input === null || input === '') {
    return fallback;
  }

  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input);
      return schema.parse(parsed);
    } catch (error) {
      throw new Error(`Invalid JSON provided: ${input}`);
    }
  }

  if (typeof input === 'object') {
    return schema.parse(input);
  }

  throw new Error(`Unsupported value provided: ${String(input)}`);
};

const stringRecordSchema = z.record(z.string());
const numberRecordSchema = z.record(z.number());

const parseStringList = (input: unknown, fallback: string[]): string[] => {
  if (typeof input === 'undefined' || input === null || input === '') {
    return fallback;
  }

  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (!Array.isArray(parsed)) {
          throw new Error('Value must be an array');
        }
        return parsed.map((value) => {
          if (typeof value !== 'string') {
            return String(value);
          }
          return value;
        });
      } catch (error) {
        throw new Error(`Invalid JSON provided: ${input}`);
      }
    }

    return trimmed
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
  }

  if (Array.isArray(input)) {
    return input
      .map((value) => (typeof value === 'string' ? value : String(value)))
      .filter((value) => value.length > 0);
  }

  throw new Error(`Unsupported value provided: ${String(input)}`);
};

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SERVER_HOST: z.string().default('0.0.0.0'),
  SERVER_PORT: z.coerce.number().int().positive().default(8080),
  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info'),
  LOG_JSON_ENABLED: booleanSchema.default(true),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_POOL_MIN: z.coerce.number().int().nonnegative().default(2),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
  CACHE_URL: z.string().min(1, 'CACHE_URL is required'),
  CACHE_NAMESPACE_TTL_INVOICE: z.coerce.number().int().positive().default(60 * 60 * 24),
  CACHE_NAMESPACE_TTL_NONCE: z.coerce.number().int().positive().default(300),
  API_KEY_ENCRYPTION_SECRET: z.string().min(1, 'API_KEY_ENCRYPTION_SECRET is required'),
  API_KEY_HASH_COST: z.coerce.number().int().positive().default(3),
  RATE_LIMIT_BUCKET_SIZE: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_REFILL_RATE: z.coerce.number().int().positive().default(10),
  WEBHOOK_BASE_URL: z.string().min(1, 'WEBHOOK_BASE_URL is required'),
  WEBHOOK_SIGNING_SECRET: z
    .string()
    .min(1, 'WEBHOOK_SIGNING_SECRET is required'),
  WEBHOOK_MAX_RETRIES: z.coerce.number().int().positive().default(5),
  WEBHOOK_RETRY_BACKOFF_BASE_MS: z.coerce.number().int().positive().default(1000),
  WEBHOOK_RETRY_BACKOFF_FACTOR: z.coerce.number().positive().default(2),
  SOLANA_RPC_ENDPOINT: z
    .string()
    .url('SOLANA_RPC_ENDPOINT must be a valid URL')
    .default('https://api.devnet.solana.com'),
  SOLANA_COMMITMENT_LEVEL: z
    .enum(['processed', 'confirmed', 'finalized'])
    .default('confirmed'),
  SOLANA_TX_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
  SOLANA_SIMULATION_ONLY: booleanSchema.default(true),
  SOLANA_PAYER_SECRET: z.string().min(1).optional(),
  SOLANA_PAYER_SECRETS: z
    .unknown()
    .transform((value) => parseStringList(value, []))
    .default([]),
  DEVNET_FAUCET_ADDRESS: z.string().min(1, 'DEVNET_FAUCET_ADDRESS is required'),
  ALLOWED_ASSETS: z
    .unknown()
    .transform((value) => parseJsonRecord(value, stringRecordSchema, {}))
    .default({}),
  ALLOWED_ASSET_DECIMALS: z
    .unknown()
    .transform((value) => parseJsonRecord(value, numberRecordSchema, {}))
    .default({}),
  IDEMPOTENCY_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24),
  SESSION_SECRET: z.string().min(1, 'SESSION_SECRET is required').optional()
});

export type AppEnv = z.infer<typeof EnvSchema>;

let cachedEnv: AppEnv | null = null;

export function loadAppEnv(): AppEnv {
  if (cachedEnv) {
    return cachedEnv;
  }

  const parsed = EnvSchema.safeParse(process.env);

  if (!parsed.success) {
    const message = parsed.error.errors
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join(', ');
    throw new Error(`Environment validation failed: ${message}`);
  }

  const payerSecrets: string[] = [];

  if (parsed.data.SOLANA_PAYER_SECRET) {
    payerSecrets.push(parsed.data.SOLANA_PAYER_SECRET);
  }

  if (parsed.data.SOLANA_PAYER_SECRETS.length > 0) {
    for (const secret of parsed.data.SOLANA_PAYER_SECRETS) {
      if (!payerSecrets.includes(secret)) {
        payerSecrets.push(secret);
      }
    }
  }

  if (!parsed.data.SOLANA_SIMULATION_ONLY && payerSecrets.length === 0) {
    throw new Error('SOLANA_PAYER_SECRET or SOLANA_PAYER_SECRETS is required when SOLANA_SIMULATION_ONLY=false');
  }

  const env: AppEnv = {
    ...parsed.data,
    SOLANA_PAYER_SECRETS: payerSecrets
  };

  cachedEnv = env;
  return env;
}
