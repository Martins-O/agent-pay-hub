import { Connection, PublicKey, TransactionSignature } from '@solana/web3.js';
import { AppEnv } from '../config';
import { generateUlid } from '../utils/id';

export interface SimulationDetails {
  logs: string[];
  unitsConsumed?: number;
  estimatedFeeLamports?: number;
}

export interface SimulationResult {
  success: boolean;
  error?: string;
  details: SimulationDetails;
}

export interface SubmitResult {
  signature: TransactionSignature;
  slot?: number;
  feeLamports?: number;
}

export interface ConfirmResult {
  signature: TransactionSignature;
  slot: number;
  status: 'confirmed' | 'finalized';
}

export interface BalanceResult {
  walletAddress: string;
  lamports: bigint;
  slot: number;
  fetchedAt: Date;
}

export interface TransferRequest {
  payer: string;
  recipient: string;
  lamports: bigint;
  memo?: string;
  maxFeeLamports?: bigint;
}

export class SolanaAdapter {
  private readonly connection: Connection;

  constructor(private readonly env: AppEnv) {
    this.connection = new Connection(env.SOLANA_RPC_ENDPOINT, {
      commitment: env.SOLANA_COMMITMENT_LEVEL
    });
  }

  async simulateTransfer(_request: TransferRequest): Promise<SimulationResult> {
    // TODO: integrate actual Solana transaction simulation.
    return {
      success: true,
      details: {
        logs: ['Simulation placeholder: integrate web3.js sendTransaction simulation'],
        unitsConsumed: 500,
        estimatedFeeLamports: 5000
      }
    };
  }

  async submitTransfer(_request: TransferRequest): Promise<SubmitResult> {
    if (this.env.SOLANA_SIMULATION_ONLY) {
      return {
        signature: `SIM-${generateUlid()}`,
        slot: 0,
        feeLamports: 0
      };
    }

    // TODO: integrate actual transfer submission via signer context.
    return {
      signature: `TX-${generateUlid()}`,
      slot: 0,
      feeLamports: 5000
    };
  }

  async confirmTransaction(signature: TransactionSignature): Promise<ConfirmResult> {
    if (this.env.SOLANA_SIMULATION_ONLY) {
      return {
        signature,
        slot: 0,
        status: 'confirmed'
      };
    }

    // TODO: call connection.confirmTransaction with configured commitment.
    return {
      signature,
      slot: 0,
      status: 'confirmed'
    };
  }

  async getBalance(walletAddress: string): Promise<BalanceResult> {
    const now = new Date();

    if (this.env.SOLANA_SIMULATION_ONLY) {
      return {
        walletAddress,
        lamports: 1_000_000_000n,
        slot: 0,
        fetchedAt: now
      };
    }

    const publicKey = new PublicKey(walletAddress);
    const balance = await this.connection.getBalanceAndContext(publicKey, this.env.SOLANA_COMMITMENT_LEVEL);

    return {
      walletAddress,
      lamports: BigInt(balance.value),
      slot: balance.context.slot,
      fetchedAt: now
    };
  }
}
