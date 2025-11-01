import { describe, expect, it } from 'vitest';
import { Keypair } from '@solana/web3.js';
import { SignerManager } from '../../src/adapters/signer-manager';

describe('SignerManager', () => {
  it('returns signers in a round-robin order', () => {
    const signerA = Keypair.generate();
    const signerB = Keypair.generate();
    const manager = new SignerManager([signerA, signerB]);

    const first = manager.getNext();
    const second = manager.getNext();
    const third = manager.getNext();

    expect(first.publicKey.toBase58()).toEqual(signerA.publicKey.toBase58());
    expect(second.publicKey.toBase58()).toEqual(signerB.publicKey.toBase58());
    expect(third.publicKey.toBase58()).toEqual(signerA.publicKey.toBase58());
  });

  it('maps signers by address', () => {
    const signer = Keypair.generate();
    const manager = new SignerManager([signer]);

    expect(manager.getByAddress(signer.publicKey.toBase58())).toBeTruthy();
    expect(manager.getByAddress(Keypair.generate().publicKey.toBase58())).toBeUndefined();
  });

  it('reports when no signers exist', () => {
    const manager = new SignerManager([]);
    expect(manager.hasSigners()).toBe(false);
    expect(() => manager.getNext()).toThrow(/No signers configured/);
  });
});
