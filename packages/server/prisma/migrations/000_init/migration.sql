-- Create enum types
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'OPEN', 'PAID', 'EXPIRED', 'CANCELED');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED');
CREATE TYPE "WebhookEventType" AS ENUM (
  'INVOICE_CREATED',
  'INVOICE_EXPIRED',
  'PAYMENT_SUBMITTED',
  'PAYMENT_CONFIRMED',
  'WEBHOOK_DELIVERY_SUCCEEDED',
  'WEBHOOK_DELIVERY_FAILED'
);
CREATE TYPE "AuditActionCategory" AS ENUM ('ADMIN', 'SECURITY', 'BILLING', 'OPERATIONS');

-- Agents table
CREATE TABLE "Agent" (
  "id" TEXT PRIMARY KEY,
  "apiKeyPrefix" TEXT NOT NULL UNIQUE,
  "apiKeyHash" TEXT NOT NULL,
  "rateLimitBucket" INTEGER NOT NULL,
  "allowedScopes" TEXT[] NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "lastActive" TIMESTAMPTZ
);

-- Invoices table
CREATE TABLE "Invoice" (
  "id" TEXT PRIMARY KEY,
  "creatorAgentId" TEXT NOT NULL REFERENCES "Agent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "payerWalletAddress" TEXT,
  "recipientWalletAddress" TEXT NOT NULL,
  "assetSymbol" TEXT NOT NULL,
  "amount" DECIMAL(65,18) NOT NULL,
  "currencyPrecision" INTEGER NOT NULL,
  "memo" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "expiry" TIMESTAMPTZ,
  "status" "InvoiceStatus" NOT NULL DEFAULT 'OPEN',
  "x402Intent" TEXT NOT NULL,
  "nonce" TEXT NOT NULL,
  "paymentRequestUri" TEXT NOT NULL,
  "shortCode" TEXT NOT NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "canceledAt" TIMESTAMPTZ
);

CREATE UNIQUE INDEX "Invoice_shortCode_key" ON "Invoice" ("shortCode");
CREATE INDEX "Invoice_creatorAgentId_idx" ON "Invoice" ("creatorAgentId");
CREATE INDEX "Invoice_status_idx" ON "Invoice" ("status");

-- Payments table
CREATE TABLE "Payment" (
  "id" TEXT PRIMARY KEY,
  "invoiceId" TEXT NOT NULL REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "submittedById" TEXT NOT NULL REFERENCES "Agent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "payerWalletAddress" TEXT NOT NULL,
  "recipientWalletAddress" TEXT NOT NULL,
  "onChainSignature" TEXT NOT NULL,
  "slot" BIGINT,
  "confirmationStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "feeEstimateLamports" BIGINT,
  "feeActualLamports" BIGINT,
  "errorCode" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "submittedAt" TIMESTAMPTZ,
  "confirmedAt" TIMESTAMPTZ,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "simulationLogs" JSONB
);

CREATE INDEX "Payment_invoiceId_idx" ON "Payment" ("invoiceId");
CREATE INDEX "Payment_confirmationStatus_idx" ON "Payment" ("confirmationStatus");

-- Ledger events
CREATE TABLE "LedgerEvent" (
  "id" TEXT PRIMARY KEY,
  "invoiceId" TEXT REFERENCES "Invoice" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "paymentId" TEXT REFERENCES "Payment" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "eventType" "WebhookEventType" NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX "LedgerEvent_eventType_idx" ON "LedgerEvent" ("eventType");

-- Webhook registrations
CREATE TABLE "WebhookRegistration" (
  "id" TEXT PRIMARY KEY,
  "ownerAgentId" TEXT NOT NULL REFERENCES "Agent" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "targetUrl" TEXT NOT NULL,
  "sharedSecretHash" TEXT NOT NULL,
  "sharedSecretCiphertext" TEXT NOT NULL,
  "eventFilter" TEXT[] NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "verificationNonce" TEXT NOT NULL,
  "lastDeliveryAt" TIMESTAMPTZ,
  "failureCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX "WebhookRegistration_ownerAgentId_idx" ON "WebhookRegistration" ("ownerAgentId");
CREATE INDEX "WebhookRegistration_active_idx" ON "WebhookRegistration" ("active");

-- Delivery attempts
CREATE TABLE "DeliveryAttempt" (
  "id" TEXT PRIMARY KEY,
  "registrationId" TEXT NOT NULL REFERENCES "WebhookRegistration" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "ledgerEventId" TEXT NOT NULL REFERENCES "LedgerEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "attemptNumber" INTEGER NOT NULL,
  "requestBodyHash" TEXT NOT NULL,
  "responseStatus" INTEGER,
  "latencyMs" INTEGER,
  "failureReason" TEXT,
  "signatureUsed" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX "DeliveryAttempt_unique_event_attempt" ON "DeliveryAttempt" ("ledgerEventId", "attemptNumber");
CREATE INDEX "DeliveryAttempt_registrationId_idx" ON "DeliveryAttempt" ("registrationId");
CREATE INDEX "DeliveryAttempt_ledgerEventId_idx" ON "DeliveryAttempt" ("ledgerEventId");

-- Audit log
CREATE TABLE "AuditLog" (
  "id" TEXT PRIMARY KEY,
  "agentId" TEXT REFERENCES "Agent" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "category" "AuditActionCategory" NOT NULL,
  "action" TEXT NOT NULL,
  "context" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX "AuditLog_agentId_idx" ON "AuditLog" ("agentId");
