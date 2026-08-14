import { ConfigService } from '@nestjs/config';
import { createCipheriv, randomBytes } from 'node:crypto';
import { Env } from '../../../../config/env.validation';
import {
  EMAIL_SECRET_KEY_FAMILY,
  parseConfiguredSecretKey,
  SecretKeyring,
} from '../../../../shared/crypto/versioned-secret-crypto';
import {
  decryptEmailSecret,
  EmailSecretCrypto,
  encryptEmailSecret,
  resolveEmailSecretKey,
  resolveEmailSecretKeyring,
} from '../domain/email-secret-crypto';

const ACTIVE_KEY = `hex:${'11'.repeat(32)}`;
const PREVIOUS_KEY = `hex:${'22'.repeat(32)}`;
const LEGACY_KEY = `hex:${'33'.repeat(32)}`;

describe('email secret crypto', () => {
  it('emits and decrypts the exact v2 envelope with the active key', () => {
    const keyring = emailKeyring();
    const encrypted = encryptEmailSecret('smtp-secret', keyring);

    expect(encrypted).toMatch(
      /^v2:email-active:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/u,
    );
    expect(encrypted).not.toContain('smtp-secret');
    expect(decryptEmailSecret(encrypted, keyring)).toBe('smtp-secret');
  });

  it('decrypts v2 ciphertext selected by the previous key ID', () => {
    const currentKeyring = emailKeyring();
    const previousWriter: SecretKeyring = {
      family: currentKeyring.family,
      active: currentKeyring.previous!,
    };
    const encrypted = encryptEmailSecret('rotated-smtp-secret', previousWriter);

    expect(encrypted).toMatch(/^v2:email-previous:/u);
    expect(decryptEmailSecret(encrypted, currentKeyring)).toBe(
      'rotated-smtp-secret',
    );
  });

  it('authenticates the visible key ID even when active and previous share key material', () => {
    const sharedKey = parseConfiguredSecretKey(
      `hex:${'aa'.repeat(32)}`,
      'test-shared-key',
    );
    const keyring: SecretKeyring = {
      family: 'smtp-secret',
      active: { id: 'key-a', key: sharedKey },
      previous: { id: 'key-b', key: sharedKey },
    };
    const encrypted = encryptEmailSecret('aad-key-id-bound', keyring);
    const tampered = encrypted.replace(/^v2:key-a:/u, 'v2:key-b:');

    expect(() => decryptEmailSecret(tampered, keyring)).toThrow(
      /decryption failed/u,
    );
  });

  it('fails closed for an unknown v2 key ID', () => {
    const keyring = emailKeyring();
    const encrypted = encryptEmailSecret('smtp-secret', keyring).replace(
      'v2:email-active:',
      'v2:unknown-key:',
    );

    expect(() => decryptEmailSecret(encrypted, keyring)).toThrow(
      /Unknown encrypted secret key ID/u,
    );
  });

  it('reads legacy v1 ciphertext with the configured decrypt-only key', () => {
    const legacyKey = resolveEmailSecretKey(LEGACY_KEY, 'production');
    const encrypted = createLegacyV1('legacy-smtp-secret', legacyKey!);

    expect(decryptEmailSecret(encrypted, emailKeyring(), legacyKey)).toBe(
      'legacy-smtp-secret',
    );
  });

  it('preserves the historical family-specific local v1 fallback', () => {
    const legacyKey = resolveEmailSecretKey(undefined, 'test');
    const encrypted = createLegacyV1('local-legacy-smtp', legacyKey!);

    expect(
      decryptEmailSecret(
        encrypted,
        resolveEmailSecretKeyring({}, 'test'),
        legacyKey,
      ),
    ).toBe('local-legacy-smtp');
  });

  it('defers a missing strict-runtime legacy key failure until v1 read', () => {
    const legacyKey = resolveEmailSecretKey(undefined, 'production');
    const encrypted = createLegacyV1(
      'legacy-smtp-secret',
      parseConfiguredSecretKey(LEGACY_KEY, 'test-fixture-key'),
    );

    expect(legacyKey).toBeUndefined();
    expect(() =>
      decryptEmailSecret(encrypted, emailKeyring(), legacyKey),
    ).toThrow(/Legacy encrypted secret key is not configured/u);
  });

  it.each([
    ['prefixed base64', 'base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='],
    ['prefixed hex', `hex:${'44'.repeat(32)}`],
    ['bare hex', '55'.repeat(32)],
    ['bare base64', 'ZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmY='],
  ])('accepts %s 32-byte active key encoding', (_name, activeKey) => {
    const keyring = resolveEmailSecretKeyring(
      emailEnvironment({
        [EMAIL_SECRET_KEY_FAMILY.activeKeyEnvironmentName]: activeKey,
      }),
      'production',
    );
    const encrypted = encryptEmailSecret('encoded-key-secret', keyring);

    expect(decryptEmailSecret(encrypted, keyring)).toBe('encoded-key-secret');
  });

  it('rejects invalid key length and invalid key IDs without exposing material', () => {
    const invalidMaterial = 'base64:do-not-expose-this-value';
    for (const environment of [
      emailEnvironment({
        [EMAIL_SECRET_KEY_FAMILY.activeKeyEnvironmentName]: invalidMaterial,
      }),
      emailEnvironment({
        [EMAIL_SECRET_KEY_FAMILY.activeKeyIdEnvironmentName]: 'bad:key-id',
      }),
    ]) {
      let message = '';
      try {
        resolveEmailSecretKeyring(environment, 'production');
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      expect(message).not.toContain(invalidMaterial);
      expect(message).not.toContain('do-not-expose-this-value');
    }
  });

  it('constructs in production without a legacy key and never writes v1', () => {
    const crypto = new EmailSecretCrypto(
      new ConfigService<Env>({
        NODE_ENV: 'production',
        ...emailEnvironment(),
      }),
    );

    const encrypted = crypto.encrypt('new-smtp-secret');
    expect(encrypted).toMatch(/^v2:email-active:/u);
    expect(encrypted).not.toMatch(/^v1:/u);
    expect(crypto.decrypt(encrypted)).toBe('new-smtp-secret');
  });
});

function emailKeyring(): SecretKeyring {
  return resolveEmailSecretKeyring(
    emailEnvironment({
      [EMAIL_SECRET_KEY_FAMILY.previousKeyIdEnvironmentName]: 'email-previous',
      [EMAIL_SECRET_KEY_FAMILY.previousKeyEnvironmentName]: PREVIOUS_KEY,
    }),
    'production',
  );
}

function emailEnvironment(
  overrides: Record<string, string> = {},
): Record<string, string> {
  return {
    [EMAIL_SECRET_KEY_FAMILY.activeKeyIdEnvironmentName]: 'email-active',
    [EMAIL_SECRET_KEY_FAMILY.activeKeyEnvironmentName]: ACTIVE_KEY,
    ...overrides,
  };
}

function createLegacyV1(plainText: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plainText, 'utf8'),
    cipher.final(),
  ]);
  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    encrypted.toString('base64url'),
  ].join(':');
}
