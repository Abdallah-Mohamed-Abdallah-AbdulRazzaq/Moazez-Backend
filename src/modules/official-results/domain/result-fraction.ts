import { decimalMicros } from './result-definition';

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
}

export class ResultFraction {
  readonly numerator: bigint;
  readonly denominator: bigint;

  constructor(numerator: bigint, denominator = 1n) {
    if (denominator <= 0n)
      throw new RangeError('A result fraction requires a positive denominator');
    const divisor = greatestCommonDivisor(numerator, denominator);
    this.numerator = numerator / divisor;
    this.denominator = denominator / divisor;
  }

  static decimal(value: string): ResultFraction {
    return new ResultFraction(decimalMicros(value), 1_000_000n);
  }

  add(other: ResultFraction): ResultFraction {
    return new ResultFraction(
      this.numerator * other.denominator + other.numerator * this.denominator,
      this.denominator * other.denominator,
    );
  }

  times(other: ResultFraction): ResultFraction {
    return new ResultFraction(
      this.numerator * other.numerator,
      this.denominator * other.denominator,
    );
  }

  over(other: ResultFraction): ResultFraction {
    return new ResultFraction(
      this.numerator * other.denominator,
      this.denominator * other.numerator,
    );
  }

  compare(other: ResultFraction): bigint {
    return (
      this.numerator * other.denominator - other.numerator * this.denominator
    );
  }

  format(scale: number, mode: 'HALF_UP' | 'HALF_EVEN' | 'DOWN'): string {
    const sign = this.numerator < 0n ? '-' : '';
    const factor = 10n ** BigInt(scale);
    const absolute =
      (this.numerator < 0n ? -this.numerator : this.numerator) * factor;
    const integer = absolute / this.denominator;
    const doubleRemainder = 2n * (absolute % this.denominator);
    const roundUp =
      mode !== 'DOWN' &&
      (doubleRemainder > this.denominator ||
        (doubleRemainder === this.denominator &&
          (mode === 'HALF_UP' || integer % 2n !== 0n)));
    const scaled = integer + (roundUp ? 1n : 0n);
    const whole = scaled / factor;
    return scale === 0
      ? sign + whole
      : sign + whole + '.' + (scaled % factor).toString().padStart(scale, '0');
  }
}
