import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { Env } from '../../../../config/env.validation';

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const VERSION = 'v1';
const KEY_ENV_NAME = 'SETTINGS_SECRET_ENCRYPTION_KEY';
const LOCAL_TEST_KEY_MATERIAL = 'moazez-local-test-settings-email-secret';

export function resolveEmailSecretKey(
  rawKey: string | undefined,
  nodeEnv = process.env.NODE_ENV ?? 'development',
): Buffer {
  const trimmed = rawKey?.trim();

  if (!trimmed) {
    if (nodeEnv === 'production' || nodeEnv === 'staging') {
      throw new Error(`${KEY_ENV_NAME} is required outside local/test runtime`);
    }

    return createHash('sha256').update(LOCAL_TEST_KEY_MATERIAL).digest();
  }

  const { value, encoding } = parseEncodedKey(trimmed);
  const key = Buffer.from(value, encoding);

  if (key.length !== KEY_BYTES) {
    throw new Error(`${KEY_ENV_NAME} must decode to exactly 32 bytes`);
  }

  return key;
}

export function encryptEmailSecret(plainText: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plainText, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join(':');
}

export function decryptEmailSecret(cipherText: string, key: Buffer): string {
  const parts = cipherText.split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Invalid encrypted email secret format');
  }

  const [, ivText, tagText, encryptedText] = parts;
  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(ivText, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

@Injectable()
export class EmailSecretCrypto {
  private readonly key: Buffer;

  constructor(private readonly configService: ConfigService<Env>) {
    this.key = resolveEmailSecretKey(
      this.configService.get<string>(KEY_ENV_NAME),
      this.configService.get<string>('NODE_ENV') ?? process.env.NODE_ENV,
    );
  }

  encrypt(plainText: string): string {
    return encryptEmailSecret(plainText, this.key);
  }

  decrypt(cipherText: string): string {
    return decryptEmailSecret(cipherText, this.key);
  }
}

function parseEncodedKey(rawKey: string): {
  value: string;
  encoding: 'base64' | 'hex';
} {
  if (rawKey.startsWith('base64:')) {
    return { value: rawKey.slice('base64:'.length), encoding: 'base64' };
  }

  if (rawKey.startsWith('hex:')) {
    return { value: rawKey.slice('hex:'.length), encoding: 'hex' };
  }

  if (/^[a-f0-9]{64}$/i.test(rawKey)) {
    return { value: rawKey, encoding: 'hex' };
  }

  return { value: rawKey, encoding: 'base64' };
}
