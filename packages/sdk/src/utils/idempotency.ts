import { ulid } from 'ulid';

export type IdempotencyKeyGenerator = () => string;

export const defaultIdempotencyKeyGenerator: IdempotencyKeyGenerator = () => ulid();
