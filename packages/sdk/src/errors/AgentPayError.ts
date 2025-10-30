import { type ErrorEnvelope } from '@agentpay/types';

export interface AgentPayErrorOptions {
  status: number;
  correlationId?: string;
  retryable?: boolean;
  details?: Record<string, unknown>;
}

export class AgentPayError extends Error {
  public readonly status: number;
  public readonly correlationId?: string;
  public readonly retryable: boolean;
  public readonly details?: Record<string, unknown>;

  constructor(message: string, options: AgentPayErrorOptions) {
    super(message);
    this.name = 'AgentPayError';
    this.status = options.status;
    this.correlationId = options.correlationId;
    this.retryable = options.retryable ?? false;
    this.details = options.details;
  }

  static fromEnvelope(status: number, envelope: ErrorEnvelope): AgentPayError {
    return new AgentPayError(envelope.message, {
      status,
      correlationId: envelope.correlationId,
      retryable: envelope.retryable ?? false,
      details: envelope.details ?? undefined
    });
  }
}
