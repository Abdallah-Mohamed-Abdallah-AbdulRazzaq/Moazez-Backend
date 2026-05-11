import {
  buildLoginEmail,
  normalizeLoginDomain,
  normalizeUsername,
  validateLoginDomain,
  validateUsername,
} from '../domain/login-identity.policy';

describe('login identity policy', () => {
  it('normalizes usernames and builds generated login emails', () => {
    expect(normalizeUsername(' Ahmed.Ali ')).toBe('ahmed.ali');
    expect(buildLoginEmail(' Ahmed.Ali ', ' School-Name.SA ')).toBe(
      'ahmed.ali@school-name.sa',
    );
  });

  it('validates accepted username characters and length policy', () => {
    const result = validateUsername('teacher_01', {
      usernameMinLength: 3,
      usernameMaxLength: 40,
    });

    expect(result).toEqual({
      username: 'teacher_01',
      valid: true,
      reason: null,
    });
  });

  it('rejects reserved and unsafe usernames', () => {
    expect(validateUsername('admin').reason).toBe('reserved_username');
    expect(validateUsername('ahmed..ali').reason).toBe(
      'username_has_consecutive_dots',
    );
    expect(validateUsername('-ahmed').reason).toBe(
      'username_has_forbidden_edge_character',
    );
    expect(validateUsername('ahmed ali').reason).toBe(
      'username_contains_spaces',
    );
    expect(validateUsername('ahmed@ali').reason).toBe('username_contains_at');
  });

  it('combines custom reserved usernames with defaults', () => {
    const result = validateUsername('registrar', {
      reservedUsernames: ['Registrar'],
    });

    expect(result.reason).toBe('reserved_username');
  });

  it('normalizes and validates login domains', () => {
    expect(normalizeLoginDomain(' School-Name.SA ')).toBe('school-name.sa');
    expect(validateLoginDomain('school-name.sa')).toEqual({
      loginDomain: 'school-name.sa',
      valid: true,
      reason: null,
    });
  });

  it('rejects protocol, path, port, and non-domain login domains', () => {
    expect(validateLoginDomain('https://school.sa').reason).toBe(
      'login_domain_has_protocol',
    );
    expect(validateLoginDomain('school.sa/login').reason).toBe(
      'login_domain_has_path',
    );
    expect(validateLoginDomain('school.sa:3000').reason).toBe(
      'login_domain_has_port',
    );
    expect(validateLoginDomain('school').reason).toBe(
      'login_domain_invalid_format',
    );
  });
});
