import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { AgentPayClient, AgentPayError } from '@agentpay/sdk';
import {
  type CreateInvoiceRequest,
  type Invoice,
  type Payment,
  type BalanceResponse,
  type WebhookRegistration,
  type WebhookDeadLetter,
  type ExecutePaymentByInvoiceRequest,
  webhookEventTypeSchema
} from '@agentpay/types';
import './App.css';

type Nullable<T> = T | null;

type AsyncState = 'idle' | 'loading' | 'success' | 'error';

const EVENT_TYPES = webhookEventTypeSchema.options;
const STORAGE_KEYS = {
  baseUrl: 'agentpay:dashboard:baseUrl',
  apiKey: 'agentpay:dashboard:apiKey'
} as const;

function formatError(error: unknown): string {
  if (error instanceof AgentPayError) {
    const details = error.details ? ` | details: ${JSON.stringify(error.details)}` : '';
    return `${error.message} (status ${error.status})${details}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function JsonPreview({ data }: { data: unknown }): JSX.Element {
  return <pre className="json-preview">{JSON.stringify(data, null, 2)}</pre>;
}

function ApiConfigPanel(props: {
  baseUrl: string;
  apiKey: string;
  setBaseUrl: (value: string) => void;
  setApiKey: (value: string) => void;
  onPing: () => Promise<void>;
  pingState: AsyncState;
  pingMessage: string;
}): JSX.Element {
  const { baseUrl, apiKey, setBaseUrl, setApiKey, onPing, pingState, pingMessage } = props;

  return (
    <section className="card">
      <div className="card-header">
        <h2 className="card-title">Connection</h2>
        <p className="card-description">Store your local AgentPay endpoint and key for quick access.</p>
      </div>
      <form className="form-grid" onSubmit={(event) => event.preventDefault()}>
        <label className="field">
          <span className="field__label">Base URL</span>
          <input
            className="input"
            type="url"
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder="https://api.example.com"
          />
        </label>
        <label className="field">
          <span className="field__label">API Key</span>
          <input
            className="input"
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="agent_xxx.yyy"
          />
        </label>
        <div className="button-row">
          <button type="button" className="btn btn--primary" onClick={onPing} disabled={pingState === 'loading'}>
            {pingState === 'loading' ? 'Pinging…' : 'Test Connectivity'}
          </button>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => setApiKey('')}
            disabled={!apiKey.length}
          >
            Clear API Key
          </button>
        </div>
        {pingState !== 'idle' ? (
          <p className={`status ${pingState === 'error' ? 'status--error' : 'status--success'}`}>{pingMessage}</p>
        ) : null}
      </form>
    </section>
  );
}

function InvoicePanel({ client }: { client: AgentPayClient }): JSX.Element {
  const [form, setForm] = useState({
    recipientWalletAddress: '',
    amount: '',
    assetSymbol: 'USDC',
    payerWalletAddress: '',
    memo: '',
    expiry: ''
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createdInvoice, setCreatedInvoice] = useState<Nullable<Invoice>>(null);

  const [lookupId, setLookupId] = useState('');
  const [lookupState, setLookupState] = useState<AsyncState>('idle');
  const [lookupError, setLookupError] = useState('');
  const [lookupInvoice, setLookupInvoice] = useState<Nullable<Invoice>>(null);

  const handleCreate = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setCreating(true);
      setCreateError('');

      try {
        const payload: CreateInvoiceRequest = {
          recipientWalletAddress: form.recipientWalletAddress.trim(),
          amount: form.amount.trim(),
          assetSymbol: form.assetSymbol.trim()
        };

        if (form.payerWalletAddress.trim()) {
          payload.payerWalletAddress = form.payerWalletAddress.trim();
        }
        if (form.memo.trim()) {
          payload.memo = form.memo.trim();
        }
        if (form.expiry.trim()) {
          payload.expiry = new Date(form.expiry).toISOString();
        }

        const response = await client.createInvoice(payload);
        setCreatedInvoice(response.invoice);
      } catch (error) {
        setCreateError(formatError(error));
      } finally {
        setCreating(false);
      }
    },
    [client, form]
  );

  const handleLookup = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!lookupId.trim()) {
        return;
      }
      setLookupState('loading');
      setLookupError('');

      try {
        const response = await client.getInvoice(lookupId.trim());
        setLookupInvoice(response.invoice);
        setLookupState('success');
      } catch (error) {
        setLookupState('error');
        setLookupInvoice(null);
        setLookupError(formatError(error));
      }
    },
    [client, lookupId]
  );

  const handleCancel = useCallback(async () => {
    if (!lookupInvoice) {
      return;
    }
    setLookupState('loading');
    setLookupError('');
    try {
      const response = await client.cancelInvoice(lookupInvoice.id);
      setLookupInvoice(response.invoice);
      setLookupState('success');
    } catch (error) {
      setLookupState('error');
      setLookupError(formatError(error));
    }
  }, [client, lookupInvoice]);

  return (
    <section className="card card--stretch">
      <div className="card-header">
        <h2 className="card-title">Invoices</h2>
        <p className="card-description">Create payment requests and inspect their status.</p>
      </div>
      <div className="stack-lg">
        <div className="card-section">
          <h3 className="card-section-title">Create Invoice</h3>
          <form className="form-grid" onSubmit={handleCreate}>
            <label className="field">
              <span className="field__label">Recipient Wallet Address</span>
              <input
                className="input"
                required
                value={form.recipientWalletAddress}
                onChange={(event) => setForm((prev) => ({ ...prev, recipientWalletAddress: event.target.value }))}
                placeholder="Destination wallet"
              />
            </label>
            <div className="grid-responsive">
              <label className="field">
                <span className="field__label">Asset Symbol</span>
                <input
                  className="input"
                  required
                  value={form.assetSymbol}
                  onChange={(event) => setForm((prev) => ({ ...prev, assetSymbol: event.target.value }))}
                />
              </label>
              <label className="field">
                <span className="field__label">Amount</span>
                <input
                  className="input"
                  required
                  value={form.amount}
                  onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
                  placeholder="1.50"
                />
              </label>
            </div>
            <label className="field">
              <span className="field__label">Payer Wallet Address (optional)</span>
              <input
                className="input"
                value={form.payerWalletAddress}
                onChange={(event) => setForm((prev) => ({ ...prev, payerWalletAddress: event.target.value }))}
                placeholder="Leave blank for any payer"
              />
            </label>
            <label className="field">
              <span className="field__label">Memo</span>
              <textarea
                className="textarea"
                value={form.memo}
                onChange={(event) => setForm((prev) => ({ ...prev, memo: event.target.value }))}
                placeholder="Optional note shown alongside the invoice"
              />
            </label>
            <label className="field">
              <span className="field__label">Expiry</span>
              <input
                className="input"
                type="datetime-local"
                value={form.expiry}
                onChange={(event) => setForm((prev) => ({ ...prev, expiry: event.target.value }))}
              />
              <span className="field__hint">Leave blank for no expiration</span>
            </label>
            <button type="submit" className="btn btn--primary" disabled={creating}>
              {creating ? 'Creating…' : 'Create Invoice'}
            </button>
            {createError ? <p className="status status--error">{createError}</p> : null}
            {createdInvoice ? (
              <div className="result-stack">
                <p className="status status--success">Invoice created successfully.</p>
                <JsonPreview data={createdInvoice} />
              </div>
            ) : null}
          </form>
        </div>

        <div className="card-section">
          <h3 className="card-section-title">Lookup / Cancel</h3>
          <form className="form-grid" onSubmit={handleLookup}>
            <label className="field">
              <span className="field__label">Invoice ID</span>
              <input
                className="input"
                value={lookupId}
                onChange={(event) => setLookupId(event.target.value)}
                placeholder="01HXYZ..."
              />
            </label>
            <div className="button-row">
              <button type="submit" className="btn btn--primary" disabled={lookupState === 'loading'}>
                {lookupState === 'loading' ? 'Fetching…' : 'Fetch Invoice'}
              </button>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={handleCancel}
                disabled={!lookupInvoice || lookupState === 'loading'}
              >
                Cancel Invoice
              </button>
            </div>
            {lookupError ? <p className="status status--error">{lookupError}</p> : null}
            {lookupInvoice ? <JsonPreview data={lookupInvoice} /> : null}
          </form>
        </div>
      </div>
    </section>
  );
}

function PaymentsPanel({ client }: { client: AgentPayClient }): JSX.Element {
  const [form, setForm] = useState({
    invoiceId: '',
    payerWalletAddress: '',
    maxFeeLamports: '',
    simulateOnly: true
  });
  const [executing, setExecuting] = useState(false);
  const [executeError, setExecuteError] = useState('');
  const [paymentResult, setPaymentResult] = useState<Nullable<Payment>>(null);

  const [paymentId, setPaymentId] = useState('');
  const [fetchingPayment, setFetchingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  const [loadedPayment, setLoadedPayment] = useState<Nullable<Payment>>(null);

  const [balanceForm, setBalanceForm] = useState({ walletAddress: '', assetSymbol: 'USDC' });
  const [balanceState, setBalanceState] = useState<AsyncState>('idle');
  const [balanceError, setBalanceError] = useState('');
  const [balanceResult, setBalanceResult] = useState<Nullable<BalanceResponse>>(null);

  const handleExecute = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!form.invoiceId.trim()) {
        return;
      }
      setExecuting(true);
      setExecuteError('');

      try {
        const requestPayload: ExecutePaymentByInvoiceRequest = {
          invoiceId: form.invoiceId.trim(),
          simulateOnly: form.simulateOnly
        };

        const trimmedPayer = form.payerWalletAddress.trim();
        if (trimmedPayer.length > 0) {
          requestPayload.payerWalletAddress = trimmedPayer;
        }

        const trimmedMaxFee = form.maxFeeLamports.trim();
        if (trimmedMaxFee.length > 0) {
          requestPayload.maxFeeLamports = trimmedMaxFee;
        }

        const response = await client.executePayment(requestPayload);
        setPaymentResult(response.payment);
      } catch (error) {
        setExecuteError(formatError(error));
        setPaymentResult(null);
      } finally {
        setExecuting(false);
      }
    },
    [client, form]
  );

  const handleFetchPayment = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!paymentId.trim()) {
        return;
      }
      setFetchingPayment(true);
      setPaymentError('');
      try {
        const response = await client.getPayment(paymentId.trim());
        setLoadedPayment(response.payment);
      } catch (error) {
        setPaymentError(formatError(error));
        setLoadedPayment(null);
      } finally {
        setFetchingPayment(false);
      }
    },
    [client, paymentId]
  );

  const handleBalance = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!balanceForm.walletAddress.trim() || !balanceForm.assetSymbol.trim()) {
        return;
      }
      setBalanceState('loading');
      setBalanceError('');
      try {
        const response = await client.getBalance(balanceForm.walletAddress.trim(), balanceForm.assetSymbol.trim());
        setBalanceResult(response);
        setBalanceState('success');
      } catch (error) {
        setBalanceError(formatError(error));
        setBalanceResult(null);
        setBalanceState('error');
      }
    },
    [client, balanceForm]
  );

  return (
    <section className="card card--stretch">
      <div className="card-header">
        <h2 className="card-title">Payments &amp; Balances</h2>
        <p className="card-description">Simulate transfers, submit transactions, and inspect balances.</p>
      </div>
      <div className="stack-lg">
        <div className="card-section">
          <h3 className="card-section-title">Execute Payment</h3>
          <form className="form-grid" onSubmit={handleExecute}>
            <label className="field">
              <span className="field__label">Invoice ID</span>
              <input
                className="input"
                required
                value={form.invoiceId}
                onChange={(event) => setForm((prev) => ({ ...prev, invoiceId: event.target.value }))}
              />
            </label>
            <label className="field">
              <span className="field__label">Payer Wallet Address</span>
              <input
                className="input"
                value={form.payerWalletAddress}
                onChange={(event) => setForm((prev) => ({ ...prev, payerWalletAddress: event.target.value }))}
                placeholder="Leave blank for managed signer"
              />
            </label>
            <label className="field">
              <span className="field__label">Max Fee (lamports)</span>
              <input
                className="input"
                value={form.maxFeeLamports}
                onChange={(event) => setForm((prev) => ({ ...prev, maxFeeLamports: event.target.value }))}
                placeholder="5000"
              />
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.simulateOnly}
                onChange={(event) => setForm((prev) => ({ ...prev, simulateOnly: event.target.checked }))}
              />
              <span>Simulation only</span>
            </label>
            <button type="submit" className="btn btn--primary" disabled={executing}>
              {executing ? 'Submitting…' : 'Submit Payment'}
            </button>
            {executeError ? <p className="status status--error">{executeError}</p> : null}
            {paymentResult ? <JsonPreview data={paymentResult} /> : null}
          </form>
        </div>

        <div className="card-section">
          <h3 className="card-section-title">Fetch Payment</h3>
          <form className="form-grid" onSubmit={handleFetchPayment}>
            <label className="field">
              <span className="field__label">Payment ID</span>
              <input
                className="input"
                value={paymentId}
                onChange={(event) => setPaymentId(event.target.value)}
                placeholder="01HPAY..."
              />
            </label>
            <button type="submit" className="btn btn--primary" disabled={fetchingPayment}>
              {fetchingPayment ? 'Fetching…' : 'Fetch Payment'}
            </button>
            {paymentError ? <p className="status status--error">{paymentError}</p> : null}
            {loadedPayment ? <JsonPreview data={loadedPayment} /> : null}
          </form>
        </div>

        <div className="card-section">
          <h3 className="card-section-title">Wallet Balance</h3>
          <form className="form-grid" onSubmit={handleBalance}>
            <label className="field">
              <span className="field__label">Wallet Address</span>
              <input
                className="input"
                value={balanceForm.walletAddress}
                onChange={(event) => setBalanceForm((prev) => ({ ...prev, walletAddress: event.target.value }))}
                placeholder="Wallet to query"
              />
            </label>
            <label className="field">
              <span className="field__label">Asset Symbol</span>
              <input
                className="input"
                value={balanceForm.assetSymbol}
                onChange={(event) => setBalanceForm((prev) => ({ ...prev, assetSymbol: event.target.value }))}
              />
            </label>
            <button type="submit" className="btn btn--primary" disabled={balanceState === 'loading'}>
              {balanceState === 'loading' ? 'Checking…' : 'Check Balance'}
            </button>
            {balanceError ? <p className="status status--error">{balanceError}</p> : null}
            {balanceResult ? <JsonPreview data={balanceResult} /> : null}
          </form>
        </div>
      </div>
    </section>
  );
}

function WebhooksPanel({ client }: { client: AgentPayClient }): JSX.Element {
  const [registerForm, setRegisterForm] = useState({
    targetUrl: '',
    sharedSecret: '',
    eventTypes: new Set<string>()
  });
  const [registering, setRegistering] = useState(false);
  const [registerMessage, setRegisterMessage] = useState('');

  const [webhooks, setWebhooks] = useState<WebhookRegistration[]>([]);
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [webhookError, setWebhookError] = useState('');
  const [webhookBusyId, setWebhookBusyId] = useState<string | null>(null);

  const [deadLetters, setDeadLetters] = useState<WebhookDeadLetter[]>([]);
  const [deadLetterCursor, setDeadLetterCursor] = useState<string | null>(null);
  const [deadLetterLoading, setDeadLetterLoading] = useState(false);
  const [deadLetterError, setDeadLetterError] = useState('');

  const refreshWebhooks = useCallback(async () => {
    setWebhookLoading(true);
    setWebhookError('');
    try {
      const response = await client.listWebhooks();
      setWebhooks(response.webhooks);
    } catch (error) {
      setWebhookError(formatError(error));
    } finally {
      setWebhookLoading(false);
    }
  }, [client]);

  const refreshDeadLetters = useCallback(
    async (cursor?: string, append = false) => {
      setDeadLetterLoading(true);
      setDeadLetterError('');
      try {
        const response = await client.listWebhookDeadLetters({ cursor, limit: 10 });
        setDeadLetterCursor(response.nextCursor);
        setDeadLetters((prev) => (append ? [...prev, ...response.deadLetters] : response.deadLetters));
      } catch (error) {
        setDeadLetterError(formatError(error));
      } finally {
        setDeadLetterLoading(false);
      }
    },
    [client]
  );

  useEffect(() => {
    void refreshWebhooks();
    void refreshDeadLetters();
  }, [refreshDeadLetters, refreshWebhooks]);

  const loadMoreDeadLetters = useCallback(() => {
    if (deadLetterCursor) {
      void refreshDeadLetters(deadLetterCursor, true);
    }
  }, [refreshDeadLetters, deadLetterCursor]);

  const handleToggleEventType = useCallback((eventType: string) => {
    setRegisterForm((prev) => {
      const next = new Set(prev.eventTypes);
      if (next.has(eventType)) {
        next.delete(eventType);
      } else {
        next.add(eventType);
      }
      return { ...prev, eventTypes: next };
    });
  }, []);

  const handleRegister = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (registerForm.eventTypes.size === 0) {
        setRegisterMessage('Select at least one event.');
        return;
      }
      setRegistering(true);
      setRegisterMessage('');
      try {
        await client.registerWebhook({
          targetUrl: registerForm.targetUrl.trim(),
          sharedSecret: registerForm.sharedSecret.trim(),
          eventTypes: Array.from(registerForm.eventTypes)
        });
        setRegisterMessage('Webhook registered. Check verification challenge in the response.');
        setRegisterForm({ targetUrl: '', sharedSecret: '', eventTypes: new Set(registerForm.eventTypes) });
        await refreshWebhooks();
      } catch (error) {
        setRegisterMessage(formatError(error));
      } finally {
        setRegistering(false);
      }
    },
    [client, refreshWebhooks, registerForm]
  );

  const handleDelete = useCallback(
    async (webhook: WebhookRegistration) => {
      setWebhookBusyId(webhook.id);
      try {
        await client.deleteWebhook(webhook.id);
        await refreshWebhooks();
      } catch (error) {
        setWebhookError(formatError(error));
      } finally {
        setWebhookBusyId(null);
      }
    },
    [client, refreshWebhooks]
  );

  const handleVerify = useCallback(
    async (webhook: WebhookRegistration) => {
      const challenge = window.prompt(`Enter verification challenge for webhook ${webhook.id}`);
      if (!challenge) {
        return;
      }
      setWebhookBusyId(webhook.id);
      try {
        await client.verifyWebhook(webhook.id, challenge.trim());
        alert('Webhook verified successfully.');
        await refreshWebhooks();
      } catch (error) {
        alert(formatError(error));
      } finally {
        setWebhookBusyId(null);
      }
    },
    [client, refreshWebhooks]
  );

  const handleReplay = useCallback(
    async (deadLetter: WebhookDeadLetter) => {
      setDeadLetterLoading(true);
      try {
        await client.replayWebhookDeadLetter(deadLetter.id);
        await refreshDeadLetters();
      } catch (error) {
        setDeadLetterError(formatError(error));
      } finally {
        setDeadLetterLoading(false);
      }
    },
    [client, refreshDeadLetters]
  );

  return (
    <section className="card card--stretch">
      <div className="card-header">
        <h2 className="card-title">Webhooks</h2>
        <p className="card-description">Register delivery targets, monitor retries, and replay dead letters.</p>
      </div>
      <div className="stack-lg">
        <div className="card-section">
          <h3 className="card-section-title">Register Webhook</h3>
          <form className="form-grid" onSubmit={handleRegister}>
            <label className="field">
              <span className="field__label">Target URL</span>
              <input
                className="input"
                type="url"
                required
                value={registerForm.targetUrl}
                onChange={(event) => setRegisterForm((prev) => ({ ...prev, targetUrl: event.target.value }))}
                placeholder="https://example.com/webhooks/agentpay"
              />
            </label>
            <label className="field">
              <span className="field__label">Shared Secret</span>
              <input
                className="input"
                required
                value={registerForm.sharedSecret}
                onChange={(event) => setRegisterForm((prev) => ({ ...prev, sharedSecret: event.target.value }))}
                placeholder="Minimum 16 characters"
              />
            </label>
            <div className="field field--cluster">
              <span className="field__label">Event Types</span>
              <div className="chip-group">
                {EVENT_TYPES.map((eventType) => (
                  <label key={eventType} className="chip-toggle">
                    <input
                      type="checkbox"
                      checked={registerForm.eventTypes.has(eventType)}
                      onChange={() => handleToggleEventType(eventType)}
                    />
                    <span>{eventType.replace(/\./g, ' · ')}</span>
                  </label>
                ))}
              </div>
            </div>
            <button type="submit" className="btn btn--primary" disabled={registering}>
              {registering ? 'Registering…' : 'Register Webhook'}
            </button>
            {registerMessage ? (
              <p className={`status ${registerMessage.startsWith('Webhook registered') ? 'status--success' : 'status--error'}`}>
                {registerMessage}
              </p>
            ) : null}
          </form>
        </div>

        <div className="card-section">
          <div className="section-heading">
            <h3 className="card-section-title">Registered Webhooks</h3>
            <button type="button" className="btn btn--secondary" onClick={() => refreshWebhooks()} disabled={webhookLoading}>
              Refresh
            </button>
          </div>
          {webhookError ? <p className="status status--error">{webhookError}</p> : null}
          {webhooks.length === 0 ? (
            <p className="muted">{webhookLoading ? 'Loading webhooks…' : 'No webhooks registered yet.'}</p>
          ) : (
            <div className="data-stack">
              {webhooks.map((webhook) => (
                <article key={webhook.id} className="data-card">
                  <div className="data-card__header">
                    <div>
                      <h4 className="data-card__title">{webhook.targetUrl}</h4>
                      <div className="meta-row">
                        <span className="tag">{webhook.id}</span>
                        <span className={`badge ${webhook.active ? 'badge--success' : 'badge--warn'}`}>
                          {webhook.active ? 'Active' : 'Inactive'}
                        </span>
                        <span className="muted">Failures: {webhook.failureCount}</span>
                      </div>
                    </div>
                    <div className="button-column">
                      <button
                        type="button"
                        className="btn btn--primary"
                        onClick={() => handleVerify(webhook)}
                        disabled={webhookBusyId === webhook.id}
                      >
                        Verify
                      </button>
                      <button
                        type="button"
                        className="btn btn--secondary"
                        onClick={() => handleDelete(webhook)}
                        disabled={webhookBusyId === webhook.id}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <p className="muted">Events: {webhook.eventFilter.join(', ')}</p>
                  <details className="data-card__details">
                    <summary>Raw payload</summary>
                    <JsonPreview data={webhook} />
                  </details>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="card-section">
          <div className="section-heading">
            <h3 className="card-section-title">Dead Letter Queue</h3>
            <button type="button" className="btn btn--secondary" onClick={() => refreshDeadLetters()} disabled={deadLetterLoading}>
              Refresh
            </button>
          </div>
          {deadLetterError ? <p className="status status--error">{deadLetterError}</p> : null}
          {deadLetters.length === 0 ? (
            <p className="muted">{deadLetterLoading ? 'Loading dead letters…' : 'No dead letters found.'}</p>
          ) : (
            <div className="data-stack">
              {deadLetters.map((entry) => (
                <article key={entry.id} className="data-card">
                  <div className="data-card__header">
                    <div>
                      <h4 className="data-card__title">{entry.id}</h4>
                      <div className="meta-row">
                        <span className="muted">Registration: {entry.registrationId}</span>
                        <span className="muted">Event: {entry.eventId}</span>
                        <span className="muted">Attempts: {entry.attemptCount}</span>
                      </div>
                      <p className="muted">Reason: {entry.failureReason}</p>
                    </div>
                    <button
                      type="button"
                      className="btn btn--primary"
                      onClick={() => handleReplay(entry)}
                      disabled={deadLetterLoading}
                    >
                      Replay
                    </button>
                  </div>
                  <details className="data-card__details">
                    <summary>Payload</summary>
                    <JsonPreview data={entry} />
                  </details>
                </article>
              ))}
            </div>
          )}
          {deadLetterCursor ? (
            <div className="button-row">
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => loadMoreDeadLetters()}
                disabled={deadLetterLoading}
              >
                Load more
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function DocsPage({ onBack }: { onBack: () => void }): JSX.Element {
  return (
    <section className="docs">
      <div className="docs-header">
        <div>
          <h2>AgentPay API Guide</h2>
          <p className="muted">Reference for core HTTP endpoints exposed by the AgentPay Hub server.</p>
        </div>
        <button type="button" className="btn btn--secondary" onClick={onBack}>
          ← Back to Dashboard
        </button>
      </div>

      <article className="doc-section">
        <h3>Authentication</h3>
        <p>
          Add your agent key to the <code>x-api-key</code> header for every protected endpoint. The invoice creation and payment
          execution routes also require an <code>Idempotency-Key</code> so retries are harmless. Optional wallet signature headers
          (<code>x-wallet-address</code>, <code>x-wallet-signature</code>, <code>x-wallet-nonce</code>, <code>x-wallet-timestamp</code>) enable
          end-user request verification.
        </p>
      </article>

      <article className="doc-section">
        <h3>Health &amp; Metrics</h3>
        <table className="doc-table">
          <thead>
            <tr>
              <th>Method</th>
              <th>Path</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>GET</td>
              <td><code>/health/liveness</code></td>
              <td>Process heartbeat. Returns 200 when the service is up.</td>
            </tr>
            <tr>
              <td>GET</td>
              <td><code>/health/readiness</code></td>
              <td>Checks database and Redis connectivity; responds with 503 on failures.</td>
            </tr>
            <tr>
              <td>GET</td>
              <td><code>/metrics</code></td>
              <td>Prometheus-compatible metrics feed.</td>
            </tr>
          </tbody>
        </table>
        <pre className="doc-code"><code>curl http://localhost:8080/health/liveness</code></pre>
      </article>

      <article className="doc-section">
        <h3>Invoices</h3>
        <p>Routes implemented in <code>packages/server/src/routes/invoices.ts</code>.</p>
        <table className="doc-table">
          <thead>
            <tr>
              <th>Method</th>
              <th>Path</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>POST</td>
              <td><code>/v1/invoices</code></td>
              <td>Create invoice (requires <code>Idempotency-Key</code>).</td>
            </tr>
            <tr>
              <td>GET</td>
              <td><code>/v1/invoices/:invoiceId</code></td>
              <td>Fetch invoice details and latest payment.</td>
            </tr>
            <tr>
              <td>POST</td>
              <td><code>/v1/invoices/:invoiceId/cancel</code></td>
              <td>Cancel an open or draft invoice.</td>
            </tr>
          </tbody>
        </table>
        <pre className="doc-code"><code>{`curl -X POST http://localhost:8080/v1/invoices \
  -H "x-api-key: $AGENTPAY_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{
    "recipientWalletAddress": "F62i8C3CshnB6a2EePxX61fNULmKM2SUkieJgP6FkERZ",
    "amount": "1.25",
    "assetSymbol": "USDC"
  }'`}</code></pre>
      </article>

      <article className="doc-section">
        <h3>Payments &amp; Balances</h3>
        <table className="doc-table">
          <thead>
            <tr>
              <th>Method</th>
              <th>Path</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>POST</td>
              <td><code>/v1/payments</code></td>
              <td>Execute or simulate payment (requires <code>Idempotency-Key</code>).</td>
            </tr>
            <tr>
              <td>GET</td>
              <td><code>/v1/payments/:paymentId</code></td>
              <td>Retrieve payment status.</td>
            </tr>
            <tr>
              <td>GET</td>
              <td><code>/v1/balances/:wallet</code></td>
              <td>Fetch last observed balance (<code>asset</code> query parameter required).</td>
            </tr>
          </tbody>
        </table>
        <pre className="doc-code"><code>{`curl -X POST http://localhost:8080/v1/payments \
  -H "x-api-key: $AGENTPAY_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{
    "invoiceId": "<INVOICE_ID>",
    "simulateOnly": true
  }'`}</code></pre>
        <pre className="doc-code"><code>{`curl -H "x-api-key: $AGENTPAY_API_KEY" \
  "http://localhost:8080/v1/balances/<WALLET_ADDRESS>?asset=USDC"`}</code></pre>
      </article>

      <article className="doc-section">
        <h3>Webhooks</h3>
        <table className="doc-table">
          <thead>
            <tr>
              <th>Method</th>
              <th>Path</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>POST</td>
              <td><code>/v1/webhooks</code></td>
              <td>Register webhook target.</td>
            </tr>
            <tr>
              <td>POST</td>
              <td><code>/v1/webhooks/:id/verify</code></td>
              <td>Confirm verification challenge.</td>
            </tr>
            <tr>
              <td>GET</td>
              <td><code>/v1/webhooks</code></td>
              <td>List registrations (cursor pagination supported).</td>
            </tr>
            <tr>
              <td>DELETE</td>
              <td><code>/v1/webhooks/:id</code></td>
              <td>Remove a registration.</td>
            </tr>
            <tr>
              <td>GET</td>
              <td><code>/v1/events/:eventId/deliveries</code></td>
              <td>Inspect delivery attempts for an event.</td>
            </tr>
            <tr>
              <td>GET</td>
              <td><code>/v1/webhooks/dlq</code></td>
              <td>View dead-letter queue.</td>
            </tr>
            <tr>
              <td>POST</td>
              <td><code>/v1/webhooks/dlq/:deadLetterId/replay</code></td>
              <td>Replay a failed delivery and remove it from the queue.</td>
            </tr>
          </tbody>
        </table>
        <pre className="doc-code"><code>{`curl -X POST http://localhost:8080/v1/webhooks \
  -H "x-api-key: $AGENTPAY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "targetUrl": "https://example.com/webhooks/agentpay",
    "sharedSecret": "super-secret",
    "eventTypes": ["invoice.created", "payment.confirmed"]
  }'`}</code></pre>
      </article>

      <article className="doc-section">
        <h3>Idempotency &amp; Rate Limits</h3>
        <p>
          Invoice and payment POST routes consume an <code>Idempotency-Key</code> per agent for the configured TTL (24h by default).
          Rate limiting is enforced by the Redis-backed bucket (<code>RATE_LIMIT_BUCKET_SIZE</code>/<code>RATE_LIMIT_REFILL_RATE</code>);
          exceeding the quota returns <code>429 RATE_LIMIT_EXCEEDED</code>.
        </p>
      </article>

      <article className="doc-section">
        <h3>Error Envelope</h3>
        <p>
          Application errors share a consistent structure. Correlation IDs align with Fastify request logs. Error codes are defined
          in <code>packages/server/src/errors/agentpay-error.ts</code>.
        </p>
        <pre className="doc-code"><code>{`{
  "code": "VALIDATION_FAILED",
  "message": "...",
  "details": { ... },
  "correlationId": "01K...",
  "retryable": false
}`}</code></pre>
      </article>

      <article className="doc-section">
        <h3>Useful Commands</h3>
        <pre className="doc-code"><code>{`# Seed dev agent and print the API key (requires Postgres 5433)
pnpm --dir=packages/server prisma db seed

# Run the API in watch mode
pnpm --dir=packages/server dev

# Launch the dashboard UI
pnpm --dir=packages/dashboard dev`}</code></pre>
      </article>
    </section>
  );
}

