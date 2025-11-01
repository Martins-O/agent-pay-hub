export type SolanaAdapterErrorCode =
  | 'SIGNER_NOT_AVAILABLE'
  | 'SIGNER_MISMATCH'
  | 'RPC_BLOCKHASH_FAILED'
  | 'RPC_FEE_ESTIMATE_FAILED'
  | 'FEE_LIMIT_EXCEEDED'
  | 'RPC_SEND_FAILED'
  | 'RPC_CONFIRMATION_TIMEOUT'
  | 'RPC_CONFIRMATION_FAILED';

export interface SolanaAdapterErrorOptions {
  cause?: unknown;
  details?: Record<string, unknown>;
}

export class SolanaAdapterError extends Error {
  public readonly code: SolanaAdapterErrorCode;
  public readonly details?: Record<string, unknown>;

  constructor(code: SolanaAdapterErrorCode, message: string, options: SolanaAdapterErrorOptions = {}) {
    super(message);
    this.name = 'SolanaAdapterError';
    this.code = code;
    this.details = options.details;
    if (options.cause) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

export function isSolanaAdapterError(error: unknown): error is SolanaAdapterError {
  return error instanceof SolanaAdapterError;
}
