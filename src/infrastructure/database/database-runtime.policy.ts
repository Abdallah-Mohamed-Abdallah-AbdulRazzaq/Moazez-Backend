export const DATABASE_RUNTIME_ROLES = [
  'api',
  'core-worker',
  'media-worker',
] as const;

export type DatabaseRuntimeRole = (typeof DATABASE_RUNTIME_ROLES)[number];

export const APPROVED_MAX_INSTANCES_SCOPE =
  'service-aggregate-across-active-revisions' as const;

export type DatabaseInstanceLimitScope = typeof APPROVED_MAX_INSTANCES_SCOPE;

export const APPLICATION_MANAGED_DATABASE_PARAMETERS = [
  'connection_limit',
  'pool_timeout',
  'connect_timeout',
  'application_name',
] as const;

export const PRISMA_SUPPORTED_POSTGRESQL_SSLMODES = Object.freeze([
  'prefer',
  'disable',
  'require',
] as const);

export interface DatabaseRuntimeRolePolicy {
  applicationName: string;
  maxInstances: number;
  instanceLimitScope: DatabaseInstanceLimitScope;
  fullCapRevisionOverlapAllowed: false;
  connectionLimit: Readonly<DatabaseRuntimeIntegerBound>;
  poolTimeoutSeconds: Readonly<DatabaseRuntimeIntegerBound>;
  connectTimeoutSeconds: Readonly<DatabaseRuntimeIntegerBound>;
}

export interface DatabaseRuntimeIntegerBound {
  default: number;
  minimum: number;
  maximum: number;
}

const boundedInteger = (
  defaultValue: number,
): Readonly<DatabaseRuntimeIntegerBound> =>
  Object.freeze({ default: defaultValue, minimum: 1, maximum: defaultValue });

export const DATABASE_RUNTIME_POLICY: Readonly<
  Record<DatabaseRuntimeRole, Readonly<DatabaseRuntimeRolePolicy>>
> = Object.freeze({
  api: Object.freeze({
    applicationName: 'moazez-api',
    maxInstances: 4,
    instanceLimitScope: APPROVED_MAX_INSTANCES_SCOPE,
    fullCapRevisionOverlapAllowed: false,
    connectionLimit: boundedInteger(5),
    poolTimeoutSeconds: boundedInteger(5),
    connectTimeoutSeconds: boundedInteger(5),
  }),
  'core-worker': Object.freeze({
    applicationName: 'moazez-core-worker',
    maxInstances: 2,
    instanceLimitScope: APPROVED_MAX_INSTANCES_SCOPE,
    fullCapRevisionOverlapAllowed: false,
    connectionLimit: boundedInteger(6),
    poolTimeoutSeconds: boundedInteger(10),
    connectTimeoutSeconds: boundedInteger(5),
  }),
  'media-worker': Object.freeze({
    applicationName: 'moazez-media-worker',
    maxInstances: 2,
    instanceLimitScope: APPROVED_MAX_INSTANCES_SCOPE,
    fullCapRevisionOverlapAllowed: false,
    connectionLimit: boundedInteger(3),
    poolTimeoutSeconds: boundedInteger(10),
    connectTimeoutSeconds: boundedInteger(5),
  }),
});

export const DATABASE_CONNECTION_BUDGET_POLICY = Object.freeze({
  migrationAllowance: Object.freeze({
    maxInstances: 1,
    connectionLimit: 2,
  }),
  operationsReserveConnections: 10,
  applicationAndOperationsAllocation: 50,
  failoverEmergencyReserveConnections: 50,
  failoverEmergencyReserveMayFundRevisionOverlap: false,
  governedTotalConnections: 100,
});

export interface DatabaseConnectionBudgetCalculation {
  roleConnections: Readonly<Record<DatabaseRuntimeRole, number>>;
  runtimeConnections: number;
  migrationConnections: number;
  operationsReserveConnections: number;
  applicationAndOperationsAllocation: number;
  failoverEmergencyReserveConnections: number;
  governedTotalConnections: number;
}

