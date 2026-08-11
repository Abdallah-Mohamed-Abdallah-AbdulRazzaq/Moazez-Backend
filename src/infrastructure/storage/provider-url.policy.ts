import { isIP } from 'node:net';

export type PersistedUrlClassification =
  | 'absent'
  | 'managed_internal_reference'
  | 'external_https'
  | 'gcs_provider_url'
  | 's3_compatible_provider_url'
  | 'unsafe';

export interface PersistedUrlClassificationResult {
  classification: PersistedUrlClassification;
  normalizedValue?: string;
  reasonCode?:
    | 'empty_value'
    | 'malformed_url'
    | 'insecure_http'
    | 'unsupported_scheme'
    | 'embedded_credentials'
    | 'non_public_hostname';
}

export interface PersistedUrlPolicyOptions {
  /** Actual application-configured S3-compatible endpoints, when available. */
  s3CompatibleEndpoints?: readonly string[];
}

const NON_PUBLIC_HOST_SUFFIXES = [
  'localhost',
  'local',
  'localdomain',
  'internal',
  'intranet',
  'lan',
  'home',
  'home.arpa',
  'test',
  'example',
  'invalid',
] as const;

const MANAGED_FILE_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Classifies values that may otherwise become persistent storage identity.
 * Provider results intentionally never contain the input value, query string,
 * credentials, or signature material.
 */
export function classifyPersistedUrl(
  value: string | null | undefined,
  options: PersistedUrlPolicyOptions = {},
): PersistedUrlClassificationResult {
  if (value === null || value === undefined) {
    return { classification: 'absent' };
  }

  const candidate = value.trim();
  if (candidate.length === 0) {
    return { classification: 'unsafe', reasonCode: 'empty_value' };
  }

  if (isManagedInternalReference(candidate)) {
    return {
      classification: 'managed_internal_reference',
      normalizedValue: candidate,
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { classification: 'unsafe', reasonCode: 'malformed_url' };
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol === 'gs:') return { classification: 'gcs_provider_url' };
  if (protocol === 's3:') {
    return { classification: 's3_compatible_provider_url' };
  }

  if (protocol !== 'http:' && protocol !== 'https:') {
    return { classification: 'unsafe', reasonCode: 'unsupported_scheme' };
  }

  if (isProtectedFilesPath(parsed.pathname)) {
    return { classification: 'managed_internal_reference' };
  }

  const hostname = normalizeHostname(parsed.hostname);
  if (isGcsHostname(hostname, parsed.pathname)) {
    return { classification: 'gcs_provider_url' };
  }
  if (
    isAmazonS3Hostname(hostname) ||
    isRepositoryMinioHostname(hostname, parsed.port) ||
    isConfiguredS3CompatibleEndpoint(parsed, options.s3CompatibleEndpoints)
  ) {
    return { classification: 's3_compatible_provider_url' };
  }

  if (protocol === 'http:') {
    return { classification: 'unsafe', reasonCode: 'insecure_http' };
  }
  if (parsed.username.length > 0 || parsed.password.length > 0) {
    return { classification: 'unsafe', reasonCode: 'embedded_credentials' };
  }
  if (!isSyntacticallyPublicHostname(hostname)) {
    return { classification: 'unsafe', reasonCode: 'non_public_hostname' };
  }

  return {
    classification: 'external_https',
    normalizedValue: parsed.toString(),
  };
}

export function isProviderUrlClassification(
  classification: PersistedUrlClassification,
): boolean {
  return (
    classification === 'gcs_provider_url' ||
    classification === 's3_compatible_provider_url'
  );
}

function isManagedInternalReference(candidate: string): boolean {
  if (MANAGED_FILE_ID.test(candidate)) return true;
  return (
    candidate.startsWith('/') &&
    !candidate.startsWith('//') &&
    !candidate.includes('\\') &&
    !candidate.includes('\0')
  );
}

function isProtectedFilesPath(pathname: string): boolean {
  return /(?:^|\/)api\/v1\/files\/[^/]+\/download\/?$/i.test(pathname);
}

function isGcsHostname(hostname: string, pathname: string): boolean {
  if (
    hostname === 'storage.googleapis.com' ||
    hostname.endsWith('.storage.googleapis.com') ||
    hostname === 'storage.cloud.google.com'
  ) {
    return true;
  }

  return (
    hostname === 'www.googleapis.com' &&
    /^\/(?:download\/)?storage\/v1\//i.test(pathname)
  );
}

function isAmazonS3Hostname(hostname: string): boolean {
  if (hostname === 's3.amazonaws.com') return true;
  if (/^s3[.-][a-z0-9-]+\.amazonaws\.com(?:\.cn)?$/i.test(hostname)) {
    return true;
  }
  return /\.s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com(?:\.cn)?$/i.test(hostname);
}

function isRepositoryMinioHostname(hostname: string, port: string): boolean {
  const localEndpoint =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === 'host.docker.internal';
  if (localEndpoint && (port === '9000' || port === '9001')) return true;

  const labels = hostname.split('.');
  return labels.some(
    (label) =>
      label === 'minio' ||
      label.startsWith('minio-') ||
      label.endsWith('-minio'),
  );
}

function isConfiguredS3CompatibleEndpoint(
  candidate: URL,
  endpoints: readonly string[] | undefined,
): boolean {
  if (!endpoints) return false;
  return endpoints.some((endpoint) => {
    try {
      const parsed = new URL(endpoint);
      return (
        normalizeHostname(parsed.hostname) ===
          normalizeHostname(candidate.hostname) &&
        effectivePort(parsed) === effectivePort(candidate)
      );
    } catch {
      return false;
    }
  });
}

function effectivePort(url: URL): string {
  if (url.port) return url.port;
  return url.protocol === 'https:'
    ? '443'
    : url.protocol === 'http:'
      ? '80'
      : '';
}

function normalizeHostname(hostname: string): string {
  return hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
}

export function isSyntacticallyPublicHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  if (!normalized) return false;
  const version = isIP(normalized);
  if (version === 4) return isPublicIpv4(normalized);
  if (version === 6) return isPublicIpv6(normalized);

  if (!normalized.includes('.')) return false;
  for (const suffix of NON_PUBLIC_HOST_SUFFIXES) {
    if (normalized === suffix || normalized.endsWith(`.${suffix}`)) {
      return false;
    }
  }
  return true;
}

