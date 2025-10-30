import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { AgentPayError } from '../errors/agentpay-error';

export interface AgentIdentity {
  id: string;
  scopes: string[];
}

export class ApiKeyAuthService {
  constructor(private readonly prisma: PrismaClient) {}

  async authenticate(apiKey?: string): Promise<AgentIdentity> {
    if (!apiKey) {
      throw new AgentPayError({
        statusCode: 401,
        code: 'AUTH_MISSING_API_KEY',
        message: 'API key is required in the `x-api-key` header.'
      });
    }

    const [prefix] = this.parseApiKey(apiKey);

    const agent = await this.prisma.agent.findUnique({
      where: {
        apiKeyPrefix: prefix
      }
    });

    if (!agent) {
      throw new AgentPayError({
        statusCode: 401,
        code: 'AUTH_INVALID_API_KEY',
        message: 'API key is invalid.'
      });
    }

    const isValid = await argon2.verify(agent.apiKeyHash, apiKey);

    if (!isValid) {
      throw new AgentPayError({
        statusCode: 401,
        code: 'AUTH_INVALID_API_KEY',
        message: 'API key is invalid.'
      });
    }

    return {
      id: agent.id,
      scopes: agent.allowedScopes
    };
  }

  private parseApiKey(apiKey: string): [string, string] {
    const parts = apiKey.split('.');

    if (parts.length !== 2) {
      throw new AgentPayError({
        statusCode: 401,
        code: 'AUTH_INVALID_API_KEY',
        message: 'API key format is invalid.'
      });
    }

    const [prefix, secret] = parts;

    if (!prefix || !secret) {
      throw new AgentPayError({
        statusCode: 401,
        code: 'AUTH_INVALID_API_KEY',
        message: 'API key format is invalid.'
      });
    }

    return [prefix, secret];
  }
}
