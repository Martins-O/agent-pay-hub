import { Counter, Histogram } from 'prom-client';
import { registry } from './registry';

export const httpRequestDurationSeconds = new Histogram({
  name: 'agentpay_http_request_duration_seconds',
  help: 'Duration of HTTP requests processed by AgentPay Hub',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [registry]
});

export const invoicesCreatedTotal = new Counter({
  name: 'agentpay_invoices_created_total',
  help: 'Count of invoices created',
  labelNames: ['asset_symbol'],
  registers: [registry]
});

export const paymentsExecutedTotal = new Counter({
  name: 'agentpay_payments_executed_total',
  help: 'Count of payments executed',
  labelNames: ['mode', 'status'],
  registers: [registry]
});

export const webhookDeliveriesTotal = new Counter({
  name: 'agentpay_webhook_delivery_total',
  help: 'Count of webhook delivery attempts grouped by outcome',
  labelNames: ['outcome'],
  registers: [registry]
});
