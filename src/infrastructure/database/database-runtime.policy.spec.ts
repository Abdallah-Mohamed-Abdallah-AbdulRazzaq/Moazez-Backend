import { ConfigService } from '@nestjs/config';
import {
  APPLICATION_MANAGED_DATABASE_PARAMETERS,
  APPROVED_MAX_INSTANCES_SCOPE,
  assertRawDatabaseUrlPolicy,
  buildPrismaPostgresqlDatasourceUrl,
  calculateDatabaseConnectionBudget,
  DATABASE_CONNECTION_BUDGET_POLICY,
  DATABASE_RUNTIME_POLICY,
  DATABASE_RUNTIME_ROLES,
  PRISMA_SUPPORTED_POSTGRESQL_SSLMODES,
  resolveDatabaseRuntimeSettings,
  type DatabaseRuntimeRole,
} from './database-runtime.policy';
import { createPrismaClientOptions } from './prisma-client-options.provider';

describe('database runtime policy', () => {
  it('exports only the three database-owning runtime roles', () => {
    expect(DATABASE_RUNTIME_ROLES).toEqual([
      'api',
      'core-worker',
      'media-worker',
    ]);
  });

  it('keeps the exact immutable role defaults and hard maxima', () => {
    expect(DATABASE_RUNTIME_POLICY).toEqual({
      api: {
        applicationName: 'moazez-api',
        maxInstances: 4,
        instanceLimitScope: 'service-aggregate-across-active-revisions',
        fullCapRevisionOverlapAllowed: false,
        connectionLimit: { default: 5, minimum: 1, maximum: 5 },
        poolTimeoutSeconds: { default: 5, minimum: 1, maximum: 5 },
        connectTimeoutSeconds: { default: 5, minimum: 1, maximum: 5 },
      },
      'core-worker': {
        applicationName: 'moazez-core-worker',
        maxInstances: 2,
        instanceLimitScope: 'service-aggregate-across-active-revisions',
        fullCapRevisionOverlapAllowed: false,
        connectionLimit: { default: 6, minimum: 1, maximum: 6 },
        poolTimeoutSeconds: { default: 10, minimum: 1, maximum: 10 },
        connectTimeoutSeconds: { default: 5, minimum: 1, maximum: 5 },
      },
      'media-worker': {
        applicationName: 'moazez-media-worker',
        maxInstances: 2,
        instanceLimitScope: 'service-aggregate-across-active-revisions',
        fullCapRevisionOverlapAllowed: false,
        connectionLimit: { default: 3, minimum: 1, maximum: 3 },
        poolTimeoutSeconds: { default: 10, minimum: 1, maximum: 10 },
        connectTimeoutSeconds: { default: 5, minimum: 1, maximum: 5 },
      },
    });
    expect(Object.isFrozen(DATABASE_RUNTIME_POLICY)).toBe(true);
    expect(Object.isFrozen(DATABASE_RUNTIME_POLICY.api)).toBe(true);
    expect(Object.isFrozen(DATABASE_RUNTIME_POLICY.api.connectionLimit)).toBe(
      true,
    );
  });

  it('scopes every approved instance maximum across all active revisions', () => {
    expect(APPROVED_MAX_INSTANCES_SCOPE).toBe(
      'service-aggregate-across-active-revisions',
    );

    const rolloutRevisionLimits = {
      api: [3, 1],
      'core-worker': [1, 1],
      'media-worker': [1, 1],
    } as const;

    for (const role of DATABASE_RUNTIME_ROLES) {
      const policy = DATABASE_RUNTIME_POLICY[role];
      const aggregateLimit = rolloutRevisionLimits[role].reduce(
        (total, revisionLimit) => total + revisionLimit,
        0,
      );
      expect(policy.instanceLimitScope).toBe(APPROVED_MAX_INSTANCES_SCOPE);
      expect(policy.fullCapRevisionOverlapAllowed).toBe(false);
      expect(aggregateLimit).toBeLessThanOrEqual(policy.maxInstances);
      const twoFullCapRevisions = [policy.maxInstances, policy.maxInstances];
      expect(
        twoFullCapRevisions.reduce(
          (total, revisionLimit) => total + revisionLimit,
          0,
        ),
      ).toBeGreaterThan(policy.maxInstances);
    }

    expect(
      DATABASE_CONNECTION_BUDGET_POLICY.failoverEmergencyReserveMayFundRevisionOverlap,
    ).toBe(false);
    expect(Object.isFrozen(DATABASE_CONNECTION_BUDGET_POLICY)).toBe(true);
  });

  it('calculates the governed connection budget exactly', () => {
    const budget = calculateDatabaseConnectionBudget();
    expect(budget.roleConnections).toEqual({
      api: 4 * 5,
      'core-worker': 2 * 6,
      'media-worker': 2 * 3,
    });
    expect(budget.runtimeConnections).toBe(38);
    expect(budget.migrationConnections).toBe(1 * 2);
    expect(budget.operationsReserveConnections).toBe(10);
    expect(budget.applicationAndOperationsAllocation).toBe(50);
    expect(budget.failoverEmergencyReserveConnections).toBe(50);
    expect(budget.governedTotalConnections).toBe(100);
    expect(DATABASE_CONNECTION_BUDGET_POLICY).toMatchObject({
      applicationAndOperationsAllocation: 50,
      governedTotalConnections: 100,
    });
  });

  it('accepts lower bounded role overrides', () => {
    expect(
      resolveDatabaseRuntimeSettings('core-worker', {
        connectionLimit: 2,
        poolTimeoutSeconds: 3,
        connectTimeoutSeconds: 2,
      }),
    ).toEqual({
      role: 'core-worker',
      connectionLimit: 2,
      poolTimeoutSeconds: 3,
      connectTimeoutSeconds: 2,
    });
  });

  it.each([0, -1, 1.5, 7])(
    'rejects an invalid Core Worker connection limit: %s',
    (connectionLimit) => {
      expect(() =>
        resolveDatabaseRuntimeSettings('core-worker', { connectionLimit }),
      ).toThrow(/DATABASE_CONNECTION_LIMIT/u);
    },
  );

  it.each([0, -1, 1.5, 11])(
    'rejects an invalid Core Worker pool timeout: %s',
    (poolTimeoutSeconds) => {
      expect(() =>
        resolveDatabaseRuntimeSettings('core-worker', {
          poolTimeoutSeconds,
        }),
      ).toThrow(/DATABASE_POOL_TIMEOUT_SECONDS/u);
    },
  );

  it.each([0, -1, 1.5, 6])(
    'rejects an invalid connect timeout: %s',
    (connectTimeoutSeconds) => {
      expect(() =>
        resolveDatabaseRuntimeSettings('media-worker', {
          connectTimeoutSeconds,
        }),
      ).toThrow(/DATABASE_CONNECT_TIMEOUT_SECONDS/u);
    },
  );

  it('rejects an unsupported runtime role', () => {
    expect(() =>
      resolveDatabaseRuntimeSettings(
        'maintenance-scheduler' as DatabaseRuntimeRole,
      ),
    ).toThrow(/DATABASE_RUNTIME_ROLE/u);
  });

  it.each([
    ['api', 'moazez-api', 5, 5, 5],
    ['core-worker', 'moazez-core-worker', 6, 10, 5],
    ['media-worker', 'moazez-media-worker', 3, 10, 5],
  ] as const)(
    'constructs a bounded PostgreSQL URL for %s',
    (role, applicationName, connectionLimit, poolTimeout, connectTimeout) => {
      const result = new URL(
        buildPrismaPostgresqlDatasourceUrl({
          databaseUrl:
            'postgresql://runtime-user:runtime-value@database.internal:5432/moazez?schema=tenant&sslmode=require&sslaccept=strict',
          ...resolveDatabaseRuntimeSettings(role),
        }),
      );

      expect(result.protocol).toBe('postgresql:');
      expect(result.username).toBe('runtime-user');
      expect(result.hostname).toBe('database.internal');
      expect(result.pathname).toBe('/moazez');
      expect(result.searchParams.get('schema')).toBe('tenant');
      expect(result.searchParams.get('sslmode')).toBe('require');
      expect(result.searchParams.get('sslaccept')).toBe('strict');
      expect(result.searchParams.get('connection_limit')).toBe(
        String(connectionLimit),
      );
      expect(result.searchParams.get('pool_timeout')).toBe(String(poolTimeout));
      expect(result.searchParams.get('connect_timeout')).toBe(
        String(connectTimeout),
      );
      expect(result.searchParams.get('application_name')).toBe(applicationName);
    },
  );

  it('preserves schema and every Prisma-supported SSL parameter while applying lower overrides', () => {
    const databaseUrl =
      'postgres://runtime-user:runtime-value@database.internal/moazez?schema=school&sslmode=require&sslcert=%2Fcerts%2Fclient.pem&sslrootcert=%2Fcerts%2Froot.pem&sslidentity=%2Fcerts%2Fclient.p12&sslpassword=fixture-passphrase&sslaccept=strict';
    expect(() =>
      assertRawDatabaseUrlPolicy(databaseUrl, 'production'),
    ).not.toThrow();

    const result = new URL(
      buildPrismaPostgresqlDatasourceUrl({
        databaseUrl,
        role: 'media-worker',
        connectionLimit: 1,
        poolTimeoutSeconds: 4,
        connectTimeoutSeconds: 2,
      }),
    );

    expect(result.protocol).toBe('postgres:');
    expect(result.searchParams.get('schema')).toBe('school');
    expect(result.searchParams.get('sslmode')).toBe('require');
    expect(result.searchParams.get('sslcert')).toBe('/certs/client.pem');
    expect(result.searchParams.get('sslrootcert')).toBe('/certs/root.pem');
    expect(result.searchParams.get('sslidentity')).toBe('/certs/client.p12');
    expect(result.searchParams.get('sslpassword')).toBe('fixture-passphrase');
    expect(result.searchParams.get('sslaccept')).toBe('strict');
    expect(result.searchParams.get('connection_limit')).toBe('1');
    expect(result.searchParams.get('pool_timeout')).toBe('4');
    expect(result.searchParams.get('connect_timeout')).toBe('2');
  });

  it.each(['https:', 'mysql:', 'file:'])(
    'rejects the non-PostgreSQL protocol %s',
    (protocol) => {
      expect(() =>
        buildPrismaPostgresqlDatasourceUrl({
          databaseUrl: `${protocol}//runtime-user:runtime-value@database.internal/moazez`,
          ...resolveDatabaseRuntimeSettings('api'),
        }),
      ).toThrow(/DATABASE_URL/u);
    },
  );

  it.each(APPLICATION_MANAGED_DATABASE_PARAMETERS)(
    'rejects raw DATABASE_URL parameter %s',
    (parameter) => {
      expect(() =>
        buildPrismaPostgresqlDatasourceUrl({
          databaseUrl: `postgresql://runtime-user:runtime-value@database.internal/moazez?${parameter}=1`,
          ...resolveDatabaseRuntimeSettings('api'),
        }),
      ).toThrow(new RegExp(parameter, 'u'));
    },
  );

  it('exports only Prisma 6 PostgreSQL sslmode values', () => {
    expect(PRISMA_SUPPORTED_POSTGRESQL_SSLMODES).toEqual([
      'prefer',
      'disable',
      'require',
    ]);
  });

  it.each([
    'postgresql://runtime-user:runtime-value@database.internal/moazez?sslmode=require',
    'postgresql://runtime-user:runtime-value@database.internal/moazez?sslmode=require&sslaccept=strict',
  ])('accepts the exact production TLS policy: %s', (databaseUrl) => {
    expect(() =>
      assertRawDatabaseUrlPolicy(databaseUrl, 'production'),
    ).not.toThrow();
  });

  it.each([
    [
      'missing sslmode',
      'postgresql://runtime-user:runtime-value@database.internal/moazez',
    ],
    [
      'prefer',
      'postgresql://runtime-user:runtime-value@database.internal/moazez?sslmode=prefer',
    ],
    [
      'disable',
      'postgresql://runtime-user:runtime-value@database.internal/moazez?sslmode=disable',
    ],
    [
      'verify-ca',
      'postgresql://runtime-user:runtime-value@database.internal/moazez?sslmode=verify-ca',
    ],
    [
      'verify-full',
      'postgresql://runtime-user:runtime-value@database.internal/moazez?sslmode=verify-full',
    ],
    [
      'unknown',
      'postgresql://runtime-user:runtime-value@database.internal/moazez?sslmode=unknown',
    ],
    [
      'duplicate',
      'postgresql://runtime-user:runtime-value@database.internal/moazez?sslmode=require&sslmode=require',
    ],
  ] as const)('rejects production TLS configuration %s', (_, databaseUrl) => {
    expect(() => assertRawDatabaseUrlPolicy(databaseUrl, 'production')).toThrow(
      /DATABASE_URL.*sslmode|sslmode.*DATABASE_URL/su,
    );
  });

  it('keeps development and test TLS-optional but rejects unsupported supplied modes', () => {
    const databaseUrl =
      'postgresql://runtime-user:runtime-value@database.internal/moazez';
    expect(() =>
      assertRawDatabaseUrlPolicy(databaseUrl, 'development'),
    ).not.toThrow();
    expect(() => assertRawDatabaseUrlPolicy(databaseUrl, 'test')).not.toThrow();
    expect(() =>
      assertRawDatabaseUrlPolicy(`${databaseUrl}?sslmode=verify-full`, 'test'),
    ).toThrow(/sslmode/u);
  });

  it.each([
    ['postgresql:///database', ['database']],
    [
      'postgresql://component-user:component-value@/component-database',
      ['component-user', 'component-value', 'component-database'],
    ],
    [
      'postgresql://component-user:component-value@component-host.internal',
      ['component-user', 'component-value', 'component-host.internal'],
    ],
    [
      'postgresql://component-host.internal/component-database',
      ['component-host.internal', 'component-database'],
    ],
  ] as const)(
    'rejects incomplete PostgreSQL URL %s with a sanitized error',
    (databaseUrl, sensitiveComponents) => {
      let message = '';
      try {
        buildPrismaPostgresqlDatasourceUrl({
          databaseUrl,
          ...resolveDatabaseRuntimeSettings('api'),
        });
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }

      expect(message).toMatch(/DATABASE_URL/u);
      expect(message).not.toContain(databaseUrl);
      for (const sensitiveComponent of sensitiveComponents) {
        expect(message).not.toContain(sensitiveComponent);
      }
    },
  );

  it('keeps errors sanitized', () => {
    const sensitiveUrl =
      'postgresql://sensitive-user:sensitive-value@sensitive-db.example/moazez?connection_limit=99&opaque=sensitive-query';
    let message = '';
    try {
      assertRawDatabaseUrlPolicy(sensitiveUrl, 'production');
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toMatch(/DATABASE_URL/u);
    expect(message).not.toContain(sensitiveUrl);
    expect(message).not.toContain('sensitive-user');
    expect(message).not.toContain('sensitive-value');
    expect(message).not.toContain('sensitive-db.example');
    expect(message).not.toContain('sensitive-query');
  });

  it('creates Prisma client options from validated configuration', () => {
    const options = createPrismaClientOptions(
      new ConfigService({
        DATABASE_URL:
          'postgresql://runtime-user:runtime-value@database.internal/moazez?schema=public',
        DATABASE_RUNTIME_ROLE: 'core-worker',
        DATABASE_CONNECTION_LIMIT: 4,
        DATABASE_POOL_TIMEOUT_SECONDS: 8,
        DATABASE_CONNECT_TIMEOUT_SECONDS: 3,
      }),
    );
    const url = new URL(options.datasourceUrl as string);

    expect(url.searchParams.get('schema')).toBe('public');
    expect(url.searchParams.get('connection_limit')).toBe('4');
    expect(url.searchParams.get('pool_timeout')).toBe('8');
    expect(url.searchParams.get('connect_timeout')).toBe('3');
    expect(url.searchParams.get('application_name')).toBe('moazez-core-worker');
  });
});
