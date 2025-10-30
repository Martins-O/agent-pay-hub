import { AppEnv } from '../config';
import { SolanaAdapter } from '../adapters/solana-adapter';
import { parseWithZod } from '../utils/zod';
import { balanceResponseSchema, type BalanceResponse } from '@agentpay/types';
import { AgentPayError } from '../errors/agentpay-error';
import { Prisma } from '@prisma/client';

export class BalanceService {
  constructor(private readonly env: AppEnv, private readonly solana: SolanaAdapter) {}

  async getBalance(walletAddress: string, assetSymbol: string): Promise<BalanceResponse> {
    this.assertAssetSupported(assetSymbol);

    const result = await this.solana.getBalance(walletAddress);
    const decimals = this.env.ALLOWED_ASSET_DECIMALS[assetSymbol];
    const divisor = new Prisma.Decimal(10).pow(decimals);
    const lamportsDecimal = new Prisma.Decimal(result.lamports.toString());
    const amount = lamportsDecimal.div(divisor).toString();

    return parseWithZod(balanceResponseSchema, {
      walletAddress,
      assetSymbol,
      amount,
      lastObservedSlot: result.slot.toString(),
      observedAt: result.fetchedAt.toISOString(),
      stale: false
    });
  }

  private assertAssetSupported(assetSymbol: string): void {
    if (typeof this.env.ALLOWED_ASSET_DECIMALS[assetSymbol] !== 'number') {
      throw new AgentPayError({
        statusCode: 400,
        code: 'VALIDATION_FAILED',
        message: `Asset ${assetSymbol} is not supported.`
      });
    }
  }
}
