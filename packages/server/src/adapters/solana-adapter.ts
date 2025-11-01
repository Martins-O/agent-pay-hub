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
import { Buffer } from 'node:buffer';
import { AppEnv } from '../config';
import { generateUlid } from '../utils/id';
import { SignerManager } from './signer-manager';
import { SolanaAdapterError } from './solana-errors';

export interface SimulationDetails {
  logs: string[];
  unitsConsumed?: number;
  estimatedFeeLamports?: number;
}

export interface SimulationResult {
  success: boolean;
  payer: string;
  error?: string;
  details: SimulationDetails;
}

export interface SubmitResult {
  signature: TransactionSignature;
  slot?: number;
  feeLamports?: number;
  blockhash: string;
  lastValidBlockHeight: number;
  payer: string;
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
  payer?: string;
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
  private readonly signerManager: SignerManager | null;

  constructor(private readonly env: AppEnv) {
    this.connection = new Connection(env.SOLANA_RPC_ENDPOINT, {
      commitment: env.SOLANA_COMMITMENT_LEVEL
    });

    if (env.SOLANA_SIMULATION_ONLY) {
      this.signerManager = this.createSignerManager(env.SOLANA_PAYER_SECRETS);
    } else {
      this.signerManager = this.createSignerManager(env.SOLANA_PAYER_SECRETS);
      if (!this.signerManager || !this.signerManager.hasSigners()) {
        throw new Error('At least one SOLANA_PAYER_SECRET is required when SOLANA_SIMULATION_ONLY=false');
      }
    }
  }

  selectPayer(requested?: string | null): string {
    const trimmed = typeof requested === 'string' ? requested.trim() : '';

    if (trimmed.length > 0) {
      if (!this.env.SOLANA_SIMULATION_ONLY) {
        const signer = this.signerManager?.getByAddress(trimmed);
        if (!signer) {
          throw new SolanaAdapterError('SIGNER_MISMATCH', 'No configured signer matches the provided payer wallet.', {
            details: { payer: trimmed }
          });
        }
      }
      return trimmed;
    }

    if (!this.signerManager || !this.signerManager.hasSigners()) {
      throw new SolanaAdapterError('SIGNER_NOT_AVAILABLE', 'Automatic payer selection requires at least one configured signer.');
    }

    return this.signerManager.getNext().publicKey.toBase58();
  }

