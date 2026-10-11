import {
  applicationCorsOriginDelegate,
  APPROVED_PRODUCTION_APPLICATION_ORIGINS,
  APPROVED_STAGING_APPLICATION_ORIGINS,
  configureApplicationCorsOrigins,
  createApplicationCorsOptions,
  isApplicationOriginAllowed,
  parseApplicationCorsOrigins,
} from './application-cors.policy';

describe('application CORS policy', () => {
  afterEach(() => configureApplicationCorsOrigins([]));

  it('accepts the exact production set', () => {
    expect(
      parseApplicationCorsOrigins(
        'production',
        'https://schools.moazez.cloud,https://admin.moazez.cloud,https://student.moazez.cloud,https://teacher.moazez.cloud',
      ),
    ).toEqual(APPROVED_PRODUCTION_APPLICATION_ORIGINS);
  });

  it('accepts the exact production set in another order', () => {
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

  it.each(['student', 'teacher'])(
    'does not add the production %s origin to staging',
    (surface) => {
      expect(() =>
        parseApplicationCorsOrigins(
          'staging',
          `${APPROVED_STAGING_APPLICATION_ORIGINS.join(',')},https://${surface}.moazez.cloud`,
        ),
      ).toThrow(/approved staging origin set/u);
    },
  );

  it.each([
    ['production', undefined],
    ['staging', undefined],
    ['production', 'https://schools.moazez.cloud'],
    ['production', 'https://schools.moazez.cloud,https://admin.moazez.cloud'],
    ['production', 'https://schools.moazez.cloud,https://student.moazez.cloud'],
    [
      'production',
      'https://schools.moazez.cloud,https://admin.moazez.cloud,https://student.moazez.cloud',
    ],
    [
      'production',
      'https://schools.moazez.cloud,https://admin.moazez.cloud,https://student.moazez.cloud,https://teacher.moazez.cloud,https://extra.moazez.cloud',
    ],
    [
      'production',
      'https://schools.moazez.cloud,https://admin.moazez.cloud,https://student.moazez.cloud,https://teacher.moazez.cloud,https://student.moazez.cloud',
    ],
    ['production', '*'],
    ['production', 'null'],
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

  it.each(['student', 'teacher'])(
    'allows the production %s origin through the shared HTTP delegate',
    (surface) => {
      const options = createApplicationCorsOptions(
        parseApplicationCorsOrigins(
          'production',
          APPROVED_PRODUCTION_APPLICATION_ORIGINS.join(','),
        ),
      );
      const allowed = jest.fn();
      const denied = jest.fn();

      expect(options.origin).toBe(applicationCorsOriginDelegate);
      expect(options.credentials).toBe(true);
      applicationCorsOriginDelegate(`https://${surface}.moazez.cloud`, allowed);
      applicationCorsOriginDelegate('https://extra.moazez.cloud', denied);

      expect(allowed).toHaveBeenCalledWith(null, true);
      expect(denied).toHaveBeenCalledWith(null, false);
    },
  );

  it.each([
    '*',
    'null',
    'https://teacher.moazez.cloud/path',
    'https://teacher.moazez.cloud.evil.test',
    'http://teacher.moazez.cloud',
    'https://staging-teacher.moazez.cloud',
  ])('denies unauthorized production browser origin %s', (origin) => {
    createApplicationCorsOptions(APPROVED_PRODUCTION_APPLICATION_ORIGINS);
    const decision = jest.fn();
    applicationCorsOriginDelegate(origin, decision);
    expect(decision).toHaveBeenCalledWith(null, false);
  });
});
