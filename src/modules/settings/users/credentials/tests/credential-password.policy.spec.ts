import {
  generateTemporaryPassword,
  validateAdminProvidedPassword,
} from '../domain/credential-password.policy';

describe('credential password policy', () => {
  it('accepts a strong admin-provided password', () => {
    expect(validateAdminProvidedPassword('StrongPass123!')).toEqual({
      valid: true,
      reasons: [],
    });
  });

  it('rejects weak or obvious passwords', () => {
    expect(validateAdminProvidedPassword('short1!A').reasons).toContain(
      'password_too_short',
    );
    expect(validateAdminProvidedPassword('alllowercase123!').reasons).toContain(
      'password_missing_uppercase',
    );
    expect(validateAdminProvidedPassword('ALLUPPERCASE123!').reasons).toContain(
      'password_missing_lowercase',
    );
    expect(validateAdminProvidedPassword('NoNumbersHere!').reasons).toContain(
      'password_missing_number',
    );
    expect(validateAdminProvidedPassword('NoSymbolsHere123').reasons).toContain(
      'password_missing_symbol',
    );
    expect(validateAdminProvidedPassword('password123!').reasons).toContain(
      'password_common',
    );
    expect(validateAdminProvidedPassword('   ').reasons).toContain(
      'password_required',
    );
  });

  it('generates readable non-deterministic temporary passwords', () => {
    const generated = new Set(
      Array.from({ length: 10 }, () => generateTemporaryPassword()),
    );

    expect(generated.size).toBeGreaterThan(1);
    for (const password of generated) {
      expect(password).toMatch(
        /^MZ-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/,
      );
    }
  });
});
