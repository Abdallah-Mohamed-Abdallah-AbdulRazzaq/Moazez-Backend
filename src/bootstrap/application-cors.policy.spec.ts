import {
  applicationCorsOriginDelegate,
  APPROVED_PRODUCTION_APPLICATION_ORIGINS,
  APPROVED_STAGING_APPLICATION_ORIGINS,
  configureApplicationCorsOrigins,
  isApplicationOriginAllowed,
  parseApplicationCorsOrigins,
} from './application-cors.policy';

describe('application CORS policy', () => {
  afterEach(() => configureApplicationCorsOrigins([]));

  it('accepts the exact production set in either order', () => {
    expect(
      parseApplicationCorsOrigins(
        'production',
        [...APPROVED_PRODUCTION_APPLICATION_ORIGINS].reverse().join(','),
      ),
    ).toEqual([...APPROVED_PRODUCTION_APPLICATION_ORIGINS].reverse());
  });

  it('accepts the exact staging set in either order', () => {
    expect(
      parseApplicationCorsOrigins(
        'staging',
        APPROVED_STAGING_APPLICATION_ORIGINS.join(','),
      ),
    ).toEqual(APPROVED_STAGING_APPLICATION_ORIGINS);
  });

  it.each([
    ['production', undefined],
    ['staging', undefined],
    ['production', 'https://schools.moazez.cloud'],
    [
      'production',
      'https://schools.moazez.cloud,https://admin.moazez.cloud,https://extra.moazez.cloud',
    ],
    ['production', 'https://schools.moazez.cloud,https://schools.moazez.cloud'],
    [
      'production',
      'https://staging-schools.moazez.cloud,https://staging-admin.moazez.cloud',
    ],
  ] as const)('rejects an invalid %s origin set', (environment, origins) => {
    expect(() => parseApplicationCorsOrigins(environment, origins)).toThrow();
  });

  it.each([
    '*',
    'null',
    'https://user:password@example.test',
    'https://example.test/path',
    'https://example.test?query=1',
    'https://example.test#fragment',
    'ftp://example.test',
    'not a URL',
    'http://example.test',
    'http://localhost:3001,',
  ])('rejects malformed or unsafe origin %s', (origin) => {
    expect(() => parseApplicationCorsOrigins('test', origin)).toThrow();
  });

  it('permits explicit localhost HTTP origins for development and test', () => {
    expect(
      parseApplicationCorsOrigins(
        'development',
        'http://localhost:3001,http://127.0.0.1:4200,http://[::1]:5173',
      ),
    ).toEqual([
      'http://localhost:3001',
      'http://127.0.0.1:4200',
      'http://[::1]:5173',
    ]);
  });

  it('allows non-browser requests without Origin and only configured browser origins', () => {
    expect(isApplicationOriginAllowed(undefined, [])).toBe(true);
    expect(
      isApplicationOriginAllowed('http://localhost:3001', [
        'http://localhost:3001',
      ]),
    ).toBe(true);
    expect(
      isApplicationOriginAllowed('http://localhost:3002', [
        'http://localhost:3001',
      ]),
    ).toBe(false);
  });

  it('provides one shared decision delegate for HTTP and Socket.IO', () => {
    configureApplicationCorsOrigins(['http://localhost:3001']);
    const allowed = jest.fn();
    const denied = jest.fn();
    const noOrigin = jest.fn();

    applicationCorsOriginDelegate('http://localhost:3001', allowed);
    applicationCorsOriginDelegate('http://localhost:3002', denied);
    applicationCorsOriginDelegate(undefined, noOrigin);

    expect(allowed).toHaveBeenCalledWith(null, true);
    expect(denied).toHaveBeenCalledWith(null, false);
    expect(noOrigin).toHaveBeenCalledWith(null, true);
  });
});
