import type { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { Env } from '../config/env.validation';
import { TrustedClientIpResolver } from './trusted-client-ip.resolver';

describe('TrustedClientIpResolver', () => {
  const directIp = '127.0.0.1';

  it('uses the direct request IP in none mode', () => {
    expect(resolve('none', requestWith())).toBe(directIp);
  });

  it('ignores X-Moazez-Client-IP in none mode', () => {
    expect(
      resolve('none', requestWith(['X-Moazez-Client-IP', '203.0.113.10'])),
    ).toBe(directIp);
  });

  it('ignores X-Forwarded-For in none mode', () => {
    expect(
      resolve('none', requestWith(['X-Forwarded-For', '203.0.113.11'])),
    ).toBe(directIp);
  });

  it('accepts one valid IPv4 trusted header in gcp_external_alb mode', () => {
    expect(
      resolve(
        'gcp_external_alb',
        requestWith(['X-Moazez-Client-IP', '203.0.113.12']),
      ),
    ).toBe('203.0.113.12');
  });

  it('accepts one valid IPv6 trusted header in gcp_external_alb mode', () => {
    expect(
      resolve(
        'gcp_external_alb',
        requestWith(['X-Moazez-Client-IP', '2001:db8::12']),
      ),
    ).toBe('2001:db8::12');
  });

  it.each([
    ['a malformed value', '203.0.113.999'],
    ['a hostname', 'client.example.com'],
    ['an empty value', ''],
    ['a comma-separated value', '203.0.113.13, 198.51.100.13'],
  ])('falls back for %s', (_description, value) => {
    expect(
      resolve('gcp_external_alb', requestWith(['X-Moazez-Client-IP', value])),
    ).toBe(directIp);
  });

  it('falls back when the trusted header occurs more than once', () => {
    expect(
      resolve(
        'gcp_external_alb',
        requestWith([
          'X-Moazez-Client-IP',
          '203.0.113.14',
          'x-moazez-client-ip',
          '203.0.113.15',
        ]),
      ),
    ).toBe(directIp);
  });

  it('does not let X-Forwarded-For override an accepted trusted value', () => {
    expect(
      resolve(
        'gcp_external_alb',
        requestWith([
          'X-Forwarded-For',
          '198.51.100.16',
          'X-Moazez-Client-IP',
          '203.0.113.16',
        ]),
      ),
    ).toBe('203.0.113.16');
  });

  it('does not let X-Forwarded-For replace the fallback for an invalid trusted value', () => {
    expect(
      resolve(
        'gcp_external_alb',
        requestWith([
          'X-Moazez-Client-IP',
          'invalid',
          'X-Forwarded-For',
          '198.51.100.17',
        ]),
      ),
    ).toBe(directIp);
  });

  it('uses the direct request IP when the trusted header is absent', () => {
    expect(resolve('gcp_external_alb', requestWith())).toBe(directIp);
  });

  function resolve(
    mode: Env['APP_TRUSTED_PROXY_MODE'],
    request: Request,
  ): string | null {
    const config = {
      get: jest.fn().mockReturnValue(mode),
    } as unknown as ConfigService<Env, true>;

    return new TrustedClientIpResolver(config).resolve(request);
  }

  function requestWith(rawHeaders: string[] = []): Request {
    return {
      ip: directIp,
      rawHeaders,
    } as Request;
  }
});
