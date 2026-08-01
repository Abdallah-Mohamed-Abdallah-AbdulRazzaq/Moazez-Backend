import { HealthService } from './health.service';
import { APPLICATION_VERSION } from '../../bootstrap/application-metadata';

describe('HealthService', () => {
  it('returns the exact approved public field allowlist', () => {
    const report = new HealthService().check();

    expect(Object.keys(report).sort()).toEqual([
      'status',
      'timestamp',
      'version',
    ]);
    expect(report).toEqual({
      status: 'ok',
      version: APPLICATION_VERSION,
      timestamp: expect.any(String),
    });
    expect(new Date(report.timestamp).toISOString()).toBe(report.timestamp);
  });

  it('never exposes dependency or topology fields', () => {
    const serialized = JSON.stringify(new HealthService().check());

    for (const forbidden of [
      'checks',
      'database',
      'redis',
      'storage',
      'queue',
      'email',
      'push',
      'provider',
      'topology',
    ]) {
      expect(serialized.toLowerCase()).not.toContain(forbidden);
    }
  });
});
