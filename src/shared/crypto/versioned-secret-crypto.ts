import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

export const SECRET_KEY_BYTES = 32;
export const SECRET_IV_BYTES = 12;
export const SECRET_AUTH_TAG_BYTES = 16;
export const SECRET_KEY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
export const LEGACY_SECRET_KEY_ENV_NAME = 'SETTINGS_SECRET_ENCRYPTION_KEY';

export type SecretRuntimeEnvironment =
  | 'development'
  | 'test'
  | 'staging'
  | 'production';

export type SecretKeyFamily = 'smtp-secret' | 'app-device-token';

export interface SecretKeyring {
  family: SecretKeyFamily;
  active: SecretKeyringEntry;
  previous?: SecretKeyringEntry;
}

export interface SecretKeyringEntry {
  id: string;
  key: Buffer;
}

export interface SecretKeyFamilyDefinition {
  family: SecretKeyFamily;
  activeKeyIdEnvironmentName: string;
  activeKeyEnvironmentName: string;
  previousKeyIdEnvironmentName: string;
  previousKeyEnvironmentName: string;
  localActiveKeyId: string;
  localActiveKeyMaterial: string;
  localLegacyKeyMaterial: string;
}

export const EMAIL_SECRET_KEY_FAMILY = Object.freeze({
  family: 'smtp-secret',
  activeKeyIdEnvironmentName: 'SETTINGS_EMAIL_SECRET_ENCRYPTION_ACTIVE_KEY_ID',
  activeKeyEnvironmentName: 'SETTINGS_EMAIL_SECRET_ENCRYPTION_ACTIVE_KEY',
  previousKeyIdEnvironmentName:
    'SETTINGS_EMAIL_SECRET_ENCRYPTION_PREVIOUS_KEY_ID',
  previousKeyEnvironmentName: 'SETTINGS_EMAIL_SECRET_ENCRYPTION_PREVIOUS_KEY',
  localActiveKeyId: 'local-email-v2',
  localActiveKeyMaterial: 'moazez-local-test-settings-email-secret-v2-active',
  localLegacyKeyMaterial: 'moazez-local-test-settings-email-secret',
} as const satisfies SecretKeyFamilyDefinition);

export const APP_DEVICE_TOKEN_KEY_FAMILY = Object.freeze({
  family: 'app-device-token',
  activeKeyIdEnvironmentName: 'APP_DEVICE_TOKEN_ENCRYPTION_ACTIVE_KEY_ID',
  activeKeyEnvironmentName: 'APP_DEVICE_TOKEN_ENCRYPTION_ACTIVE_KEY',
  previousKeyIdEnvironmentName: 'APP_DEVICE_TOKEN_ENCRYPTION_PREVIOUS_KEY_ID',
  previousKeyEnvironmentName: 'APP_DEVICE_TOKEN_ENCRYPTION_PREVIOUS_KEY',
  localActiveKeyId: 'local-device-token-v2',
  localActiveKeyMaterial: 'moazez-local-test-app-device-token-secret-v2-active',
  localLegacyKeyMaterial: 'moazez-local-test-app-device-token-secret',
} as const satisfies SecretKeyFamilyDefinition);

export class SecretKeyConfigurationError extends Error {
  constructor(
    readonly configurationField: string,
    message: string,
  ) {
    super(message);
    this.name = 'SecretKeyConfigurationError';
  }
}

export class SecretEnvelopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecretEnvelopeError';
  }
}

export function parseConfiguredSecretKey(
  rawKey: string,
  configurationField: string,
): Buffer {
  const trimmed = rawKey.trim();
  let key: Buffer;

  if (trimmed.startsWith('base64:')) {
    key = decodeConfiguredBase64(
      trimmed.slice('base64:'.length),
      configurationField,
    );
  } else if (trimmed.startsWith('hex:')) {
    key = decodeConfiguredHex(trimmed.slice('hex:'.length), configurationField);
  } else if (/^[A-Fa-f0-9]{64}$/u.test(trimmed)) {
    key = Buffer.from(trimmed, 'hex');
  } else {
    key = decodeConfiguredBase64(trimmed, configurationField);
  }

  if (key.length !== SECRET_KEY_BYTES) {
    throw new SecretKeyConfigurationError(
      configurationField,
      `${configurationField} must decode to exactly ${SECRET_KEY_BYTES} bytes`,
    );
  }

  return key;
}

