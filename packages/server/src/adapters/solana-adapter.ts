import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  type TransactionSignature
} from '@solana/web3.js';
import bs58 from 'bs58';
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
  blockhash: string;
  lastValidBlockHeight: number;
}

export interface ConfirmResult {
  signature: TransactionSignature;
  slot: number;
  status: 'processed' | 'confirmed' | 'finalized';
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

interface BlockhashContext {
  blockhash: string;
  lastValidBlockHeight: number;
}

export class SolanaAdapter {
  private readonly connection: Connection;
  private readonly signer: Keypair | null;

  constructor(private readonly env: AppEnv) {
    this.connection = new Connection(env.SOLANA_RPC_ENDPOINT, {
      commitment: env.SOLANA_COMMITMENT_LEVEL
    });

    if (env.SOLANA_SIMULATION_ONLY) {
      this.signer = null;
    } else {
      if (!env.SOLANA_PAYER_SECRET) {
        throw new Error('SOLANA_PAYER_SECRET is required when SOLANA_SIMULATION_ONLY is false');
      }

      const secret = bs58.decode(env.SOLANA_PAYER_SECRET.trim());
      this.signer = Keypair.fromSecretKey(secret);
    }
  }

  async simulateTransfer(request: TransferRequest): Promise<SimulationResult> {
    const signer = this.tryResolveSigner(request.payer);
    const { transaction } = await this.prepareTransaction(request, undefined, signer?.publicKey);

    if (signer) {
      transaction.sign([signer]);
    }

    const simulation = await this.connection.simulateTransaction(transaction, {
      sigVerify: Boolean(signer),
      commitment: this.env.SOLANA_COMMITMENT_LEVEL
    });

    const details: SimulationDetails = {
      logs: simulation.value.logs ?? [],
      unitsConsumed: simulation.value.unitsConsumed ?? undefined,
      estimatedFeeLamports: simulation.value.fee ?? undefined
    };

    if (simulation.value.err) {
      return {
        success: false,
        error: JSON.stringify(simulation.value.err),
        details
      };
    }

    return { success: true, details };
  }

  async submitTransfer(request: TransferRequest): Promise<SubmitResult> {
    if (this.env.SOLANA_SIMULATION_ONLY) {
      return {
        signature: `SIM-${generateUlid()}` as TransactionSignature,
        slot: 0,
        feeLamports: 0,
        blockhash: 'simulation',
        lastValidBlockHeight: 0
      };
    }

    const signer = this.requireSigner(request.payer);
    const blockhashInfo = await this.connection.getLatestBlockhash(this.env.SOLANA_COMMITMENT_LEVEL);
    const { transaction } = await this.prepareTransaction(request, blockhashInfo, signer.publicKey);

    transaction.sign([signer]);

    const feeForMessage = await this.connection.getFeeForMessage(
      transaction.message,
      this.env.SOLANA_COMMITMENT_LEVEL
    );

    const signature = await this.connection.sendTransaction(transaction, {
      skipPreflight: false,
      maxRetries: 3
    });

    return {
      signature,
      slot: undefined,
      feeLamports: feeForMessage?.value ?? undefined,
      blockhash: blockhashInfo.blockhash,
      lastValidBlockHeight: blockhashInfo.lastValidBlockHeight
    };
  }

  async confirmTransaction(
    signature: TransactionSignature,
    blockhash?: string,
    lastValidBlockHeight?: number
  ): Promise<ConfirmResult> {
    if (this.env.SOLANA_SIMULATION_ONLY) {
      return {
        signature,
        slot: 0,
        status: 'confirmed'
      };
    }

    let confirmation;
    if (blockhash && lastValidBlockHeight) {
      confirmation = await this.connection.confirmTransaction(
        {
          signature,
          blockhash,
          lastValidBlockHeight
        },
        this.env.SOLANA_COMMITMENT_LEVEL
      );
    } else {
      confirmation = await this.connection.confirmTransaction(signature, this.env.SOLANA_COMMITMENT_LEVEL);
    }

    const status = confirmation.value?.confirmationStatus ?? this.env.SOLANA_COMMITMENT_LEVEL;

    return {
      signature,
      slot: confirmation.context.slot,
      status
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

  private tryResolveSigner(payerAddress: string): Keypair | null {
    if (!this.signer) {
      return null;
    }

    if (this.signer.publicKey.toBase58() !== payerAddress) {
      return null;
    }

    return this.signer;
  }

  private requireSigner(payerAddress: string): Keypair {
    const signer = this.tryResolveSigner(payerAddress);
    if (!signer) {
      throw new Error('Configured signer does not match payer address or is unavailable');
    }
    return signer;
  }

  private async prepareTransaction(
    request: TransferRequest,
    blockhashInfo?: BlockhashContext,
    feePayerOverride?: PublicKey
  ): Promise<{ transaction: VersionedTransaction; blockhashInfo: BlockhashContext }> {
    const info =
      blockhashInfo ?? (await this.connection.getLatestBlockhash(this.env.SOLANA_COMMITMENT_LEVEL));

    const payerKey = feePayerOverride ?? new PublicKey(request.payer);
    const recipientKey = new PublicKey(request.recipient);

    const instructions = [
      SystemProgram.transfer({
        fromPubkey: payerKey,
        toPubkey: recipientKey,
        lamports: Number(request.lamports)
      })
    ];

    if (request.memo) {
      const memoInstruction = new TransactionInstruction({
        keys: [],
        programId: new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
        data: Buffer.from(request.memo, 'utf8')
      });
      instructions.push(memoInstruction);
    }

    const message = new TransactionMessage({
      payerKey,
      recentBlockhash: info.blockhash,
      instructions
    }).compileToV0Message();

    const transaction = new VersionedTransaction(message);

    return { transaction, blockhashInfo: info };
  }
}