  async simulateTransfer(request: TransferRequest): Promise<SimulationResult> {
    const payerAddress = this.selectPayer(request.payer);
    const signer = this.signerManager?.getByAddress(payerAddress) ?? null;
    const { transaction } = await this.prepareTransaction({ ...request, payer: payerAddress }, undefined, signer?.publicKey);

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
        payer: payerAddress,
        error: JSON.stringify(simulation.value.err),
        details
      };
    }

    return { success: true, payer: payerAddress, details };
  }

  async submitTransfer(request: TransferRequest): Promise<SubmitResult> {
    const payerAddress = this.selectPayer(request.payer);

    if (this.env.SOLANA_SIMULATION_ONLY) {
      return {
        signature: `SIM-${generateUlid()}` as TransactionSignature,
        slot: 0,
        feeLamports: 0,
        blockhash: 'simulation',
        lastValidBlockHeight: 0,
        payer: payerAddress
      };
    }

    const signer = this.signerManager?.getByAddress(payerAddress);

    if (!signer) {
      throw new SolanaAdapterError('SIGNER_MISMATCH', 'No configured signer matches the provided payer wallet.', {
        details: { payer: payerAddress }
      });
    }

    const blockhashInfo = await this.getLatestBlockhash();

    const { transaction } = await this.prepareTransaction(
      { ...request, payer: payerAddress },
      blockhashInfo,
      signer.publicKey
    );

    transaction.sign([signer]);

    const feeForMessage = await this.getFeeForMessage(transaction);
    const estimatedFee = feeForMessage ?? undefined;

    if (typeof estimatedFee === 'number' && request.maxFeeLamports !== undefined) {
      if (BigInt(estimatedFee) > request.maxFeeLamports) {
        throw new SolanaAdapterError('FEE_LIMIT_EXCEEDED', 'Estimated transaction fee exceeds the provided maxFeeLamports.', {
          details: {
            estimatedLamports: estimatedFee,
            maxLamports: request.maxFeeLamports.toString()
          }
        });
      }
    }

    const signature = await this.sendTransaction(transaction, signer);

    return {
      signature,
      slot: undefined,
      feeLamports: estimatedFee,
      blockhash: blockhashInfo.blockhash,
      lastValidBlockHeight: blockhashInfo.lastValidBlockHeight,
      payer: payerAddress
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

    const timeoutMs = this.env.SOLANA_TX_TIMEOUT_MS;

    const confirmationPromise = (async () => {
      if (blockhash && lastValidBlockHeight) {
        return this.connection.confirmTransaction(
          {
            signature,
            blockhash,
            lastValidBlockHeight
          },
          this.env.SOLANA_COMMITMENT_LEVEL
        );
      }

      return this.connection.confirmTransaction(signature, this.env.SOLANA_COMMITMENT_LEVEL);
    })();

    const confirmation = await this.withTimeout(confirmationPromise, timeoutMs).catch((error) => {
      if (error instanceof SolanaAdapterError) {
        throw error;
      }
      throw new SolanaAdapterError('RPC_CONFIRMATION_FAILED', 'Failed to confirm transaction.', { cause: error });
    });

    if (!confirmation) {
      throw new SolanaAdapterError('RPC_CONFIRMATION_FAILED', 'Confirmation response was empty.');
    }

    if ((confirmation.value as { err?: unknown })?.err) {
      throw new SolanaAdapterError('RPC_CONFIRMATION_FAILED', 'Transaction returned an error during confirmation.', {
        details: { err: confirmation.value.err }
      });
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

  private createSignerManager(secrets: string[]): SignerManager | null {
    if (secrets.length === 0) {
      return null;
    }

    const signers = secrets.map((secret) => {
      const trimmed = secret.trim();
      if (trimmed.length === 0) {
        throw new Error('SOLANA_PAYER_SECRETS cannot contain empty values');
      }
      const decoded = bs58.decode(trimmed);
      return Keypair.fromSecretKey(decoded);
    });

    return new SignerManager(signers);
  }

  private async getLatestBlockhash(): Promise<BlockhashContext> {
    try {
      return await this.connection.getLatestBlockhash(this.env.SOLANA_COMMITMENT_LEVEL);
    } catch (error) {
      throw new SolanaAdapterError('RPC_BLOCKHASH_FAILED', 'Failed to fetch latest blockhash from Solana RPC.', {
        cause: error
      });
    }
  }

  private async getFeeForMessage(transaction: VersionedTransaction): Promise<number | null | undefined> {
    try {
      const feeForMessage = await this.connection.getFeeForMessage(
        transaction.message,
        this.env.SOLANA_COMMITMENT_LEVEL
      );
      return feeForMessage?.value ?? undefined;
    } catch (error) {
      throw new SolanaAdapterError('RPC_FEE_ESTIMATE_FAILED', 'Failed to estimate fee for transaction message.', {
        cause: error
      });
    }
  }

  private async sendTransaction(transaction: VersionedTransaction, signer: Keypair): Promise<TransactionSignature> {
    try {
      return await this.connection.sendTransaction(transaction, {
        skipPreflight: false,
        maxRetries: 3,
        preflightCommitment: this.env.SOLANA_COMMITMENT_LEVEL
      });
    } catch (error) {
      throw new SolanaAdapterError('RPC_SEND_FAILED', 'Failed to submit transaction to Solana RPC.', {
        cause: error,
        details: {
          feePayer: signer.publicKey.toBase58()
        }
      });
    }
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timeoutId: NodeJS.Timeout | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(
          new SolanaAdapterError('RPC_CONFIRMATION_TIMEOUT', 'Transaction confirmation exceeded timeout.', {
            details: { timeoutMs }
          })
        );
      }, timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  private async prepareTransaction(
    request: TransferRequest,
    blockhashInfo: BlockhashContext | undefined,
    feePayerOverride?: PublicKey
  ): Promise<{ transaction: VersionedTransaction; blockhashInfo: BlockhashContext }> {
    const info = blockhashInfo ?? (await this.connection.getLatestBlockhash(this.env.SOLANA_COMMITMENT_LEVEL));

    const payerKey = feePayerOverride ?? new PublicKey(request.payer ?? this.selectPayer());
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
