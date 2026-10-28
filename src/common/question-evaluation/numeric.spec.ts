import {
  evaluateNumeric,
  normalizeNumericAnswer,
  normalizeNumericDefinition,
  normalizeNumericKey,
  parseExactDecimal,
} from './index';
const definition = {
  definitionVersion: 1,
  kind: 'numeric',
  units: { required: false, allowedCodes: ['m', 'cm'], allowUnitless: true },
};
const reference = (value: string, unitCode: string | null = null) => ({
  value,
  unitCode,
});
function compare(
  answer: string,
  expected: string,
  policy?: unknown,
  answerUnit: string | null = null,
  referenceUnit: string | null = null,
) {
  return evaluateNumeric(
    definition,
    {
      state: 'configured',
      key: {
        keyVersion: 1,
        kind: 'numeric',
        reference: reference(expected, referenceUnit),
        ...(policy === undefined ? {} : { policy }),
      },
    },
    reference(answer, answerUnit),
  );
}
const exact = { policyVersion: 1, mode: 'EXACT' };
describe('ST10-A exact numeric safety', () => {
  it.each(['12.500', '+١٢٫٥٠٠', '۱۲٫۵۰۰', '125e-1', '0.125E+2'])(
    'normalizes %s without losing precision',
    (value) => {
      expect(parseExactDecimal(value)).toEqual({
        coefficient: 125n,
        exponent: -1,
      });
      expect(compare(value, '12.5', exact)).toBe('PROVED_EQUIVALENT');
    },
  );
  it('canonicalizes negative zero, preserves beyond-double precision and tiny differences', () => {
    expect(parseExactDecimal('-٠٫٠e+100')).toEqual({
      coefficient: 0n,
      exponent: 0,
    });
    expect(compare('9007199254740993', '9007199254740992', exact)).toBe(
      'PROVED_DIFFERENT',
    );
    expect(compare('1.000000000000000000000000000000001', '1', exact)).toBe(
      'PROVED_DIFFERENT',
    );
    expect(compare('1e-100', '0', exact)).toBe('PROVED_DIFFERENT');
  });
  it('round trips exponent extremes and all allowed significant digits', () => {
    for (const value of [
      '1234567890123456789012345678901234',
      '1e100',
      '1.23e-100',
      '1000e100',
      '0.' + '0'.repeat(55) + '1e-100',
    ]) {
      const normalized = normalizeNumericAnswer(
        definition,
        reference(value),
        'final',
        true,
      );
      expect(
        normalizeNumericAnswer(definition, normalized, 'final', true),
      ).toEqual(normalized);
      expect(compare(value, value, exact)).toBe('PROVED_EQUIVALENT');
    }
  });
  it.each([
    '',
    ' ',
    ' 1',
    '1 ',
    'NaN',
    'Infinity',
    '1,000',
    '١٬٠٠٠',
    '1.2.3',
    '.5',
    '1.',
    '0x10',
    '1_000',
    '1e',
    '1e101',
    '1e-101',
    '−1',
    '１',
    '⅓',
    '1\u200b',
    '9'.repeat(35),
    '1'.repeat(65),
  ])('rejects malformed or out-of-bound %s', (value) =>
    expect(() => parseExactDecimal(value)).toThrow(),
  );
  it('does not coerce numbers, boxed values or custom numeric objects', () => {
    const callback = jest.fn(() => '1');
    for (const value of [
      1,
      new Number(1),
      { toString: callback, valueOf: callback, toJSON: callback },
      null,
      1n,
    ])
      expect(() => parseExactDecimal(value)).toThrow();
    expect(callback).not.toHaveBeenCalled();
  });
  it('bounds exponent magnitude while accepting bounded zero padding', () => {
    expect(parseExactDecimal('1e0001')).toEqual({
      coefficient: 1n,
      exponent: 1,
    });
    expect(parseExactDecimal('1e-' + '0'.repeat(50) + '100')).toEqual({
      coefficient: 1n,
      exponent: -100,
    });
    expect(() => parseExactDecimal('1e' + '9'.repeat(60))).toThrow();
  });
  it('uses explicit exact policies with inclusive absolute and relative boundaries', () => {
    const absolute = {
      policyVersion: 1,
      mode: 'ABSOLUTE_TOLERANCE',
      tolerance: '0.1',
    };
    expect(compare('0.3', '0.2', absolute)).toBe('PROVED_EQUIVALENT');
    expect(
      compare('0.300000000000000000000000000000001', '0.2', absolute),
    ).toBe('PROVED_DIFFERENT');
    const relative = {
      policyVersion: 1,
      mode: 'RELATIVE_TOLERANCE',
      relativeTolerance: '0.01',
    };
    expect(compare('-101', '-100', relative)).toBe('PROVED_EQUIVALENT');
    expect(compare('-101.00000000000000000000001', '-100', relative)).toBe(
      'PROVED_DIFFERENT',
    );
    expect(compare('999', '1')).toBe('UNKNOWN_REQUIRES_MANUAL_REVIEW');
    for (const policy of [
      { ...absolute, tolerance: '-0.1' },
      { ...relative, relativeTolerance: '-1' },
      { mode: 'EXACT' },
      { ...exact, epsilon: '0.1' },
      { ...exact, policyVersion: 2 },
      null,
    ])
      expect(() => compare('1', '1', policy)).toThrow();
    expect(() => compare('0', '0', relative)).toThrow();
  });
  it('validates nonempty exact intervals and endpoint inclusivity', () => {
    const range = {
      policyVersion: 1,
      mode: 'EXPLICIT_ACCEPTED_RANGE',
      lower: '1',
      upper: '2',
      includeLower: false,
      includeUpper: true,
    };
    expect(compare('1', '999', range)).toBe('PROVED_DIFFERENT');
    expect(compare('2', '999', range)).toBe('PROVED_EQUIVALENT');
    expect(compare('1.5', '999', range)).toBe('PROVED_EQUIVALENT');
    expect(
      compare('1', '999', { ...range, upper: '1', includeLower: true }),
    ).toBe('PROVED_EQUIVALENT');
    for (const policy of [
      { ...range, lower: '3' },
      { ...range, upper: '1' },
      { ...range, includeUpper: null },
    ])
      expect(() => compare('1', '1', policy)).toThrow();
  });
  it('does not infer conversions or dimensions and rejects undeclared units', () => {
    expect(compare('100', '1', exact, 'cm', 'm')).toBe(
      'UNKNOWN_REQUIRES_MANUAL_REVIEW',
    );
    expect(compare('1', '1', exact, 'm', 'm')).toBe('PROVED_EQUIVALENT');
    expect(compare('1', '1', exact, 'kg', 'm')).toBe('INVALID_INPUT');
    expect(() =>
      normalizeNumericKey(definition, {
        keyVersion: 1,
        kind: 'numeric',
        reference: reference('1', 'kg'),
      }),
    ).toThrow();
    const required = {
      ...definition,
      units: { required: true, allowedCodes: ['m'], allowUnitless: false },
    };
    expect(() =>
      normalizeNumericAnswer(required, reference('1'), 'final', false),
    ).toThrow();
    expect(() =>
      normalizeNumericDefinition(
        { ...required, units: { ...required.units, allowedCodes: [] } },
        'complete',
      ),
    ).toThrow();
  });
  it('separates incomplete drafts, optional absence and invalid supplied final shapes', () => {
    expect(
      normalizeNumericAnswer(definition, { value: '1' }, 'draft', true),
    ).toEqual({ value: '1' });
    expect(normalizeNumericAnswer(definition, null, 'final', false)).toBeNull();
    for (const value of [
      { value: '1' },
      { unitCode: null },
      {},
      { value: '1', unitCode: null, reference: '1' },
    ])
      expect(() =>
        normalizeNumericAnswer(definition, value, 'final', false),
      ).toThrow();
  });
});