export function parseSecretKeyId(
  rawKeyId: string,
  configurationField: string,
): string {
  const keyId = rawKeyId.trim();
  if (!SECRET_KEY_ID_PATTERN.test(keyId)) {
    throw new SecretKeyConfigurationError(
      configurationField,
      `${configurationField} must match the approved key ID policy`,
    );
  }
  return keyId;
}

export function resolveSecretKeyring(
  environment: object,
  family: SecretKeyFamilyDefinition,
  nodeEnvironment: SecretRuntimeEnvironment,
): SecretKeyring {
  const activeKeyId = optionalTrimmed(
    readEnvironmentValue(environment, family.activeKeyIdEnvironmentName),
  );
  const activeKey = optionalTrimmed(
    readEnvironmentValue(environment, family.activeKeyEnvironmentName),
  );
  const previousKeyId = optionalTrimmed(
    readEnvironmentValue(environment, family.previousKeyIdEnvironmentName),
  );
  const previousKey = optionalTrimmed(
    readEnvironmentValue(environment, family.previousKeyEnvironmentName),
  );

  assertPair(
    activeKeyId,
    activeKey,
    family.activeKeyIdEnvironmentName,
    family.activeKeyEnvironmentName,
  );
  assertPair(
    previousKeyId,
    previousKey,
    family.previousKeyIdEnvironmentName,
    family.previousKeyEnvironmentName,
  );

  let active: SecretKeyringEntry;
  if (activeKeyId && activeKey) {
    active = {
      id: parseSecretKeyId(activeKeyId, family.activeKeyIdEnvironmentName),
      key: parseConfiguredSecretKey(activeKey, family.activeKeyEnvironmentName),
    };
  } else {
    if (isStrictEnvironment(nodeEnvironment)) {
      throw new SecretKeyConfigurationError(
        family.activeKeyIdEnvironmentName,
        `${family.activeKeyIdEnvironmentName} and ${family.activeKeyEnvironmentName} are required for staging and production`,
      );
    }
    active = {
      id: family.localActiveKeyId,
      key: deterministicLocalKey(family.localActiveKeyMaterial),
    };
  }

  let previous: SecretKeyringEntry | undefined;
  if (previousKeyId && previousKey) {
    previous = {
      id: parseSecretKeyId(previousKeyId, family.previousKeyIdEnvironmentName),
      key: parseConfiguredSecretKey(
        previousKey,
        family.previousKeyEnvironmentName,
      ),
    };
    if (previous.id === active.id) {
      throw new SecretKeyConfigurationError(
        family.previousKeyIdEnvironmentName,
        `${family.previousKeyIdEnvironmentName} must differ from ${family.activeKeyIdEnvironmentName}`,
      );
    }
  }

  return previous
    ? { family: family.family, active, previous }
    : { family: family.family, active };
}

export function resolveLegacySecretKey(
  rawKey: string | undefined,
  nodeEnvironment: SecretRuntimeEnvironment,
  family: SecretKeyFamilyDefinition,
): Buffer | undefined {
  const configuredKey = optionalTrimmed(rawKey);
  if (configuredKey) {
    return parseConfiguredSecretKey(configuredKey, LEGACY_SECRET_KEY_ENV_NAME);
  }
  return isStrictEnvironment(nodeEnvironment)
    ? undefined
    : deterministicLocalKey(family.localLegacyKeyMaterial);
}

export function validateSecretEncryptionEnvironment(
  environment: object,
  nodeEnvironment: SecretRuntimeEnvironment,
): readonly SecretKeyConfigurationError[] {
  const errors: SecretKeyConfigurationError[] = [];
  const resolvedKeyrings = new Map<SecretKeyFamily, SecretKeyring>();

  for (const family of [EMAIL_SECRET_KEY_FAMILY, APP_DEVICE_TOKEN_KEY_FAMILY]) {
    try {
      resolvedKeyrings.set(
        family.family,
        resolveSecretKeyring(environment, family, nodeEnvironment),
      );
    } catch (error) {
      errors.push(asSecretKeyConfigurationError(error));
    }
  }

  const smtpKeyring = resolvedKeyrings.get(EMAIL_SECRET_KEY_FAMILY.family);
  const deviceKeyring = resolvedKeyrings.get(
    APP_DEVICE_TOKEN_KEY_FAMILY.family,
  );
  if (smtpKeyring && deviceKeyring) {
    errors.push(
      ...validateCrossFamilyKeySeparation(smtpKeyring, deviceKeyring),
    );
  }

  try {
    const legacyKey = optionalTrimmed(
      readEnvironmentValue(environment, LEGACY_SECRET_KEY_ENV_NAME),
    );
    if (legacyKey) {
      parseConfiguredSecretKey(legacyKey, LEGACY_SECRET_KEY_ENV_NAME);
    }
  } catch (error) {
    errors.push(asSecretKeyConfigurationError(error));
  }

  return errors;
}

