import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

describe('loadAppEnv', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test';
    process.env.CACHE_URL = 'redis://localhost:6379/2';
    process.env.API_KEY_ENCRYPTION_SECRET = 'encryption-secret';
    process.env.WEBHOOK_BASE_URL = 'http://localhost:8080';
    process.env.WEBHOOK_SIGNING_SECRET = 'signing-secret';
    process.env.DEVNET_FAUCET_ADDRESS = 'DEVNET_FAUCET';
    process.env.ALLOWED_ASSETS = '{"USDC":"Mint"}';
    process.env.ALLOWED_ASSET_DECIMALS = '{"USDC":6}';
    process.env.SOLANA_PAYER_SECRET = 'TEST_SECRET_KEY';
    process.env.SOLANA_SIMULATION_ONLY = 'true';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('parses expected defaults when env present', async () => {
    const { loadAppEnv } = await import('../../src/config/env');
    const env = loadAppEnv();

    expect(env.SERVER_HOST).toBe('0.0.0.0');
    expect(env.SERVER_PORT).toBe(8080);
    expect(env.ALLOWED_ASSETS.USDC).toBe('Mint');
    expect(env.ALLOWED_ASSET_DECIMALS.USDC).toBe(6);
    expect(env.SOLANA_SIMULATION_ONLY).toBe(true);
  });

  it('throws when SOLANA_SIMULATION_ONLY is false without payer secret', async () => {
    process.env.SOLANA_SIMULATION_ONLY = 'false';
    delete process.env.SOLANA_PAYER_SECRET;

    const { loadAppEnv } = await import('../../src/config/env');

    expect(() => loadAppEnv()).toThrow(/SOLANA_PAYER_SECRET/);
  });

  it('throws when required env missing', async () => {
    process.env.DATABASE_URL = '';
    const { loadAppEnv } = await import('../../src/config/env');
    expect(() => loadAppEnv()).toThrow(/DATABASE_URL/);
  });
});
