import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { AgentPayClient, AgentPayError } from '@agentpay/sdk';
import {
  type CreateInvoiceRequest,
  type Invoice,
  type Payment,
  type BalanceResponse,
  type WebhookRegistration,
  type WebhookDeadLetter,
  webhookEventTypeSchema
} from '@agentpay/types';

type Nullable<T> = T | null;

type AsyncState = 'idle' | 'loading' | 'success' | 'error';

const EVENT_TYPES = webhookEventTypeSchema.options;
const STORAGE_KEYS = {
  baseUrl: 'agentpay:dashboard:baseUrl',
  apiKey: 'agentpay:dashboard:apiKey'
} as const;

const pageStyle: CSSProperties = {
  fontFamily: 'Inter, system-ui, sans-serif',
  backgroundColor: '#f8fafc',
  color: '#0f172a',
  minHeight: '100vh',
  margin: 0,
  padding: '2rem',
  boxSizing: 'border-box'
};

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: '1.5rem'
};

const panelsGridStyle: CSSProperties = {
  display: 'grid',
  gap: '1.5rem'
};

const panelStyle: CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: '12px',
  padding: '1.5rem',
  boxShadow: '0 10px 25px -15px rgba(15, 23, 42, 0.45)'
};

const panelTitleStyle: CSSProperties = {
  fontSize: '1.25rem',
  fontWeight: 600,
  marginBottom: '1rem'
};

const formGridStyle: CSSProperties = {
  display: 'grid',
  gap: '0.75rem',
  maxWidth: '640px'
};

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.75rem',
  borderRadius: '8px',
  border: '1px solid #cbd5f5',
  fontSize: '0.95rem',
  fontFamily: 'inherit'
};

const textareaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: '80px'
};

const buttonRowStyle: CSSProperties = {
  display: 'flex',
  gap: '0.5rem',
  flexWrap: 'wrap'
};

const buttonStyle: CSSProperties = {
  padding: '0.5rem 1rem',
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
  backgroundColor: '#2563eb',
  color: '#ffffff',
  fontWeight: 600,
  transition: 'background-color 0.2s ease'
};

const secondaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  backgroundColor: '#475569'
};

const subtleButtonStyle: CSSProperties = {
  ...buttonStyle,
  backgroundColor: '#0f172a'
};

const mutedTextStyle: CSSProperties = {
  fontSize: '0.9rem',
  color: '#475569'
};

const resultBoxStyle: CSSProperties = {
  backgroundColor: '#f1f5f9',
  borderRadius: '8px',
  padding: '1rem',
  fontFamily: 'ui-monospace, SFMono-Regular, SFMono, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  fontSize: '0.85rem',
  overflowX: 'auto',
  whiteSpace: 'pre-wrap'
};

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
  return <pre style={resultBoxStyle}>{JSON.stringify(data, null, 2)}</pre>;
}

