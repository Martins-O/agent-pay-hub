import { FastifyInstance } from 'fastify';
import { solanaAddressSchema } from '@agentpay/types';
import { BalanceService } from '../services/balance-service';
import { parseWithZod } from '../utils/zod';
import { AgentPayError } from '../errors/agentpay-error';
import { z } from 'zod';

export interface RegisterBalanceRoutesOptions {
  balanceService: BalanceService;
}

const walletParamSchema = solanaAddressSchema;
const balanceQuerySchema = z.object({
  asset: z.string().min(1)
});

export async function registerBalanceRoutes(
  app: FastifyInstance,
  opts: RegisterBalanceRoutesOptions
): Promise<void> {
  const { balanceService } = opts;

  app.get('/v1/balances/:walletAddress', async (request) => {
    const agent = request.agent;
    if (!agent) {
      throw new AgentPayError({
        statusCode: 401,
        code: 'AUTH_MISSING_API_KEY',
        message: 'Authentication required.'
      });
    }

    const params = request.params as Record<string, string>;
    const walletAddress = parseWithZod(walletParamSchema, params.walletAddress);
    const query = parseWithZod(balanceQuerySchema, request.query);

    return balanceService.getBalance(walletAddress, query.asset);
  });
}