export function encryptSecretV2(
  plainText: string,
  keyring: SecretKeyring,
): string {
  assertKeyringEntry(keyring.active);
  const iv = randomBytes(SECRET_IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', keyring.active.key, iv);
  cipher.setAAD(buildAuthenticatedContext(keyring.family, keyring.active.id));
  const encrypted = Buffer.concat([
    cipher.update(plainText, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    'v2',
    keyring.active.id,
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join(':');
}

export function decryptVersionedSecret(
  cipherText: string,
  keyring: SecretKeyring,
  legacyKey: Buffer | undefined,
): string {
  if (cipherText.startsWith('v2:')) {
    return decryptV2(cipherText, keyring);
  }
  if (cipherText.startsWith('v1:')) {
    return decryptV1(cipherText, legacyKey);
  }
  throw new SecretEnvelopeError('Invalid encrypted secret format');
}

function decryptV2(cipherText: string, keyring: SecretKeyring): string {
  const parts = cipherText.split(':');
  if (parts.length !== 5 || parts[0] !== 'v2') {
    throw new SecretEnvelopeError('Invalid v2 encrypted secret format');
  }

  const [, keyId, ivText, tagText, encryptedText] = parts;
  if (!SECRET_KEY_ID_PATTERN.test(keyId)) {
    throw new SecretEnvelopeError('Invalid v2 encrypted secret key ID');
  }
  const entry = [keyring.active, keyring.previous].find(
    (candidate) => candidate?.id === keyId,
  );
  if (!entry) {
    throw new SecretEnvelopeError('Unknown encrypted secret key ID');
  }
  assertKeyringEntry(entry);

  const iv = decodeEnvelopeComponent(ivText, 'initialization vector');
  const tag = decodeEnvelopeComponent(tagText, 'authentication tag');
  const encrypted = decodeEnvelopeComponent(encryptedText, 'ciphertext', true);
  if (iv.length !== SECRET_IV_BYTES) {
    throw new SecretEnvelopeError(
      'Invalid encrypted secret initialization vector',
    );
  }
  if (tag.length !== SECRET_AUTH_TAG_BYTES) {
    throw new SecretEnvelopeError(
      'Invalid encrypted secret authentication tag',
    );
  }

  try {
    const decipher = createDecipheriv('aes-256-gcm', entry.key, iv);
    decipher.setAAD(buildAuthenticatedContext(keyring.family, keyId));
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new SecretEnvelopeError('Encrypted secret decryption failed');
  }
}

function decryptV1(cipherText: string, legacyKey: Buffer | undefined): string {
  const parts = cipherText.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new SecretEnvelopeError('Invalid v1 encrypted secret format');
  }
  if (!legacyKey) {
    throw new SecretEnvelopeError(
      'Legacy encrypted secret key is not configured',
    );
  }
  if (legacyKey.length !== SECRET_KEY_BYTES) {
    throw new SecretEnvelopeError('Legacy encrypted secret key is invalid');
  }

  const [, ivText, tagText, encryptedText] = parts;
  const iv = decodeEnvelopeComponent(ivText, 'initialization vector');
  const tag = decodeEnvelopeComponent(tagText, 'authentication tag');
  const encrypted = decodeEnvelopeComponent(encryptedText, 'ciphertext', true);
  if (iv.length !== SECRET_IV_BYTES) {
    throw new SecretEnvelopeError(
      'Invalid encrypted secret initialization vector',
    );
  }
  if (tag.length !== SECRET_AUTH_TAG_BYTES) {
    throw new SecretEnvelopeError(
      'Invalid encrypted secret authentication tag',
    );
  }

  try {
    const decipher = createDecipheriv('aes-256-gcm', legacyKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new SecretEnvelopeError('Encrypted secret decryption failed');
  }
}

function assertPair(
  id: string | undefined,
  key: string | undefined,
  idField: string,
  keyField: string,
): void {
  if (Boolean(id) === Boolean(key)) return;
  const missingField = id ? keyField : idField;
  throw new SecretKeyConfigurationError(
    missingField,
    `${idField} and ${keyField} must be provided together`,
  );
}

function assertKeyringEntry(entry: SecretKeyringEntry): void {
  if (!SECRET_KEY_ID_PATTERN.test(entry.id)) {
    throw new SecretEnvelopeError('Invalid encrypted secret key ID');
  }
  if (entry.key.length !== SECRET_KEY_BYTES) {
    throw new SecretEnvelopeError('Invalid encrypted secret key');
  }
}

function buildAuthenticatedContext(
  family: SecretKeyFamily,
  keyId: string,
): Buffer {
  if (family !== 'smtp-secret' && family !== 'app-device-token') {
    throw new SecretEnvelopeError('Invalid encrypted secret key family');
  }
  return Buffer.from(`v2:${family}:${keyId}`, 'utf8');
}

function validateCrossFamilyKeySeparation(
  smtpKeyring: SecretKeyring,
  deviceKeyring: SecretKeyring,
): readonly SecretKeyConfigurationError[] {
  const smtpEntries = [smtpKeyring.active, smtpKeyring.previous].filter(
    (entry): entry is SecretKeyringEntry => entry !== undefined,
  );
  const deviceEntries = [
    {
      entry: deviceKeyring.active,
      configurationField: APP_DEVICE_TOKEN_KEY_FAMILY.activeKeyEnvironmentName,
    },
    ...(deviceKeyring.previous
      ? [
          {
            entry: deviceKeyring.previous,
            configurationField:
              APP_DEVICE_TOKEN_KEY_FAMILY.previousKeyEnvironmentName,
          },
        ]
      : []),
  ];

  return deviceEntries
    .filter(({ entry }) =>
      smtpEntries.some((smtpEntry) =>
        timingSafeEqual(smtpEntry.key, entry.key),
      ),
    )
    .map(
      ({ configurationField }) =>
        new SecretKeyConfigurationError(
          configurationField,
          `${configurationField} must not reuse encryption key material from the smtp-secret family`,
        ),
    );
}

function decodeConfiguredHex(
  value: string,
  configurationField: string,
): Buffer {
  if (!/^[A-Fa-f0-9]{64}$/u.test(value)) {
    throw new SecretKeyConfigurationError(
      configurationField,
      `${configurationField} must contain a valid 32-byte hexadecimal key`,
    );
  }
  return Buffer.from(value, 'hex');
}

function decodeConfiguredBase64(
  value: string,
  configurationField: string,
): Buffer {
  const unpadded = value.replace(/=+$/u, '');
  const validAlphabet = /^[A-Za-z0-9+/_-]+={0,2}$/u.test(value);
  if (!validAlphabet || unpadded.includes('=') || unpadded.length % 4 === 1) {
    throw new SecretKeyConfigurationError(
      configurationField,
      `${configurationField} must contain a valid base64 key`,
    );
  }

  const decoded = Buffer.from(value, 'base64');
  const normalizedInput = unpadded.replace(/-/gu, '+').replace(/_/gu, '/');
  const normalizedDecoded = decoded.toString('base64').replace(/=+$/u, '');
  if (normalizedInput !== normalizedDecoded) {
    throw new SecretKeyConfigurationError(
      configurationField,
      `${configurationField} must contain a valid base64 key`,
    );
  }
  return decoded;
}

function decodeEnvelopeComponent(
  value: string,
  componentName: string,
  allowEmpty = false,
): Buffer {
  if ((!allowEmpty && value.length === 0) || !/^[A-Za-z0-9_-]*$/u.test(value)) {
    throw new SecretEnvelopeError(`Invalid encrypted secret ${componentName}`);
  }
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.toString('base64url') !== value) {
    throw new SecretEnvelopeError(`Invalid encrypted secret ${componentName}`);
  }
  return decoded;
}

function deterministicLocalKey(material: string): Buffer {
  return createHash('sha256').update(material, 'utf8').digest();
}

function isStrictEnvironment(
  nodeEnvironment: SecretRuntimeEnvironment,
): boolean {
  return nodeEnvironment === 'staging' || nodeEnvironment === 'production';
}

function optionalTrimmed(value: unknown): string | undefined {
  const trimmed = typeof value === 'string' ? value.trim() : undefined;
  return trimmed ? trimmed : undefined;
}

function readEnvironmentValue(environment: object, name: string): unknown {
  return (environment as Record<string, unknown>)[name];
}

function asSecretKeyConfigurationError(
  error: unknown,
): SecretKeyConfigurationError {
  if (error instanceof SecretKeyConfigurationError) return error;
  return new SecretKeyConfigurationError(
    'secret-encryption-configuration',
    'Secret encryption configuration is invalid',
  );
}
