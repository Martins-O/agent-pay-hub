import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { Response } from 'cross-fetch';
import { HttpClient } from '../src/internal/http';
import { AgentPayError } from '../src/errors';

const responseSchema = z.object({ success: z.boolean() });

function createResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return body === undefined ? '' : JSON.stringify(body);
    }
  } as Response;
}

describe('HttpClient', () => {
  it('parses successful responses', async () => {
    const mockFetch = vi.fn().mockResolvedValue(createResponse(200, { success: true }));
    const client = new HttpClient({ baseUrl: 'https://api.test', apiKey: 'key', fetchImpl: mockFetch });

    const result = await client.request({ method: 'GET', path: '/ok', schema: responseSchema });

    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith('https://api.test/ok', expect.objectContaining({ method: 'GET' }));
  });

  it('throws AgentPayError for server envelopes', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      createResponse(400, {
        code: 'VALIDATION_FAILED',
        message: 'Nope',
        details: { field: 'amount' },
        correlationId: 'cid',
        retryable: false
      })
    );
    const client = new HttpClient({ baseUrl: 'https://api.test', apiKey: 'key', fetchImpl: mockFetch });

    await expect(client.request({ method: 'GET', path: '/fail', schema: responseSchema })).rejects.toMatchObject({
      status: 400,
      correlationId: 'cid'
    });
  });

  it('throws AgentPayError when parsing fails', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      async text() {
        return '{"success": false';
      }
    });

    const client = new HttpClient({ baseUrl: 'https://api.test', apiKey: 'key', fetchImpl: mockFetch });

    await expect(client.request({ method: 'GET', path: '/bad', schema: responseSchema })).rejects.toBeInstanceOf(
      AgentPayError
    );
  });

  it('aborts when timeout elapses', async () => {
    const mockFetch = vi.fn((_: string, init?: RequestInit) =>
      new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('Aborted');
          error.name = 'AbortError';
          reject(error);
        });
      })
    );

    const client = new HttpClient({ baseUrl: 'https://api.test', apiKey: 'key', fetchImpl: mockFetch, timeoutMs: 5 });

    await expect(client.request({ method: 'GET', path: '/slow', schema: responseSchema })).rejects.toMatchObject({
      status: 408
    });
  });
});
