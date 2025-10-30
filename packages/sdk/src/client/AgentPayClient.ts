import { z } from 'zod';
import {
  cancelInvoiceResponseSchema,
  createInvoiceRequestSchema,
  createInvoiceResponseSchema,
  executePaymentByIntentRequestSchema,
  executePaymentByInvoiceRequestSchema,
  executePaymentResponseSchema,
  getDeliveryAttemptsResponseSchema,
  getInvoiceResponseSchema,
  getPaymentResponseSchema,
  listWebhooksResponseSchema,
  registerWebhookRequestSchema,
  registerWebhookResponseSchema,
  balanceResponseSchema,
  deleteWebhookResponseSchema,
  webhookRegistrationSchema,
  type CreateInvoiceRequest,
  type CreateInvoiceResponse,
  type ExecutePaymentResponse,
  type ExecutePaymentByIntentRequest,
  type ExecutePaymentByInvoiceRequest,
  type GetDeliveryAttemptsResponse,
  type GetInvoiceResponse,
  type GetPaymentResponse,
  type BalanceResponse,
  type DeleteWebhookResponse,
  type RegisterWebhookResponse,
  type WebhookRegistration
} from '@agentpay/types';
import { HttpClient, type HttpClientConfig } from '../internal/http';
import { defaultIdempotencyKeyGenerator, type IdempotencyKeyGenerator } from '../utils/idempotency';

export interface AgentPayClientOptions extends Omit<HttpClientConfig, 'defaultHeaders'> {
  idempotencyKeyGenerator?: IdempotencyKeyGenerator;
}

export class AgentPayClient {
  private readonly http: HttpClient;
  private readonly idempotencyKeyGenerator: IdempotencyKeyGenerator;

  constructor(options: AgentPayClientOptions) {
    this.http = new HttpClient({
      baseUrl: options.baseUrl,
      apiKey: options.apiKey,
      timeoutMs: options.timeoutMs,
      fetchImpl: options.fetchImpl
    });
    this.idempotencyKeyGenerator = options.idempotencyKeyGenerator ?? defaultIdempotencyKeyGenerator;
  }

  async createInvoice(payload: CreateInvoiceRequest, idempotencyKey?: string): Promise<CreateInvoiceResponse> {
    const body = createInvoiceRequestSchema.parse(payload);
    const headerKey = idempotencyKey ?? this.idempotencyKeyGenerator();

    return this.http.request({
      method: 'POST',
      path: '/v1/invoices',
      headers: {
        'idempotency-key': headerKey
      },
      body,
      schema: createInvoiceResponseSchema
    });
  }

  async getInvoice(invoiceId: string): Promise<GetInvoiceResponse> {
    return this.http.request({
      method: 'GET',
      path: `/v1/invoices/${invoiceId}`,
      schema: getInvoiceResponseSchema
    });
  }

  async cancelInvoice(invoiceId: string, idempotencyKey?: string): Promise<CancelInvoiceResponse> {
    const headerKey = idempotencyKey ?? this.idempotencyKeyGenerator();
    const response = await this.http.request({
      method: 'POST',
      path: `/v1/invoices/${invoiceId}/cancel`,
      headers: {
        'idempotency-key': headerKey
      },
      schema: cancelInvoiceResponseSchema
    });
    return response;
  }

  async executePayment(
    payload: ExecutePaymentByInvoiceRequest | ExecutePaymentByIntentRequest,
    idempotencyKey?: string
  ): Promise<ExecutePaymentResponse> {
    if ('invoiceId' in payload) {
      executePaymentByInvoiceRequestSchema.parse(payload);
    } else {
      executePaymentByIntentRequestSchema.parse(payload);
    }

    const headerKey = idempotencyKey ?? this.idempotencyKeyGenerator();

    return this.http.request({
      method: 'POST',
      path: '/v1/payments',
      headers: {
        'idempotency-key': headerKey
      },
      body: payload,
      schema: executePaymentResponseSchema
    });
  }

  async getPayment(paymentId: string): Promise<GetPaymentResponse> {
    return this.http.request({
      method: 'GET',
      path: `/v1/payments/${paymentId}`,
      schema: getPaymentResponseSchema
    });
  }

  async getBalance(walletAddress: string, assetSymbol: string): Promise<BalanceResponse> {
    return this.http.request({
      method: 'GET',
      path: `/v1/balances/${walletAddress}`,
      query: {
        asset: assetSymbol
      },
      schema: balanceResponseSchema
    });
  }

  async registerWebhook(payload: { targetUrl: string; eventTypes: string[]; sharedSecret: string }): Promise<RegisterWebhookResponse> {
    const body = registerWebhookRequestSchema.parse(payload);
    return this.http.request({
      method: 'POST',
      path: '/v1/webhooks',
      body,
      schema: registerWebhookResponseSchema
    });
  }

  async verifyWebhook(webhookId: string, challenge: string): Promise<WebhookRegistration> {
    const body = { challenge };
    return this.http.request({
      method: 'POST',
      path: `/v1/webhooks/${webhookId}/verify`,
      body,
      schema: webhookRegistrationSchema
    });
  }

  async listWebhooks(params: { cursor?: string; limit?: number } = {}): Promise<ListWebhooksResponse> {
    return this.http.request({
      method: 'GET',
      path: '/v1/webhooks',
      query: {
        cursor: params.cursor,
        limit: params.limit
      },
      schema: listWebhooksResponseSchema
    });
  }

  async deleteWebhook(webhookId: string): Promise<DeleteWebhookResponse> {
    return this.http.request({
      method: 'DELETE',
      path: `/v1/webhooks/${webhookId}`,
      schema: deleteWebhookResponseSchema
    });
  }

  async getDeliveryAttempts(eventId: string): Promise<GetDeliveryAttemptsResponse> {
    return this.http.request({
      method: 'GET',
      path: `/v1/events/${eventId}/deliveries`,
      schema: getDeliveryAttemptsResponseSchema
    });
  }
}

type CancelInvoiceResponse = z.infer<typeof cancelInvoiceResponseSchema>;
type ListWebhooksResponse = z.infer<typeof listWebhooksResponseSchema>;
