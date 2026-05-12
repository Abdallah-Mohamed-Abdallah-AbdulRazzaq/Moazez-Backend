import {
  decryptEmailSecret,
  encryptEmailSecret,
  resolveEmailSecretKey,
} from '../domain/email-secret-crypto';

describe('email secret crypto', () => {
  const key = resolveEmailSecretKey(
    'base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    'test',
  );

  it('encrypts and decrypts provider secrets with AES-GCM', () => {
    const encrypted = encryptEmailSecret('smtp-secret', key);

    expect(encrypted).not.toContain('smtp-secret');
    expect(decryptEmailSecret(encrypted, key)).toBe('smtp-secret');
  });

  it('supports hex encoded 32 byte keys', () => {
    const hexKey = resolveEmailSecretKey(`hex:${'01'.repeat(32)}`, 'test');
    const encrypted = encryptEmailSecret('api-key-secret', hexKey);

    expect(decryptEmailSecret(encrypted, hexKey)).toBe('api-key-secret');
  });

  it('rejects invalid key lengths', () => {
    expect(() => resolveEmailSecretKey('base64:abc=', 'test')).toThrow(
      /32 bytes/,
    );
  });

  it('requires an explicit key outside local and test runtime', () => {
    expect(() => resolveEmailSecretKey(undefined, 'production')).toThrow(
      /required/,
    );
  });
});
