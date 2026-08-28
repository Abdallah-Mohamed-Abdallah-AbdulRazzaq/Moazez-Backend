const UNIVERSAL_REGRESSION_POSTGRES_HOST_PATTERN = /^g07-[a-z0-9-]+-postgres$/u;
const UNIVERSAL_REGRESSION_DATABASE_PATTERN = /^g07_[0-9a-f]{20}$/u;
const LOOPBACK_POSTGRES_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
]);

export interface DisposablePostgresTargetInput {
  databaseUrl: string | undefined;
  nodeEnv: string | undefined;
  universalRegressionMarker: string | undefined;
  localDatabasePredicate: (databaseName: string) => boolean;
  errorMessage: string;
}

export function assertDisposablePostgresTarget(
  input: DisposablePostgresTargetInput,
): void {
  if (input.nodeEnv !== 'test' || !input.databaseUrl) {
    throw new Error(input.errorMessage);
  }

  let databaseUrl: URL;
  let databaseName: string;
  try {
    databaseUrl = new URL(input.databaseUrl);
    databaseName = decodeURIComponent(databaseUrl.pathname.slice(1));
  } catch {
    throw new Error(input.errorMessage);
  }

  if (databaseUrl.protocol !== 'postgresql:' || databaseName.length === 0) {
    throw new Error(input.errorMessage);
  }

  const isApprovedLoopbackTarget =
    LOOPBACK_POSTGRES_HOSTS.has(databaseUrl.hostname) &&
    input.localDatabasePredicate(databaseName);
  const isCanonicalUniversalRegressionTarget =
    input.universalRegressionMarker === '1' &&
    UNIVERSAL_REGRESSION_POSTGRES_HOST_PATTERN.test(databaseUrl.hostname) &&
    databaseUrl.port === '5432' &&
    decodeURIComponent(databaseUrl.username) === 'g07_ci' &&
    UNIVERSAL_REGRESSION_DATABASE_PATTERN.test(databaseName);

  if (!isApprovedLoopbackTarget && !isCanonicalUniversalRegressionTarget) {
    throw new Error(input.errorMessage);
  }
}
