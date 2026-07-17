import { isIP } from 'node:net';

const SIGNED_QUERY_KEYS = new Set([
  'x-amz-algorithm',
  'x-amz-credential',
  'x-amz-date',
  'x-amz-expires',
  'x-amz-security-token',
  'x-amz-signature',
  'x-amz-signedheaders',
  'x-goog-algorithm',
  'x-goog-credential',
  'x-goog-date',
  'x-goog-expires',
  'x-goog-signedheaders',
  'x-goog-signature',
  'googleaccessid',
  'signature',
  'expires',
  'awsaccesskeyid',
]);

const AZURE_SAS_COMPANION_KEYS = new Set([
  'sv',
  'se',
  'sp',
  'sr',
  'ss',
  'srt',
  'st',
  'sip',
  'spr',
  'skoid',
  'sktid',
  'skt',
  'ske',
  'sks',
  'skv',
]);

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
];

export type LegacyBrandingLogoValueClass =
  | 'external_http_https'
  | 'protected_files_download_route'
  | 'signed_storage_url'
  | 'raw_storage_key'
  | 'invalid_url'
  | 'other';

export function classifyLegacyBrandingLogoValue(
  value: string,
): LegacyBrandingLogoValueClass {
  const candidate = value.trim();
  if (/^(?:schools|organizations)\/[\w./-]+$/i.test(candidate)) {
    return 'raw_storage_key';
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return candidate.includes('://') ? 'invalid_url' : 'other';
  }

  if (isProtectedFilesPath(parsed.pathname)) {
    return 'protected_files_download_route';
  }
  if (hasSignedStorageQuery(parsed)) return 'signed_storage_url';
  if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
    return 'external_http_https';
  }
  return 'other';
}

export function toSafeLegacyBrandingLogoUrl(
  value: string | null,
): string | null {
  if (!value) return null;

  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    return null;
  }

  if (
    parsed.protocol !== 'https:' ||
    parsed.username.length > 0 ||
    parsed.password.length > 0 ||
    parsed.hostname.length === 0 ||
    !isSyntacticallyPublicHostname(parsed.hostname) ||
    isProtectedFilesPath(parsed.pathname) ||
    hasSignedStorageQuery(parsed)
  ) {
    return null;
  }

  return parsed.toString();
}

function isProtectedFilesPath(pathname: string): boolean {
  return /(?:^|\/)api\/v1\/files\/[^/]+\/download\/?$/i.test(pathname);
}

function hasSignedStorageQuery(url: URL): boolean {
  const keys = new Set(
    [...url.searchParams.keys()].map((key) => key.toLowerCase()),
  );
  if ([...keys].some((key) => SIGNED_QUERY_KEYS.has(key))) return true;

  if (keys.has('sig')) {
    return [...keys].some((key) => AZURE_SAS_COMPANION_KEYS.has(key));
  }

  return false;
}

export function isSyntacticallyPublicHostname(hostname: string): boolean {
  const normalized = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
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
  if (
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
  ) {
    return false;
  }
  return true;
}

function isPublicIpv6(hostname: string): boolean {
  const words = expandIpv6(hostname);
  if (!words) return false;
  const allZero = words.every((word) => word === 0);
  if (allZero) return false;
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
  if (
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
  ) {
    return false;
  }
  return true;
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
