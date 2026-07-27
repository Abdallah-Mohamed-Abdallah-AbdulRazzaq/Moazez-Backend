import {
  BOOTSTRAP_FAILURE_EVENT,
  handleBootstrapFailure,
} from './bootstrap-failure';

describe('bootstrap failure handling', () => {
  it.each([
    new Error('postgresql://db-user:db-password@db.internal/production'),
    new Error('redis://redis-user:redis-password@redis.internal:6379'),
    new Error('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEifQ.signature-value'),
    new Error(
      '-----BEGIN PRIVATE KEY-----\nprivate-material\n-----END PRIVATE KEY-----',
    ),
    new Error('first line\nsecond line\nthird line'),
    {
      message: 'arbitrary-secret-payload',
      nested: { token: 'must-not-serialize' },
    },
  ])('emits only a bounded generic event for %#', (thrown) => {
    const log = jest.fn();
    const processTarget: { exitCode?: string | number | null } = {};

    handleBootstrapFailure(thrown, { log, processTarget });

    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(BOOTSTRAP_FAILURE_EVENT);
    expect(log.mock.calls.flat().join(' ')).toBe(
      'Application bootstrap failed',
    );
    expect(processTarget.exitCode).toBe(1);
  });
});
