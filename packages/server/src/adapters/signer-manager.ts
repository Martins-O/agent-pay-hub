import { Keypair } from '@solana/web3.js';

export class SignerManager {
  private readonly signers: Keypair[];
  private readonly indexByAddress: Map<string, Keypair>;
  private cursor = 0;

  constructor(signers: Keypair[]) {
    this.signers = signers;
    this.indexByAddress = new Map(signers.map((signer) => [signer.publicKey.toBase58(), signer]));
  }

  hasSigners(): boolean {
    return this.signers.length > 0;
  }

  getByAddress(address: string): Keypair | undefined {
    return this.indexByAddress.get(address);
  }

  getNext(): Keypair {
    if (this.signers.length === 0) {
      throw new Error('No signers configured');
    }

    const signer = this.signers[this.cursor];
    this.cursor = (this.cursor + 1) % this.signers.length;
    return signer;
  }
}