export interface DatabaseRuntimeSettings {
  role: DatabaseRuntimeRole;
  connectionLimit: number;
  poolTimeoutSeconds: number;
  connectTimeoutSeconds: number;
}

export interface BuildPrismaDatasourceUrlInput extends DatabaseRuntimeSettings {
  databaseUrl: string;
}

export type DatabaseDeploymentEnvironment =
  | 'development'
  | 'test'
  | 'staging'
  | 'production';

export class DatabaseRuntimePolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseRuntimePolicyError';
  }
}

export function calculateDatabaseConnectionBudget(): DatabaseConnectionBudgetCalculation {
  const roleConnections = Object.freeze(
    Object.fromEntries(
      DATABASE_RUNTIME_ROLES.map((role) => {
        const policy = DATABASE_RUNTIME_POLICY[role];
        return [role, policy.maxInstances * policy.connectionLimit.default];
      }),
    ) as Record<DatabaseRuntimeRole, number>,
  );
  const runtimeConnections = DATABASE_RUNTIME_ROLES.reduce(
    (total, role) => total + roleConnections[role],
    0,
  );
  const migrationConnections =
    DATABASE_CONNECTION_BUDGET_POLICY.migrationAllowance.maxInstances *
    DATABASE_CONNECTION_BUDGET_POLICY.migrationAllowance.connectionLimit;
  const applicationAndOperationsAllocation =
    runtimeConnections +
    migrationConnections +
    DATABASE_CONNECTION_BUDGET_POLICY.operationsReserveConnections;
  const governedTotalConnections =
    applicationAndOperationsAllocation +
    DATABASE_CONNECTION_BUDGET_POLICY.failoverEmergencyReserveConnections;

  return Object.freeze({
    roleConnections,
    runtimeConnections,
    migrationConnections,
    operationsReserveConnections:
      DATABASE_CONNECTION_BUDGET_POLICY.operationsReserveConnections,
    applicationAndOperationsAllocation,
    failoverEmergencyReserveConnections:
      DATABASE_CONNECTION_BUDGET_POLICY.failoverEmergencyReserveConnections,
    governedTotalConnections,
  });
}

export function assertDatabaseConnectionBudget(): void {
  const calculated = calculateDatabaseConnectionBudget();
  if (
    calculated.applicationAndOperationsAllocation !==
      DATABASE_CONNECTION_BUDGET_POLICY.applicationAndOperationsAllocation ||
    calculated.governedTotalConnections !==
      DATABASE_CONNECTION_BUDGET_POLICY.governedTotalConnections
  ) {
    throw new DatabaseRuntimePolicyError(
      'Database connection budget policy is inconsistent',
    );
  }
}

export function resolveDatabaseRuntimeSettings(
  role: DatabaseRuntimeRole,
  overrides: Partial<Omit<DatabaseRuntimeSettings, 'role'>> = {},
): DatabaseRuntimeSettings {
  const policy = DATABASE_RUNTIME_POLICY[role];
  if (!policy) {
    throw new DatabaseRuntimePolicyError(
      'DATABASE_RUNTIME_ROLE is not supported',
    );
  }

  return Object.freeze({
    role,
    connectionLimit: requireBoundedInteger(
      'DATABASE_CONNECTION_LIMIT',
      overrides.connectionLimit ?? policy.connectionLimit.default,
      policy.connectionLimit,
    ),
    poolTimeoutSeconds: requireBoundedInteger(
      'DATABASE_POOL_TIMEOUT_SECONDS',
      overrides.poolTimeoutSeconds ?? policy.poolTimeoutSeconds.default,
      policy.poolTimeoutSeconds,
    ),
    connectTimeoutSeconds: requireBoundedInteger(
      'DATABASE_CONNECT_TIMEOUT_SECONDS',
      overrides.connectTimeoutSeconds ?? policy.connectTimeoutSeconds.default,
      policy.connectTimeoutSeconds,
    ),
  });
}

