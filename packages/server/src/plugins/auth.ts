import fp from 'fastify-plugin';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ApiKeyAuthService, AgentIdentity } from '../auth/api-key-service';
import { AgentPayError } from '../errors/agentpay-error';
import { WalletSignatureService } from '../services/wallet-signature-service';
import { NonceService } from '../services/nonce-service';
import { WalletAuthContext } from '../auth/types';
import {
  walletSignaturesVerifiedTotal,
  walletSignatureFailuresTotal
} from '../metrics/metrics';

export interface AuthPluginOptions {
  authService: ApiKeyAuthService;
  walletSignatureService: WalletSignatureService;
  nonceService: NonceService;
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void>;
  }

  interface FastifyRequest {
    agent?: AgentIdentity;
    walletIdentity?: WalletAuthContext;
  }
}

function extractHeader(headers: FastifyRequest['headers'], name: string): string | undefined {
  const normalized = name.toLowerCase();
  const candidate = (headers as Record<string, string | string[] | undefined>)[normalized];
  if (typeof candidate === 'string') {
    return candidate;
  }
  if (Array.isArray(candidate) && candidate.length > 0) {
    return candidate[0];
  }
  return undefined;
}

export default fp<AuthPluginOptions>(async function authPlugin(app: FastifyInstance, opts) {
  const { authService, walletSignatureService, nonceService } = opts;

  app.decorate('authenticate', async (request: FastifyRequest) => {
    const apiKeyHeader = extractHeader(request.headers, 'x-api-key');

    if (!apiKeyHeader) {
      throw new AgentPayError({
        statusCode: 401,
        code: 'AUTH_MISSING_API_KEY',
        message: 'API key is required in the `x-api-key` header.'
      });
    }

    const identity = await authService.authenticate(apiKeyHeader);
    request.agent = identity;
  });

  app.addHook('onRequest', async (request, reply) => {
    const routeConfig = request.routeOptions?.config as { public?: boolean } | undefined;

    if (routeConfig?.public) {
      return;
    }

    await app.authenticate(request, reply);
  });

  app.addHook('preHandler', async (request, reply) => {
    const routeConfig = request.routeOptions?.config as { public?: boolean } | undefined;

    if (routeConfig?.public) {
      return;
    }

    const walletAddress = extractHeader(request.headers, 'x-wallet-address');
    const walletSignature = extractHeader(request.headers, 'x-wallet-signature');
    const walletNonce = extractHeader(request.headers, 'x-wallet-nonce');
    const walletTimestamp = extractHeader(request.headers, 'x-wallet-timestamp');

    const provided = [walletAddress, walletSignature, walletNonce, walletTimestamp].filter(
      (value) => typeof value === 'string'
    ).length;

    if (provided === 0) {
      return;
    }

    if (!walletAddress || !walletSignature || !walletNonce || !walletTimestamp) {
      throw new AgentPayError({
        statusCode: 401,
        code: 'AUTH_INVALID_SIGNATURE',
        message: 'Wallet signature requires address, signature, nonce, and timestamp headers.'
      });
    }

    const agent = request.agent;

    if (!agent) {
      throw new AgentPayError({
        statusCode: 401,
        code: 'AUTH_INVALID_SIGNATURE',
        message: 'Agent context missing for wallet signature validation.'
      });
    }

    const path = request.raw.url ?? request.url;

    const routeLabel = request.routeOptions?.url ?? (request as { routerPath?: string }).routerPath ?? 'unknown';

    try {
      await walletSignatureService.verifySignature({
        walletAddress,
        nonce: walletNonce,
        timestamp: walletTimestamp,
        signature: walletSignature,
        method: request.method,
        path,
        body: request.body
      });

      await nonceService.consume(agent.id, walletAddress, walletNonce);

      walletSignaturesVerifiedTotal.labels(request.method, routeLabel).inc();

      request.walletIdentity = {
        walletAddress,
        nonce: walletNonce,
        timestamp: walletTimestamp
      };
    } catch (error) {
      if (error instanceof AgentPayError) {
        walletSignatureFailuresTotal.labels(error.code).inc();
      } else {
        walletSignatureFailuresTotal.labels('UNEXPECTED').inc();
      }
      throw error;
    }
  });
});
