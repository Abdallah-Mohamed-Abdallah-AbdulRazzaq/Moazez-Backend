import { assertDisposablePostgresTarget } from '../../test/helpers/disposable-postgres-target';

const ERROR_MESSAGE = 'Disposable PostgreSQL target is required';
const LOCAL_DATABASE_PATTERN = /^moazez_test(?:_[a-z0-9_-]+)?$/u;

function assertTarget(input: {
  databaseUrl?: string;
  nodeEnv?: string;
  marker?: string;
}): void {
  assertDisposablePostgresTarget({
    databaseUrl: input.databaseUrl,
    nodeEnv: input.nodeEnv ?? 'test',
    universalRegressionMarker: input.marker,
    localDatabasePredicate: (databaseName) =>
      LOCAL_DATABASE_PATTERN.test(databaseName),
    errorMessage: ERROR_MESSAGE,
  });
}

function expectRejected(input: Parameters<typeof assertTarget>[0]): void {
  expect(() => assertTarget(input)).toThrow(ERROR_MESSAGE);
}

describe('assertDisposablePostgresTarget', () => {
  it.each([
    'postgresql://test:test@localhost:5432/moazez_test',
    'postgresql://test:test@127.0.0.1:5432/moazez_test_feature',
  ])('accepts an approved loopback disposable database: %s', (databaseUrl) => {
    expect(() => assertTarget({ databaseUrl })).not.toThrow();
  });

  it('accepts the exact canonical universal-regression database identity', () => {
    expect(() =>
      assertTarget({
        databaseUrl:
          'postgresql://g07_ci:secret@g07-abc-123-postgres:5432/g07_0123456789abcdefabcd',
        marker: '1',
      }),
    ).not.toThrow();
  });

  it.each([
    {
      name: 'G07-looking host without marker',
      databaseUrl:
        'postgresql://g07_ci:secret@g07-abc-123-postgres:5432/g07_0123456789abcdefabcd',
    },
    {
      name: 'marker with arbitrary host',
      databaseUrl:
        'postgresql://g07_ci:secret@arbitrary.internal:5432/g07_0123456789abcdefabcd',
      marker: '1',
    },
    {
      name: 'marker with production-like host',
      databaseUrl:
        'postgresql://g07_ci:secret@production-postgres:5432/g07_0123456789abcdefabcd',
      marker: '1',
    },
    {
      name: 'wrong database name',
      databaseUrl:
        'postgresql://g07_ci:secret@g07-abc-123-postgres:5432/production',
      marker: '1',
    },
    {
      name: 'wrong database user',
      databaseUrl:
        'postgresql://postgres:secret@g07-abc-123-postgres:5432/g07_0123456789abcdefabcd',
      marker: '1',
    },
    {
      name: 'wrong database port',
      databaseUrl:
        'postgresql://g07_ci:secret@g07-abc-123-postgres:5433/g07_0123456789abcdefabcd',
      marker: '1',
    },
    {
      name: 'non-test environment',
      databaseUrl:
        'postgresql://g07_ci:secret@g07-abc-123-postgres:5432/g07_0123456789abcdefabcd',
      marker: '1',
      nodeEnv: 'production',
    },
    {
      name: 'non-PostgreSQL protocol',
      databaseUrl: 'mysql://test:test@localhost:5432/moazez_test',
    },
    {
      name: 'remote PostgreSQL URL',
      databaseUrl: 'postgresql://test:test@db.example.com:5432/moazez_test',
    },
    { name: 'malformed URL', databaseUrl: 'not-a-url' },
    { name: 'empty DATABASE_URL', databaseUrl: '' },
  ])('rejects $name', ({ name: _name, ...input }) => {
    void _name;
    expectRejected(input);
  });
});
