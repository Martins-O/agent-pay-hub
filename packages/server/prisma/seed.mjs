import 'dotenv/config';
import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';
import { ulid } from 'ulid';
import crypto from 'node:crypto';

const prisma = new PrismaClient();

function ensureApiKey(value) {
  if (value && value.includes('.')) {
    return value.trim();
  }

  const prefix = `agent_${ulid().toLowerCase()}`;
  const secret = crypto.randomBytes(24).toString('hex');
  return `${prefix}.${secret}`;
}

function parseScopes(value) {
  if (!value) {
    return ['*'];
  }

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.every((scope) => typeof scope === 'string')) {
      return parsed;
    }
  } catch (_) {
    // fall through to comma split
  }

  return value
    .split(',')
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0);
}

async function main() {
  const suppliedKey = process.env.SEED_AGENT_API_KEY?.trim();
  const apiKey = ensureApiKey(suppliedKey);
  const [apiKeyPrefix] = apiKey.split('.');

  if (!apiKeyPrefix) {
    throw new Error('Failed to derive API key prefix.');
  }

  const hash = await argon2.hash(apiKey);

  const agentId = process.env.SEED_AGENT_ID?.trim() || ulid();
  const rateLimitBucket = Number.parseInt(process.env.SEED_AGENT_RATE_LIMIT_BUCKET ?? '', 10);
  const defaultBucket = Number.parseInt(process.env.RATE_LIMIT_BUCKET_SIZE ?? '100', 10);
  const bucketSize = Number.isFinite(rateLimitBucket) ? rateLimitBucket : defaultBucket;
  const allowedScopes = parseScopes(process.env.SEED_AGENT_SCOPES ?? '');

  const agent = await prisma.agent.upsert({
    where: { apiKeyPrefix },
    update: {
      apiKeyHash: hash,
      rateLimitBucket: bucketSize,
      allowedScopes
    },
    create: {
      id: agentId,
      apiKeyPrefix,
      apiKeyHash: hash,
      rateLimitBucket: bucketSize,
      allowedScopes
    }
  });

  console.log('Seeded development agent:', agent.id);

  if (!suppliedKey) {
    console.log('Generated API key (store securely):', apiKey);
  } else {
    console.log('Using API key from environment for seed agent.');
  }
}

main()
  .catch((error) => {
    console.error('Failed to seed development data', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
