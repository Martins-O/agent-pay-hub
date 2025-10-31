import { describe, expect, it, vi } from 'vitest';
import type { Response } from 'cross-fetch';
import { AgentPayClient } from '../src';

function createResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(body);
    }
  } as Response;
}

describe('AgentPayClient', () => {
  it('lists webhook dead letters with query params', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(createResponse(200, { deadLetters: [], nextCursor: null }))
    );

    const client = new AgentPayClient({ baseUrl: 'https://api.test', apiKey: 'key', fetchImpl: fetchMock });

    await client.listWebhookDeadLetters();
    expect(fetchMock).toHaveBeenCalled();
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.test/v1/webhooks/dlq');

    await client.listWebhookDeadLetters({ cursor: 'next', limit: 10 });
    const secondCallUrl = fetchMock.mock.calls[1][0] as string;
    expect(secondCallUrl).toBe('https://api.test/v1/webhooks/dlq?cursor=next&limit=10');
  });

  it('replays a webhook dead letter via POST', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(createResponse(200, { success: true }))
    );

    const client = new AgentPayClient({ baseUrl: 'https://api.test', apiKey: 'key', fetchImpl: fetchMock });
    await client.replayWebhookDeadLetter('deadletter-1');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.test/v1/webhooks/dlq/deadletter-1/replay');
    expect((init as RequestInit)?.method).toBe('POST');
  });
});
