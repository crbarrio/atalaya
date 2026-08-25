import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
// 12 bytes is the size GCM is designed and tested for; a longer IV is
// accepted but re-hashed internally, which is both slower and non-standard.
const IV_LENGTH = 12;

/**
 * Reversible encryption for the one thing atalaya must both store and use
 * again on its own — channel credentials (an SMTP password, later a
 * Telegram bot token). Hashing (bcrypt/argon2) does not apply here: those
 * are one-way, built for verifying a login, not for a secret the app has to
 * hand back to a third party (nodemailer) on every send.
 */
@Injectable()
export class EncryptionService {
  private readonly key: Buffer;

  constructor() {
    const raw = process.env.ENCRYPTION_KEY;
    if (!raw) {
      throw new InternalServerErrorException(
        'ENCRYPTION_KEY is not set — required to store channel credentials. Generate one with `openssl rand -base64 32`.',
      );
    }
    const key = Buffer.from(raw, 'base64');
    if (key.length !== 32) {
      throw new InternalServerErrorException(
        'ENCRYPTION_KEY must decode to 32 bytes (AES-256) — generate one with `openssl rand -base64 32`.',
      );
    }
    this.key = key;
  }

  /** `iv.tag.ciphertext`, each base64 — self-contained, so no companion column to keep in sync. */
  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv, tag, ciphertext].map((buf) => buf.toString('base64')).join('.');
  }

  decrypt(payload: string): string {
    const [ivB64, tagB64, ciphertextB64] = payload.split('.');
    if (!ivB64 || !tagB64 || !ciphertextB64) {
      throw new InternalServerErrorException('Malformed encrypted payload — expected `iv.tag.ciphertext`');
    }
    const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextB64, 'base64')), decipher.final()]);
    return plaintext.toString('utf8');
  }
}