export function App(): JSX.Element {
  const defaultBaseUrl = (import.meta.env.VITE_AGENTPAY_API_URL as string | undefined) ?? 'http://localhost:8080';

  const [baseUrl, setBaseUrl] = useState(() => {
    if (typeof window === 'undefined') {
      return defaultBaseUrl;
    }
    return window.localStorage.getItem(STORAGE_KEYS.baseUrl) ?? defaultBaseUrl;
  });

  const [apiKey, setApiKey] = useState(() => {
    if (typeof window === 'undefined') {
      return '';
    }
    return window.localStorage.getItem(STORAGE_KEYS.apiKey) ?? '';
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEYS.baseUrl, baseUrl);
    }
  }, [baseUrl]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEYS.apiKey, apiKey);
    }
  }, [apiKey]);

  const normalizedBaseUrl = useMemo(() => baseUrl.trim().replace(/\/$/, ''), [baseUrl]);

  const client = useMemo(() => {
    if (!apiKey.trim()) {
      return null;
    }
    return new AgentPayClient({ baseUrl: normalizedBaseUrl || defaultBaseUrl, apiKey: apiKey.trim(), timeoutMs: 15000 });
  }, [apiKey, defaultBaseUrl, normalizedBaseUrl]);

  const [pingState, setPingState] = useState<AsyncState>('idle');
  const [pingMessage, setPingMessage] = useState('');
  const [activeView, setActiveView] = useState<'dashboard' | 'docs'>('dashboard');

  const handlePing = useCallback(async () => {
    setPingState('loading');
    setPingMessage('');
    try {
      const response = await fetch(`${(normalizedBaseUrl || defaultBaseUrl).replace(/\/$/, '')}/health/liveness`);
      if (!response.ok) {
        throw new Error(`Health check failed with status ${response.status}`);
      }
      const payload = await response.json();
      setPingState('success');
      setPingMessage(`Liveness OK at ${payload.timestamp ?? 'unknown time'}`);
    } catch (error) {
      setPingState('error');
      setPingMessage(formatError(error));
    }
  }, [defaultBaseUrl, normalizedBaseUrl]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <div className="brand-badge">AgentPay</div>
          <div>
            <h1>AgentPay Hub Dashboard</h1>
            <p className="muted">Interact with invoices, payments, and webhooks in your local environment.</p>
          </div>
        </div>
        <div className="header-meta">
          <div className="header-nav">
            <button
              type="button"
              className={`nav-btn ${activeView === 'dashboard' ? 'nav-btn--active' : ''}`}
              onClick={() => setActiveView('dashboard')}
            >
              Dashboard
            </button>
            <button
              type="button"
              className={`nav-btn ${activeView === 'docs' ? 'nav-btn--active' : ''}`}
              onClick={() => setActiveView('docs')}
            >
              API Docs
            </button>
          </div>
          <div className="status-pill">
            <span className={`badge ${client ? 'badge--success' : 'badge--warn'}`}>
              {client ? 'Connected' : 'Disconnected'}
            </span>
            <span className="muted small">Base URL: {normalizedBaseUrl || defaultBaseUrl}</span>
          </div>
        </div>
      </header>

      <div className="app-content">
        {activeView === 'dashboard' ? (
          <>
            <aside className="sidebar">
              <ApiConfigPanel
                baseUrl={baseUrl}
                setBaseUrl={setBaseUrl}
                apiKey={apiKey}
                setApiKey={setApiKey}
                onPing={handlePing}
                pingState={pingState}
                pingMessage={pingMessage}
              />
              <section className="card card--accent">
                <h2 className="card-title">Quick Tips</h2>
                <ul className="tip-list">
                  <li>Use the seed script to generate development API keys.</li>
                  <li>Enable simulation mode to validate Solana transactions without submitting.</li>
                  <li>Replay dead-lettered webhooks after fixing downstream issues.</li>
                </ul>
              </section>
            </aside>

            <main className="main-grid">
              {client ? (
                <>
                  <InvoicePanel client={client} />
                  <PaymentsPanel client={client} />
                  <WebhooksPanel client={client} />
                </>
              ) : (
                <section className="card card--empty">
                  <div className="card-header">
                    <h2 className="card-title">Awaiting Configuration</h2>
                    <p className="card-description">
                      Enter a base URL and API key to unlock invoice, payment, and webhook tooling.
                    </p>
                  </div>
                </section>
              )}
            </main>
          </>
        ) : (
          <DocsPage onBack={() => setActiveView('dashboard')} />
        )}
      </div>
    </div>
  );
}

export default App;