function ApiConfigPanel(props: {
  baseUrl: string;
  apiKey: string;
  setBaseUrl: (value: string) => void;
  setApiKey: (value: string) => void;
  onPing: () => Promise<void>;
  pingState: AsyncState;
  pingMessage: string;
  docsUrl?: string;
}): JSX.Element {
  const { baseUrl, apiKey, setBaseUrl, setApiKey, onPing, pingState, pingMessage, docsUrl } = props;

  return (
    <section style={panelStyle}>
      <h2 style={panelTitleStyle}>Connection</h2>
      <p style={mutedTextStyle}>
        Provide the AgentPay Hub URL and API key. Values persist locally so you can refresh without re-entering them.
      </p>
      <form style={formGridStyle} onSubmit={(event) => event.preventDefault()}>
        <label>
          <span>Base URL</span>
          <input
            style={inputStyle}
            type="url"
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder="https://api.example.com"
          />
        </label>
        <label>
          <span>API Key</span>
          <input
            style={inputStyle}
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="agent_xxx.yyy"
          />
        </label>
        <div style={buttonRowStyle}>
          <button type="button" style={buttonStyle} onClick={onPing} disabled={pingState === 'loading'}>
            {pingState === 'loading' ? 'Pinging…' : 'Test Connectivity'}
          </button>
          <button
            type="button"
            style={secondaryButtonStyle}
            onClick={() => setApiKey('')}
            disabled={!apiKey.length}
          >
            Clear API Key
          </button>
          {docsUrl ? (
            <a href={docsUrl} target="_blank" rel="noreferrer" style={{ ...subtleButtonStyle, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
              Open Docs ↗
            </a>
          ) : null}
        </div>
        {pingState !== 'idle' ? (
          <p style={{ ...mutedTextStyle, color: pingState === 'error' ? '#b91c1c' : '#047857' }}>{pingMessage}</p>
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

  const handleCancel = useCallback(
    async () => {
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
    },
    [client, lookupInvoice]
  );

  return (
    <section style={panelStyle}>
      <h2 style={panelTitleStyle}>Invoices</h2>
      <div style={{ display: 'grid', gap: '1.5rem' }}>
        <div>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '0.75rem' }}>Create Invoice</h3>
          <form style={formGridStyle} onSubmit={handleCreate}>
            <label>
              <span>Recipient Wallet Address</span>
              <input
                style={inputStyle}
                required
                value={form.recipientWalletAddress}
                onChange={(event) => setForm((prev) => ({ ...prev, recipientWalletAddress: event.target.value }))}
              />
            </label>
            <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
              <label>
                <span>Asset Symbol</span>
                <input
                  style={inputStyle}
                  required
                  value={form.assetSymbol}
                  onChange={(event) => setForm((prev) => ({ ...prev, assetSymbol: event.target.value }))}
                />
              </label>
              <label>
                <span>Amount</span>
                <input
                  style={inputStyle}
                  required
                  value={form.amount}
                  onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
                  placeholder="1.50"
                />
              </label>
            </div>
            <label>
              <span>Payer Wallet Address (optional)</span>
              <input
                style={inputStyle}
                value={form.payerWalletAddress}
                onChange={(event) => setForm((prev) => ({ ...prev, payerWalletAddress: event.target.value }))}
              />
            </label>
            <label>
              <span>Memo (optional)</span>
              <textarea
                style={textareaStyle}
                value={form.memo}
                onChange={(event) => setForm((prev) => ({ ...prev, memo: event.target.value }))}
              />
            </label>
            <label>
              <span>Expiry (optional)</span>
              <input
                style={inputStyle}
                type="datetime-local"
                value={form.expiry}
                onChange={(event) => setForm((prev) => ({ ...prev, expiry: event.target.value }))}
              />
            </label>
            <button type="submit" style={buttonStyle} disabled={creating}>
              {creating ? 'Creating…' : 'Create Invoice'}
            </button>
            {createError ? <p style={{ ...mutedTextStyle, color: '#b91c1c' }}>{createError}</p> : null}
            {createdInvoice ? (
              <div>
                <p style={mutedTextStyle}>Invoice created successfully.</p>
                <JsonPreview data={createdInvoice} />
              </div>
            ) : null}
          </form>
        </div>

        <div>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '0.75rem' }}>Lookup / Cancel</h3>
          <form style={formGridStyle} onSubmit={handleLookup}>
            <label>
              <span>Invoice ID</span>
              <input
                style={inputStyle}
                value={lookupId}
                onChange={(event) => setLookupId(event.target.value)}
                placeholder="01HXYZ..."
              />
            </label>
            <div style={buttonRowStyle}>
              <button type="submit" style={buttonStyle} disabled={lookupState === 'loading'}>
                {lookupState === 'loading' ? 'Fetching…' : 'Fetch Invoice'}
              </button>
              <button
                type="button"
                style={secondaryButtonStyle}
                onClick={handleCancel}
                disabled={!lookupInvoice || lookupState === 'loading'}
              >
                Cancel Invoice
              </button>
            </div>
            {lookupError ? <p style={{ ...mutedTextStyle, color: '#b91c1c' }}>{lookupError}</p> : null}
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
        const payload = {
          invoiceId: form.invoiceId.trim(),
          payerWalletAddress: form.payerWalletAddress.trim(),
          simulateOnly: form.simulateOnly
        } as const;

        const requestPayload = {
          ...payload,
          maxFeeLamports: form.maxFeeLamports.trim() ? form.maxFeeLamports.trim() : undefined
        };

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
    <section style={panelStyle}>
      <h2 style={panelTitleStyle}>Payments & Balances</h2>
      <div style={{ display: 'grid', gap: '1.5rem' }}>
        <div>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '0.75rem' }}>Execute Payment</h3>
          <form style={formGridStyle} onSubmit={handleExecute}>
            <label>
              <span>Invoice ID</span>
              <input
                style={inputStyle}
                required
                value={form.invoiceId}
                onChange={(event) => setForm((prev) => ({ ...prev, invoiceId: event.target.value }))}
              />
            </label>
            <label>
              <span>Payer Wallet Address</span>
              <input
                style={inputStyle}
                required
                value={form.payerWalletAddress}
                onChange={(event) => setForm((prev) => ({ ...prev, payerWalletAddress: event.target.value }))}
              />
            </label>
            <label>
              <span>Max Fee (lamports, optional)</span>
              <input
                style={inputStyle}
                value={form.maxFeeLamports}
                onChange={(event) => setForm((prev) => ({ ...prev, maxFeeLamports: event.target.value }))}
                placeholder="5000"
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={form.simulateOnly}
                onChange={(event) => setForm((prev) => ({ ...prev, simulateOnly: event.target.checked }))}
              />
              <span>Simulation only</span>
            </label>
            <button type="submit" style={buttonStyle} disabled={executing}>
              {executing ? 'Submitting…' : 'Submit Payment'}
            </button>
            {executeError ? <p style={{ ...mutedTextStyle, color: '#b91c1c' }}>{executeError}</p> : null}
            {paymentResult ? <JsonPreview data={paymentResult} /> : null}
          </form>
        </div>

        <div>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '0.75rem' }}>Fetch Payment</h3>
          <form style={formGridStyle} onSubmit={handleFetchPayment}>
            <label>
              <span>Payment ID</span>
              <input
                style={inputStyle}
                value={paymentId}
                onChange={(event) => setPaymentId(event.target.value)}
                placeholder="01HPAY..."
              />
            </label>
            <button type="submit" style={buttonStyle} disabled={fetchingPayment}>
              {fetchingPayment ? 'Fetching…' : 'Fetch Payment'}
            </button>
            {paymentError ? <p style={{ ...mutedTextStyle, color: '#b91c1c' }}>{paymentError}</p> : null}
            {loadedPayment ? <JsonPreview data={loadedPayment} /> : null}
          </form>
        </div>

        <div>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '0.75rem' }}>Wallet Balance</h3>
          <form style={formGridStyle} onSubmit={handleBalance}>
            <label>
              <span>Wallet Address</span>
              <input
                style={inputStyle}
                value={balanceForm.walletAddress}
                onChange={(event) => setBalanceForm((prev) => ({ ...prev, walletAddress: event.target.value }))}
              />
            </label>
            <label>
              <span>Asset Symbol</span>
              <input
                style={inputStyle}
                value={balanceForm.assetSymbol}
                onChange={(event) => setBalanceForm((prev) => ({ ...prev, assetSymbol: event.target.value }))}
              />
            </label>
            <button type="submit" style={buttonStyle} disabled={balanceState === 'loading'}>
              {balanceState === 'loading' ? 'Checking…' : 'Check Balance'}
            </button>
            {balanceError ? <p style={{ ...mutedTextStyle, color: '#b91c1c' }}>{balanceError}</p> : null}
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
    eventTypes: new Set<string>(['invoice.created', 'payment.confirmed'])
  });
  const [registering, setRegistering] = useState(false);
  const [registerMessage, setRegisterMessage] = useState('');

  const [webhooks, setWebhooks] = useState<WebhookRegistration[]>([]);
  const [webhookCursor, setWebhookCursor] = useState<Nullable<string>>(null);
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [webhookError, setWebhookError] = useState('');
  const [webhookBusyId, setWebhookBusyId] = useState<string | null>(null);

  const [deadLetters, setDeadLetters] = useState<WebhookDeadLetter[]>([]);
  const [deadLetterCursor, setDeadLetterCursor] = useState<Nullable<string>>(null);
  const [deadLetterLoading, setDeadLetterLoading] = useState(false);
  const [deadLetterError, setDeadLetterError] = useState('');

  const refreshWebhooks = useCallback(
    async (cursor?: string, append = false) => {
      setWebhookLoading(true);
      setWebhookError('');
      try {
        const response = await client.listWebhooks({ limit: 25, cursor });
        setWebhooks((prev) => (append ? [...prev, ...response.webhooks] : response.webhooks));
        setWebhookCursor(response.nextCursor);
      } catch (error) {
        setWebhookError(formatError(error));
        if (!append) {
          setWebhooks([]);
        }
      } finally {
        setWebhookLoading(false);
      }
    },
    [client]
  );

  const refreshDeadLetters = useCallback(
    async (cursor?: string, append = false) => {
      setDeadLetterLoading(true);
      setDeadLetterError('');
      try {
        const response = await client.listWebhookDeadLetters({ limit: 25, cursor });
        setDeadLetters((prev) => (append ? [...prev, ...response.deadLetters] : response.deadLetters));
        setDeadLetterCursor(response.nextCursor);
      } catch (error) {
        setDeadLetterError(formatError(error));
        if (!append) {
          setDeadLetters([]);
        }
      } finally {
        setDeadLetterLoading(false);
      }
    },
    [client]
  );

  useEffect(() => {
    let ignore = false;
    (async () => {
      if (ignore) return;
      await refreshWebhooks();
      await refreshDeadLetters();
    })();
    return () => {
      ignore = true;
    };
  }, [refreshWebhooks, refreshDeadLetters]);

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
    <section style={panelStyle}>
      <h2 style={panelTitleStyle}>Webhooks</h2>
      <div style={{ display: 'grid', gap: '1.5rem' }}>
        <div>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '0.75rem' }}>Register Webhook</h3>
          <form style={formGridStyle} onSubmit={handleRegister}>
            <label>
              <span>Target URL</span>
              <input
                style={inputStyle}
                type="url"
                required
                value={registerForm.targetUrl}
                onChange={(event) => setRegisterForm((prev) => ({ ...prev, targetUrl: event.target.value }))}
              />
            </label>
            <label>
              <span>Shared Secret</span>
              <input
                style={inputStyle}
                required
                value={registerForm.sharedSecret}
                onChange={(event) => setRegisterForm((prev) => ({ ...prev, sharedSecret: event.target.value }))}
              />
            </label>
            <fieldset style={{ border: '1px solid #cbd5f5', borderRadius: '8px', padding: '0.75rem' }}>
              <legend style={{ padding: '0 0.5rem' }}>Event Types</legend>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                {EVENT_TYPES.map((eventType) => (
                  <label key={eventType} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <input
                      type="checkbox"
                      checked={registerForm.eventTypes.has(eventType)}
                      onChange={() => handleToggleEventType(eventType)}
                    />
                    <span>{eventType}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <button type="submit" style={buttonStyle} disabled={registering}>
              {registering ? 'Registering…' : 'Register Webhook'}
            </button>
            {registerMessage ? (
              <p style={{ ...mutedTextStyle, color: registerMessage.startsWith('Webhook registered') ? '#047857' : '#b91c1c' }}>
                {registerMessage}
              </p>
            ) : null}
          </form>
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600 }}>Registered Webhooks</h3>
            <button type="button" style={secondaryButtonStyle} onClick={() => refreshWebhooks()} disabled={webhookLoading}>
              Refresh
            </button>
          </div>
          {webhookError ? <p style={{ ...mutedTextStyle, color: '#b91c1c' }}>{webhookError}</p> : null}
          {webhooks.length === 0 ? <p style={mutedTextStyle}>{webhookLoading ? 'Loading webhooks…' : 'No webhooks registered yet.'}</p> : null}
          <div style={{ display: 'grid', gap: '1rem' }}>
            {webhooks.map((webhook) => (
              <div key={webhook.id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                  <div>
                    <strong>{webhook.targetUrl}</strong>
                    <p style={mutedTextStyle}>Events: {webhook.eventFilter.join(', ')}</p>
                    <p style={mutedTextStyle}>Status: {webhook.active ? 'active' : 'inactive'}</p>
                    <p style={mutedTextStyle}>Failure Count: {webhook.failureCount}</p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <button
                      type="button"
                      style={buttonStyle}
                      onClick={() => handleVerify(webhook)}
                      disabled={webhookBusyId === webhook.id}
                    >
                      Verify
                    </button>
                    <button
                      type="button"
                      style={secondaryButtonStyle}
                      onClick={() => handleDelete(webhook)}
                      disabled={webhookBusyId === webhook.id}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <details style={{ marginTop: '0.75rem' }}>
                  <summary style={{ cursor: 'pointer' }}>Raw Payload</summary>
                  <JsonPreview data={webhook} />
                </details>
              </div>
            ))}
          </div>
          {webhookCursor ? (
            <div style={{ marginTop: '0.75rem' }}>
              <button
                type="button"
                style={secondaryButtonStyle}
                onClick={() => refreshWebhooks(webhookCursor, true)}
                disabled={webhookLoading}
              >
                Load More
              </button>
            </div>
          ) : null}
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600 }}>Dead Letter Queue</h3>
            <button type="button" style={secondaryButtonStyle} onClick={() => refreshDeadLetters()} disabled={deadLetterLoading}>
              Refresh
            </button>
          </div>
          {deadLetterError ? <p style={{ ...mutedTextStyle, color: '#b91c1c' }}>{deadLetterError}</p> : null}
          {deadLetters.length === 0 ? <p style={mutedTextStyle}>{deadLetterLoading ? 'Loading dead letters…' : 'No dead letters found.'}</p> : null}
          <div style={{ display: 'grid', gap: '1rem' }}>
            {deadLetters.map((entry) => (
              <div key={entry.id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem', display: 'grid', gap: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                  <div>
                    <p style={mutedTextStyle}>Registration: {entry.registrationId}</p>
                    <p style={mutedTextStyle}>Event: {entry.eventId}</p>
                    <p style={mutedTextStyle}>Reason: {entry.failureReason}</p>
                    <p style={mutedTextStyle}>Attempts: {entry.attemptCount}</p>
                  </div>
                  <button
                    type="button"
                    style={buttonStyle}
                    onClick={() => handleReplay(entry)}
                    disabled={deadLetterLoading}
                  >
                    Replay
                  </button>
                </div>
                <details>
                  <summary style={{ cursor: 'pointer' }}>Payload</summary>
                  <JsonPreview data={entry} />
                </details>
              </div>
            ))}
          </div>
          {deadLetterCursor ? (
            <div style={{ marginTop: '0.75rem' }}>
              <button
                type="button"
                style={secondaryButtonStyle}
                onClick={() => refreshDeadLetters(deadLetterCursor ?? undefined, true)}
                disabled={deadLetterLoading}
              >
                Load More
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function App(): JSX.Element {
  const defaultBaseUrl = (import.meta.env.VITE_AGENTPAY_API_URL as string | undefined) ?? 'http://localhost:8080';
  const docsUrl = import.meta.env.VITE_AGENTPAY_DOCS_URL as string | undefined;

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
    <div style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <h1 style={{ fontSize: '1.75rem', margin: 0, fontWeight: 700 }}>AgentPay Hub Dashboard</h1>
          <p style={mutedTextStyle}>Interact with invoices, payments, and webhooks on your local AgentPay environment.</p>
        </div>
      </header>

      <div style={panelsGridStyle}>
        <ApiConfigPanel
          baseUrl={baseUrl}
          apiKey={apiKey}
          setBaseUrl={setBaseUrl}
          setApiKey={setApiKey}
          onPing={handlePing}
          pingState={pingState}
          pingMessage={pingMessage}
          docsUrl={docsUrl}
        />

        {client ? (
          <>
            <InvoicePanel client={client} />
            <PaymentsPanel client={client} />
            <WebhooksPanel client={client} />
          </>
        ) : (
          <section style={panelStyle}>
            <h2 style={panelTitleStyle}>Awaiting Configuration</h2>
            <p style={mutedTextStyle}>
              Enter a valid API key above to unlock invoice, payment, and webhook tooling. Your API key is stored locally and never leaves the browser.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