export function assertRawDatabaseUrlPolicy(
  databaseUrl: unknown,
  environment: DatabaseDeploymentEnvironment,
): void {
  const parsed = parsePostgresqlUrl(databaseUrl);

  for (const [name] of parsed.searchParams) {
    const normalizedName = name.toLowerCase();
    if (
      APPLICATION_MANAGED_DATABASE_PARAMETERS.includes(
        normalizedName as (typeof APPLICATION_MANAGED_DATABASE_PARAMETERS)[number],
      )
    ) {
      throw new DatabaseRuntimePolicyError(
        `DATABASE_URL must not include application-managed parameter ${normalizedName}`,
      );
    }
  }

  const sslModeEntries = [...parsed.searchParams.entries()].filter(
    ([name]) => name.toLowerCase() === 'sslmode',
  );
  if (sslModeEntries.length > 1) {
    throw new DatabaseRuntimePolicyError(
      'DATABASE_URL must not include duplicate sslmode parameters',
    );
  }
  if (
    sslModeEntries.length === 1 &&
    (sslModeEntries[0][0] !== 'sslmode' ||
      !PRISMA_SUPPORTED_POSTGRESQL_SSLMODES.includes(
        sslModeEntries[0][1] as (typeof PRISMA_SUPPORTED_POSTGRESQL_SSLMODES)[number],
      ))
  ) {
    throw new DatabaseRuntimePolicyError(
      'DATABASE_URL contains an unsupported sslmode',
    );
  }

  if (environment === 'staging' || environment === 'production') {
    if (sslModeEntries.length !== 1 || sslModeEntries[0][1] !== 'require') {
      throw new DatabaseRuntimePolicyError(
        'DATABASE_URL must define exactly one sslmode=require for staging and production',
      );
    }
  }
}

export function buildPrismaPostgresqlDatasourceUrl(
  input: BuildPrismaDatasourceUrlInput,
): string {
  const parsed = parsePostgresqlUrl(input.databaseUrl);
  assertRawDatabaseUrlPolicy(input.databaseUrl, 'development');
  const settings = resolveDatabaseRuntimeSettings(input.role, input);
  const policy = DATABASE_RUNTIME_POLICY[settings.role];

  parsed.searchParams.set('connection_limit', String(settings.connectionLimit));
  parsed.searchParams.set('pool_timeout', String(settings.poolTimeoutSeconds));
  parsed.searchParams.set(
    'connect_timeout',
    String(settings.connectTimeoutSeconds),
  );
  parsed.searchParams.set('application_name', policy.applicationName);

  return parsed.toString();
}

function parsePostgresqlUrl(databaseUrl: unknown): URL {
  if (typeof databaseUrl !== 'string' || databaseUrl.trim().length === 0) {
    throw new DatabaseRuntimePolicyError(
      'DATABASE_URL must be a valid PostgreSQL URL',
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new DatabaseRuntimePolicyError(
      'DATABASE_URL must be a valid PostgreSQL URL',
    );
  }

  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new DatabaseRuntimePolicyError(
      'DATABASE_URL must use the postgresql or postgres protocol',
    );
  }

  assertRequiredDatabaseUrlComponents(parsed);

  return parsed;
}

function assertRequiredDatabaseUrlComponents(parsed: URL): void {
  const hasRequiredComponents =
    parsed.username.length > 0 &&
    parsed.password.length > 0 &&
    parsed.hostname.length > 0 &&
    parsed.pathname.length > 1;

  if (!hasRequiredComponents) {
    throw new DatabaseRuntimePolicyError(
      'DATABASE_URL is missing a required connection component',
    );
  }
}

function requireBoundedInteger(
  field: string,
  value: number,
  bound: DatabaseRuntimeIntegerBound,
): number {
  if (
    !Number.isInteger(value) ||
    value < bound.minimum ||
    value > bound.maximum
  ) {
    throw new DatabaseRuntimePolicyError(
      `${field} must be a bounded positive integer`,
    );
  }
  return value;
}

assertDatabaseConnectionBudget();
