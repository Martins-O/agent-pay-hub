import { describe, expect, it } from 'vitest';
import { defaultIdempotencyKeyGenerator } from '../src/utils/idempotency';

describe('defaultIdempotencyKeyGenerator', () => {
  it('produces ULID strings', () => {
    const key = defaultIdempotencyKeyGenerator();
    expect(key).toHaveLength(26);
    expect(/^[0-9A-HJKMNP-TV-Z]+$/.test(key)).toBe(true);
  });

  it('generates unique keys', () => {
    const keys = new Set(Array.from({ length: 10 }, () => defaultIdempotencyKeyGenerator()));
    expect(keys.size).toBe(10);
  });
});
