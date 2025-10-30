export type AgentPayErrorCode =
  | 'AUTH_INVALID_API_KEY'
  | 'AUTH_MISSING_API_KEY'
  | 'RATE_LIMIT_EXCEEDED'
  | 'VALIDATION_FAILED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INTERNAL_ERROR';

export interface AgentPayErrorOptions {
  statusCode: number;
  code: AgentPayErrorCode;
  message: string;
  details?: Record<string, unknown>;
  correlationId?: string;
  retryable?: boolean;
}

export class AgentPayError extends Error {
  public readonly statusCode: number;
  public readonly code: AgentPayErrorCode;
  public readonly details?: Record<string, unknown>;
  public readonly correlationId?: string;
  public readonly retryable: boolean;

  constructor(options: AgentPayErrorOptions) {
    super(options.message);
    this.name = 'AgentPayError';
    this.statusCode = options.statusCode;
    this.code = options.code;
    this.details = options.details;
    this.correlationId = options.correlationId;
    this.retryable = options.retryable ?? false;
  }
}
