import fetch from 'cross-fetch';
import { ZodTypeAny, z } from 'zod';
import { errorEnvelopeSchema } from '@agentpay/types';
import { AgentPayError } from '../errors';

export interface HttpClientConfig {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  defaultHeaders?: Record<string, string>;
}

export interface RequestOptions<TSchema extends ZodTypeAny> {
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  body?: unknown;
  schema: TSchema;
  signal?: AbortSignal;
}

export class HttpClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly defaultHeaders: Record<string, string>;

  constructor(config: HttpClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.timeoutMs = config.timeoutMs ?? 15_000;
    const rawFetch = config.fetchImpl ?? fetch;
    this.fetchImpl = rawFetch.bind(globalThis);
    this.defaultHeaders = config.defaultHeaders ?? {};
  }

  async request<TSchema extends ZodTypeAny>(options: RequestOptions<TSchema>): Promise<z.infer<TSchema>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const url = this.buildUrl(options.path, options.query);
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        ...this.defaultHeaders,
        ...options.headers
      };

      const response = await this.fetchImpl(url, {
        method: options.method,
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: options.signal ?? controller.signal
      });

      const text = await response.text();
      const json = text.length ? JSON.parse(text) : undefined;

      if (!response.ok) {
        const parsed = errorEnvelopeSchema.safeParse(json);
        if (parsed.success) {
          throw AgentPayError.fromEnvelope(response.status, parsed.data);
        }
        throw new AgentPayError('HTTP error', {
          status: response.status,
          details: { raw: json }
        });
      }

      const parsed = options.schema.safeParse(json);
      if (!parsed.success) {
        throw new AgentPayError('Failed to parse response payload', {
          status: response.status,
          details: parsed.error.flatten().fieldErrors
        });
      }

      return parsed.data;
    } catch (error) {
      if (error instanceof AgentPayError) {
        throw error;
      }
      if ((error as Error).name === 'AbortError') {
        throw new AgentPayError('Request timed out', { status: 408, retryable: true });
      }
      throw new AgentPayError((error as Error).message ?? 'Unknown error', { status: 500 });
    } finally {
      clearTimeout(timer);
    }
  }

  private buildUrl(path: string, query?: Record<string, string | number | boolean | undefined>): string {
    const url = new URL(path, `${this.baseUrl}/`);
    if (query) {
      Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      });
    }
    return url.toString();
  }
}
