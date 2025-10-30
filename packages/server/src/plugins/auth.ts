import fp from 'fastify-plugin';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ApiKeyAuthService, AgentIdentity } from '../auth/api-key-service';
import { AgentPayError } from '../errors/agentpay-error';

export interface AuthPluginOptions {
  authService: ApiKeyAuthService;
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void>;
  }

  interface FastifyRequest {
    agent?: AgentIdentity;
  }
}

export default fp<AuthPluginOptions>(async function authPlugin(app: FastifyInstance, opts) {
  const { authService } = opts;

  app.decorate('authenticate', async (request: FastifyRequest) => {
    const apiKeyHeader = request.headers['x-api-key'];

    if (!apiKeyHeader || typeof apiKeyHeader !== 'string') {
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
});
