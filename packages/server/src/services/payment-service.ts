import {
  InvoiceStatus,
  PaymentStatus,
  Prisma,
  PrismaClient,
  WebhookEventType
} from '@prisma/client';
import {
  executePaymentByIntentRequestSchema,
  executePaymentByInvoiceRequestSchema,
  executePaymentResponseSchema,
  getPaymentResponseSchema,
  paymentSchema,
  type ExecutePaymentByIntentRequest,
  type ExecutePaymentByInvoiceRequest,
  type ExecutePaymentResponse,
  type GetPaymentResponse,
  type Payment as PaymentDto
} from '@agentpay/types';
import { AgentIdentity } from '../auth/api-key-service';
import { AgentPayError } from '../errors/agentpay-error';
import { parseWithZod } from '../utils/zod';
import { X402Adapter } from '../adapters/x402-adapter';
import { SolanaAdapter } from '../adapters/solana-adapter';
import { AppEnv } from '../config';
import { generateUlid } from '../utils/id';
import { LedgerService } from './ledger-service';
import { paymentsExecutedTotal } from '../metrics/metrics';

export class PaymentService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly env: AppEnv,
    private readonly x402: X402Adapter,
    private readonly solana: SolanaAdapter,
    private readonly ledger: LedgerService
  ) {}

  async executePayment(agent: AgentIdentity, body: unknown): Promise<ExecutePaymentResponse> {
    const byInvoiceParse = executePaymentByInvoiceRequestSchema.safeParse(body);
    const byIntentParse = executePaymentByIntentRequestSchema.safeParse(body);

    if (!byInvoiceParse.success && !byIntentParse.success) {
      throw new AgentPayError({
        statusCode: 400,
        code: 'VALIDATION_FAILED',
        message: 'Invalid payment request payload.',
        details: {
          byInvoiceErrors: byInvoiceParse.success ? undefined : byInvoiceParse.error.flatten(),
          byIntentErrors: byIntentParse.success ? undefined : byIntentParse.error.flatten()
        }
      });
    }

    if (byInvoiceParse.success) {
      return this.executePaymentForInvoice(agent, byInvoiceParse.data);
    }

    return this.executePaymentForIntent(agent, byIntentParse.data);
  }

  async getPayment(agent: AgentIdentity, paymentId: string): Promise<GetPaymentResponse> {
    const payment = await this.prisma.payment.findFirst({
      where: {
        id: paymentId,
        submittedById: agent.id
      },
      include: {
        invoice: true
      }
    });

    if (!payment) {
      throw new AgentPayError({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Payment not found.'
      });
    }

    const dto = this.toDto(payment);
    return parseWithZod(getPaymentResponseSchema, { payment: dto });
  }

  private async executePaymentForInvoice(
    agent: AgentIdentity,
    payload: ExecutePaymentByInvoiceRequest
  ): Promise<ExecutePaymentResponse> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: payload.invoiceId },
      include: { payments: true }
    });

    if (!invoice) {
      throw new AgentPayError({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Invoice not found.'
      });
    }

    return this.processPayment(agent, {
      invoice,
      payerWalletAddress: payload.payerWalletAddress,
      maxFeeLamports: payload.maxFeeLamports ? BigInt(payload.maxFeeLamports) : undefined,
      simulateOnly: payload.simulateOnly ?? false
    });
  }

  private async executePaymentForIntent(
    agent: AgentIdentity,
    payload: ExecutePaymentByIntentRequest
  ): Promise<ExecutePaymentResponse> {
    const intent = this.x402.decodeIntent(payload.x402Intent);

    const invoice = await this.prisma.invoice.findUnique({
      where: { id: intent.invoiceId },
      include: { payments: true }
    });

    if (!invoice) {
      throw new AgentPayError({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Invoice referenced in intent not found.'
      });
    }

    return this.processPayment(agent, {
      invoice,
      payerWalletAddress: payload.payerWalletAddress,
      maxFeeLamports: payload.maxFeeLamports ? BigInt(payload.maxFeeLamports) : undefined,
      simulateOnly: payload.simulateOnly ?? false
    });
  }

  private async processPayment(
    agent: AgentIdentity,
    params: {
      invoice: Prisma.InvoiceGetPayload<{ include: { payments: true } }>;
      payerWalletAddress: string;
      maxFeeLamports?: bigint;
      simulateOnly: boolean;
    }
  ): Promise<ExecutePaymentResponse> {
    const { invoice, payerWalletAddress, maxFeeLamports, simulateOnly } = params;

    if (invoice.status === InvoiceStatus.PAID) {
      throw new AgentPayError({
        statusCode: 409,
        code: 'CONFLICT',
        message: 'Invoice already paid.'
      });
    }

    if (invoice.status === InvoiceStatus.CANCELED || invoice.status === InvoiceStatus.EXPIRED) {
      throw new AgentPayError({
        statusCode: 409,
        code: 'CONFLICT',
        message: `Invoice cannot be paid while status=${invoice.status}.`
      });
    }

    if (invoice.expiry && invoice.expiry.getTime() <= Date.now()) {
      throw new AgentPayError({
        statusCode: 409,
        code: 'CONFLICT',
        message: 'Invoice has expired.'
      });
    }

    if (invoice.payerWalletAddress && invoice.payerWalletAddress !== payerWalletAddress) {
      throw new AgentPayError({
        statusCode: 400,
        code: 'VALIDATION_FAILED',
        message: 'Payer wallet does not match invoice restrictions.'
      });
    }

    const hasConfirmedPayment = invoice.payments.some(
      (payment) => payment.confirmationStatus === PaymentStatus.CONFIRMED
    );

    if (hasConfirmedPayment) {
      throw new AgentPayError({
        statusCode: 409,
        code: 'CONFLICT',
        message: 'Invoice already has a confirmed payment.'
      });
    }

    const hasPendingPayment = invoice.payments.some(
      (payment) => payment.confirmationStatus === PaymentStatus.PENDING
    );

    if (hasPendingPayment) {
      throw new AgentPayError({
        statusCode: 409,
        code: 'CONFLICT',
        message: 'Invoice already has a pending payment.'
      });
    }

    const amountLamports = this.toLamports(invoice.assetSymbol, invoice.amount);
    const metricsMode = simulateOnly || this.env.SOLANA_SIMULATION_ONLY ? 'simulation' : 'submit';

    const simulation = await this.solana.simulateTransfer({
      payer: payerWalletAddress,
      recipient: invoice.recipientWalletAddress,
      lamports: amountLamports,
      memo: invoice.memo ?? undefined,
      maxFeeLamports
    });

    if (!simulation.success) {
      paymentsExecutedTotal.labels(metricsMode, 'failed').inc();
      throw new AgentPayError({
        statusCode: 409,
        code: 'CONFLICT',
        message: 'Payment simulation failed.',
        details: {
          error: simulation.error,
          logs: simulation.details.logs
        },
        retryable: false
      });
    }

    const paymentId = generateUlid();

    const placeholderSignature =
      simulateOnly || this.env.SOLANA_SIMULATION_ONLY
        ? `SIMULATION_ONLY-${generateUlid()}`
        : `PENDING-${generateUlid()}`;

    const basePaymentData: Prisma.PaymentCreateInput = {
      id: paymentId,
      invoice: { connect: { id: invoice.id } },
      submittedBy: { connect: { id: agent.id } },
      payerWalletAddress,
      recipientWalletAddress: invoice.recipientWalletAddress,
      onChainSignature: placeholderSignature,
      confirmationStatus: PaymentStatus.PENDING,
      feeEstimateLamports: simulation.details.estimatedFeeLamports
        ? BigInt(simulation.details.estimatedFeeLamports)
        : null,
      simulationLogs: simulation.details,
      submittedAt: null,
      confirmedAt: null
    };

    let submittedPayment = await this.prisma.payment.create({
      data: basePaymentData,
      include: { invoice: true }
    });

    if (metricsMode === 'submit') {
      paymentsExecutedTotal.labels(metricsMode, 'pending').inc();
    }

    await this.ledger.recordEvent({
      type: WebhookEventType.PAYMENT_SUBMITTED,
      invoiceId: invoice.id,
      paymentId: submittedPayment.id,
      payload: {
        type: 'payment.submitted',
        paymentId: submittedPayment.id,
        invoiceId: invoice.id,
        agentId: agent.id,
        amount: invoice.amount.toString(),
        asset: invoice.assetSymbol
      }
    });

    if (simulateOnly || this.env.SOLANA_SIMULATION_ONLY) {
      paymentsExecutedTotal.labels('simulation', 'simulated').inc();
      const dto = this.toDto(submittedPayment);
      return parseWithZod(executePaymentResponseSchema, { payment: dto });
    }

    let submission;
    let confirmation;

    try {
      submission = await this.solana.submitTransfer({
        payer: payerWalletAddress,
        recipient: invoice.recipientWalletAddress,
        lamports: amountLamports,
        memo: invoice.memo ?? undefined,
        maxFeeLamports
      });

      confirmation = await this.solana.confirmTransaction(
        submission.signature,
        submission.blockhash,
        submission.lastValidBlockHeight
      );
    } catch (error) {
      paymentsExecutedTotal.labels(metricsMode, 'failed').inc();
      throw error;
    }

    submittedPayment = await this.prisma.payment.update({
      where: { id: submittedPayment.id },
      data: {
        onChainSignature: submission.signature,
        slot: confirmation.slot ? BigInt(confirmation.slot) : undefined,
        confirmationStatus: PaymentStatus.CONFIRMED,
        confirmedAt: new Date(),
        submittedAt: new Date(),
        feeActualLamports: submission.feeLamports ? BigInt(submission.feeLamports) : null
      },
      include: { invoice: true }
    });

    await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: InvoiceStatus.PAID
      }
    });

    await this.ledger.recordEvent({
      type: WebhookEventType.PAYMENT_CONFIRMED,
      invoiceId: invoice.id,
      paymentId: submittedPayment.id,
      payload: {
        type: 'payment.confirmed',
        paymentId: submittedPayment.id,
        invoiceId: invoice.id,
        agentId: agent.id,
        signature: submission.signature,
        slot: confirmation.slot
      }
    });

    paymentsExecutedTotal.labels(metricsMode, 'confirmed').inc();

    const dto = this.toDto(submittedPayment);
    return parseWithZod(executePaymentResponseSchema, { payment: dto });
  }

  private toLamports(assetSymbol: string, amount: Prisma.Decimal): bigint {
    const precision = this.env.ALLOWED_ASSET_DECIMALS[assetSymbol];
    if (typeof precision !== 'number') {
      throw new AgentPayError({
        statusCode: 400,
        code: 'VALIDATION_FAILED',
        message: `Missing precision for asset ${assetSymbol}.`
      });
    }

    const multiplier = new Prisma.Decimal(10).pow(precision);
    const lamportsDecimal = new Prisma.Decimal(amount).mul(multiplier);
    return BigInt(lamportsDecimal.toString());
  }

  private toDto(payment: Prisma.PaymentGetPayload<{ include: { invoice: true } }>): PaymentDto {
    return parseWithZod(paymentSchema, {
      id: payment.id,
      invoiceId: payment.invoiceId,
      submittedByAgentId: payment.submittedById,
      payerWalletAddress: payment.payerWalletAddress,
      recipientWalletAddress: payment.recipientWalletAddress,
      onChainSignature: payment.onChainSignature,
      slot: payment.slot ? payment.slot.toString() : null,
      confirmationStatus: payment.confirmationStatus,
      feeEstimateLamports: payment.feeEstimateLamports
        ? payment.feeEstimateLamports.toString()
        : null,
      feeActualLamports: payment.feeActualLamports
        ? payment.feeActualLamports.toString()
        : null,
      errorCode: payment.errorCode,
      createdAt: payment.createdAt.toISOString(),
      submittedAt: payment.submittedAt ? payment.submittedAt.toISOString() : null,
      confirmedAt: payment.confirmedAt ? payment.confirmedAt.toISOString() : null
    });
  }
}