function isPublicIpv4(hostname: string): boolean {
  const [first, second, third] = hostname.split('.').map(Number);
  return !(
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 192 && second === 0 && third === 0) ||
    (first === 192 && second === 0 && third === 2) ||
    (first === 192 && second === 88 && third === 99) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113)
  );
}

function isPublicIpv6(hostname: string): boolean {
  const words = expandIpv6(hostname);
  if (!words) return false;
  if (words.every((word) => word === 0)) return false;
  if (words.slice(0, 7).every((word) => word === 0) && words[7] === 1) {
    return false;
  }

  const isMappedIpv4 =
    words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff;
  const isCompatibleIpv4 = words.slice(0, 6).every((word) => word === 0);
  if (isMappedIpv4 || isCompatibleIpv4) {
    const ipv4 = `${words[6] >>> 8}.${words[6] & 0xff}.${words[7] >>> 8}.${words[7] & 0xff}`;
    return isPublicIpv4(ipv4);
  }

  const first = words[0];
  return !(
    (first & 0xfe00) === 0xfc00 ||
    (first & 0xffc0) === 0xfe80 ||
    (first & 0xffc0) === 0xfec0 ||
    (first & 0xff00) === 0xff00 ||
    (first === 0x0100 && words.slice(1).every((word) => word === 0)) ||
    (first === 0x2001 && words[1] <= 0x01ff) ||
    (first === 0x2001 && words[1] === 0x0db8) ||
    first === 0x2002 ||
    (first & 0xfff0) === 0x3ff0 ||
    first === 0x5f00 ||
    (first === 0x0064 && words[1] === 0xff9b)
  );
}

function expandIpv6(hostname: string): number[] | null {
  let value = hostname;
  if (value.includes('.')) {
    const lastColon = value.lastIndexOf(':');
    if (lastColon < 0) return null;
    const ipv4 = value.slice(lastColon + 1);
    if (isIP(ipv4) !== 4) return null;
    const octets = ipv4.split('.').map(Number);
    value = `${value.slice(0, lastColon)}:${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }

  const halves = value.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  if (
    missing < 0 ||
    (halves.length === 1 && missing !== 0) ||
    (halves.length === 2 && missing < 1)
  ) {
    return null;
  }
  const words = [
    ...left,
    ...Array.from({ length: missing }, () => '0'),
    ...right,
  ].map((word) => Number.parseInt(word, 16));
  return words.length === 8 && words.every((word) => Number.isFinite(word))
    ? words
    : null;
}
