import {
  isTrustedCorrelationId,
  MAX_REQUEST_ID_LENGTH,
  resolveCorrelationId,
} from './correlation-id';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

describe('correlation ID policy', () => {
  it('preserves a valid caller-provided ID', () => {
    expect(resolveCorrelationId('Client.Request_1:attempt-2')).toBe(
      'Client.Request_1:attempt-2',
    );
  });

  it.each([
    'x'.repeat(MAX_REQUEST_ID_LENGTH + 1),
    'contains spaces',
    'contains\ttab',
    'contains\r\ninjection',
    'معرّف',
    'invalid/value',
    'invalid,value',
    '',
    undefined,
  ])('replaces the invalid or absent value %# with a UUID', (value) => {
    const resolved = resolveCorrelationId(value);
    expect(resolved).toMatch(UUID_PATTERN);
    expect(resolved).not.toBe(value);
  });

  it('uses only a valid first array value', () => {
    expect(resolveCorrelationId(['first-valid', 'ignored-valid'])).toBe(
      'first-valid',
    );
    expect(resolveCorrelationId(['invalid value', 'second-valid'])).toMatch(
      UUID_PATTERN,
    );
    expect(resolveCorrelationId([])).toMatch(UUID_PATTERN);
  });

  it('accepts exactly 128 allowlisted ASCII characters', () => {
    const value = 'A'.repeat(MAX_REQUEST_ID_LENGTH);
    expect(isTrustedCorrelationId(value)).toBe(true);
    expect(resolveCorrelationId(value)).toBe(value);
  });
});
