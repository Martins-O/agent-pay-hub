import { Prisma, PrismaClient, InvoiceStatus, WebhookEventType } from '@prisma/client';
import { CreateInvoiceRequest, Invoice } from '@agentpay/types';
import { AgentIdentity } from '../auth/api-key-service';
import { generateUlid } from '../utils/id';
import { AppEnv } from '../config';
import { X402Adapter } from '../adapters/x402-adapter';
import { LedgerService } from './ledger-service';
import { AgentPayError } from '../errors/agentpay-error';

interface InvoiceWithRelations extends Prisma.InvoiceGetPayload<{ include: { payments: true } }> {}

export class InvoiceService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly env: AppEnv,
    private readonly x402: X402Adapter,
    private readonly ledger: LedgerService
  ) {}

  async createInvoice(agent: AgentIdentity, payload: CreateInvoiceRequest): Promise<Invoice> {
    this.assertAssetSupported(payload.assetSymbol);
    this.assertPositiveAmount(payload.amount);

    const currencyPrecision = this.resolveCurrencyPrecision(payload.assetSymbol);
    const invoiceId = generateUlid();
    const nonce = this.x402.generateNonce();
    const shortCode = this.generateShortCode();

    const intent = this.x402.createInvoiceIntent({
      invoiceId,
      assetSymbol: payload.assetSymbol,
      amount: payload.amount,
      recipientWalletAddress: payload.recipientWalletAddress,
      payerWalletAddress: payload.payerWalletAddress,
      memo: payload.memo,
      expiresAt: payload.expiry,
      nonce
    });

    const encodedIntent = this.x402.encodeIntent(intent);
    const paymentRequestUri = this.x402.buildPaymentRequestUri(encodedIntent);

    const expiryDate = payload.expiry ? new Date(payload.expiry) : null;
    if (expiryDate && expiryDate.getTime() <= Date.now()) {
      throw new AgentPayError({
        statusCode: 400,
        code: 'VALIDATION_FAILED',
        message: 'Expiry must be in the future.'
      });
    }

    const created = await this.prisma.invoice.create({
      data: {
        id: invoiceId,
        creatorAgentId: agent.id,
        payerWalletAddress: payload.payerWalletAddress ?? null,
        recipientWalletAddress: payload.recipientWalletAddress,
        assetSymbol: payload.assetSymbol,
        amount: new Prisma.Decimal(payload.amount),
        currencyPrecision,
        memo: payload.memo ?? null,
        expiry: expiryDate,
        status: InvoiceStatus.OPEN,
        x402Intent: encodedIntent,
        nonce,
        paymentRequestUri,
        shortCode
      },
      include: {
        payments: {
          orderBy: {
            createdAt: 'desc'
          }
        }
      }
    });

    await this.ledger.recordEvent({
      type: WebhookEventType.INVOICE_CREATED,
      invoiceId: created.id,
      payload: {
        type: 'invoice.created',
        invoiceId: created.id,
        agentId: agent.id
      }
    });

    return this.toDto(created);
  }

  async getInvoice(agent: AgentIdentity, invoiceId: string): Promise<Invoice> {
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        creatorAgentId: agent.id
      },
      include: {
        payments: {
          orderBy: {
            createdAt: 'desc'
          }
        }
      }
    });

    if (!invoice) {
      throw new AgentPayError({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Invoice not found.'
      });
    }

    return this.toDto(invoice);
  }

  async cancelInvoice(agent: AgentIdentity, invoiceId: string): Promise<Invoice> {
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        creatorAgentId: agent.id
      },
      include: {
        payments: {
          orderBy: {
            createdAt: 'desc'
          }
        }
      }
    });

    if (!invoice) {
      throw new AgentPayError({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Invoice not found.'
      });
    }

    if (invoice.status !== InvoiceStatus.OPEN && invoice.status !== InvoiceStatus.DRAFT) {
      throw new AgentPayError({
        statusCode: 409,
        code: 'CONFLICT',
        message: 'Only open or draft invoices can be canceled.'
      });
    }

    const hasConfirmedPayment = invoice.payments.some(
      (payment) => payment.confirmationStatus === 'CONFIRMED'
    );

    if (hasConfirmedPayment) {
      throw new AgentPayError({
        statusCode: 409,
        code: 'CONFLICT',
        message: 'Cannot cancel an invoice with a confirmed payment.'
      });
    }

    const updated = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: InvoiceStatus.CANCELED,
        canceledAt: new Date()
      },
      include: {
        payments: {
          orderBy: {
            createdAt: 'desc'
          }
        }
      }
    });

    await this.ledger.recordEvent({
      type: WebhookEventType.INVOICE_EXPIRED,
      invoiceId: updated.id,
      payload: {
        type: 'invoice.expired',
        reason: 'canceled',
        invoiceId: updated.id,
        agentId: agent.id
      }
    });

    return this.toDto(updated);
  }

  private toDto(invoice: InvoiceWithRelations): Invoice {
    const latestPayment = invoice.payments[0] ?? null;

    return {
      id: invoice.id,
      creatorAgentId: invoice.creatorAgentId,
      payerWalletAddress: invoice.payerWalletAddress,
      recipientWalletAddress: invoice.recipientWalletAddress,
      assetSymbol: invoice.assetSymbol,
      amount: invoice.amount.toString(),
      currencyPrecision: invoice.currencyPrecision,
      memo: invoice.memo,
      createdAt: invoice.createdAt.toISOString(),
      expiry: invoice.expiry ? invoice.expiry.toISOString() : null,
      status: invoice.status,
      x402Intent: invoice.x402Intent,
      nonce: invoice.nonce,
      paymentRequestUri: invoice.paymentRequestUri,
      shortCode: invoice.shortCode,
      payment: latestPayment
        ? {
            id: latestPayment.id,
            invoiceId: latestPayment.invoiceId,
            submittedByAgentId: latestPayment.submittedById,
            payerWalletAddress: latestPayment.payerWalletAddress,
            recipientWalletAddress: latestPayment.recipientWalletAddress,
            onChainSignature: latestPayment.onChainSignature,
            slot: latestPayment.slot ? latestPayment.slot.toString() : null,
            confirmationStatus: latestPayment.confirmationStatus,
            feeEstimateLamports: latestPayment.feeEstimateLamports
              ? latestPayment.feeEstimateLamports.toString()
              : null,
            feeActualLamports: latestPayment.feeActualLamports
              ? latestPayment.feeActualLamports.toString()
              : null,
            errorCode: latestPayment.errorCode,
            createdAt: latestPayment.createdAt.toISOString(),
            submittedAt: latestPayment.submittedAt
              ? latestPayment.submittedAt.toISOString()
              : null,
            confirmedAt: latestPayment.confirmedAt
              ? latestPayment.confirmedAt.toISOString()
              : null
          }
        : null
    };
  }

  private resolveCurrencyPrecision(assetSymbol: string): number {
    const precision = this.env.ALLOWED_ASSET_DECIMALS[assetSymbol];
    if (typeof precision === 'number') {
      return precision;
    }

    throw new AgentPayError({
      statusCode: 400,
      code: 'VALIDATION_FAILED',
      message: `Currency precision missing for asset ${assetSymbol}.`
    });
  }

  private assertAssetSupported(assetSymbol: string): void {
    const allowed = this.env.ALLOWED_ASSETS[assetSymbol];
    if (!allowed) {
      throw new AgentPayError({
        statusCode: 400,
        code: 'VALIDATION_FAILED',
        message: `Asset ${assetSymbol} is not supported.`
      });
    }
  }

  private assertPositiveAmount(amount: string): void {
    const decimal = new Prisma.Decimal(amount);
    if (decimal.lte(0)) {
      throw new AgentPayError({
        statusCode: 400,
        code: 'VALIDATION_FAILED',
        message: 'Amount must be greater than zero.'
      });
    }
  }

  private generateShortCode(): string {
    return generateUlid().slice(0, 8).toLowerCase();
  }
}
