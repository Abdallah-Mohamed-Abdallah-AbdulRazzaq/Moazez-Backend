import { invalid } from './contracts';

export interface ExactDecimal {
  readonly coefficient: bigint;
  readonly exponent: number;
}
export const DECIMAL_LIMITS = Object.freeze({
  input: 64,
  significantDigits: 34,
  exponent: 100,
});

export function parseExactDecimal(value: unknown): ExactDecimal {
  if (
    typeof value !== 'string' ||
    !value.length ||
    value.length > DECIMAL_LIMITS.input
  )
    invalid();
  const ascii = value.replace(/[٠-٩۰-۹٫]/gu, (character) =>
    character === '٫'
      ? '.'
      : String.fromCharCode(
          48 +
            (character.charCodeAt(0) >= 0x6f0
              ? character.charCodeAt(0) - 0x6f0
              : character.charCodeAt(0) - 0x660),
        ),
  );
  const match = /^([+-]?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?)(\d+))?$/u.exec(ascii);
  if (!match) invalid();
  let scientificExponent = 0;
  for (const digit of match[5] ?? '') {
    scientificExponent = scientificExponent * 10 + digit.charCodeAt(0) - 48;
    if (scientificExponent > DECIMAL_LIMITS.exponent) invalid();
  }
  if (match[4] === '-') scientificExponent = -scientificExponent;
  let digits = (match[2] + (match[3] ?? '')).replace(/^0+/u, '');
  if (!digits) return Object.freeze({ coefficient: 0n, exponent: 0 });
  let exponent = scientificExponent - (match[3]?.length ?? 0);
  const trailing = /0+$/u.exec(digits)?.[0].length ?? 0;
  digits = digits.slice(0, digits.length - trailing);
  exponent += trailing;
  if (digits.length > DECIMAL_LIMITS.significantDigits) invalid();
  const coefficient = BigInt(digits) * (match[1] === '-' ? -1n : 1n);
  return Object.freeze({ coefficient, exponent });
}

export function canonicalDecimal(value: ExactDecimal): string {
  if (value.coefficient === 0n) return '0';
  const sign = value.coefficient < 0n ? '-' : '';
  const digits = (
    value.coefficient < 0n ? -value.coefficient : value.coefficient
  ).toString();
  // Keep canonical output inside the same lexical exponent/input bounds.
  const exponent = Math.max(-100, Math.min(100, value.exponent));
  const shift = value.exponent - exponent;
  const mantissa =
    shift >= 0
      ? digits + '0'.repeat(shift)
      : digits.length + shift > 0
        ? `${digits.slice(0, digits.length + shift)}.${digits.slice(digits.length + shift)}`
        : `0.${'0'.repeat(-shift - digits.length)}${digits}`;
  return `${sign}${mantissa}${exponent ? `e${exponent}` : ''}`;
}
function power(exponent: number): bigint {
  return 10n ** BigInt(exponent);
}
export function compareDecimals(a: ExactDecimal, b: ExactDecimal): -1 | 0 | 1 {
  const exponent = Math.min(a.exponent, b.exponent);
  const left = a.coefficient * power(a.exponent - exponent);
  const right = b.coefficient * power(b.exponent - exponent);
  return left < right ? -1 : left > right ? 1 : 0;
}
export function absoluteDifference(
  a: ExactDecimal,
  b: ExactDecimal,
): ExactDecimal {
  const exponent = Math.min(a.exponent, b.exponent);
  const coefficient =
    a.coefficient * power(a.exponent - exponent) -
    b.coefficient * power(b.exponent - exponent);
  return {
    coefficient: coefficient < 0n ? -coefficient : coefficient,
    exponent,
  };
}
export function multiplyDecimals(
  a: ExactDecimal,
  b: ExactDecimal,
): ExactDecimal {
  return {
    coefficient: a.coefficient * b.coefficient,
    exponent: a.exponent + b.exponent,
  };
}
