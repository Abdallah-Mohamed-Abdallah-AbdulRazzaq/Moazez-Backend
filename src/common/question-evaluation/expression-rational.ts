import { invalid } from './contracts';
import { EXPRESSION_LIMITS, type ExpressionNode } from './expression-parser';

export class ProofLimit extends Error {}
export class UndefinedExpression extends Error {}
interface Rational {
  numerator: bigint;
  denominator: bigint;
}
const abs = (n: bigint) => (n < 0n ? -n : n);
const bits = (n: bigint) => abs(n).toString(2).length;
export class RationalBudget {
  private operations = 0;
  tick(): void {
    if (++this.operations > EXPRESSION_LIMITS.operations)
      throw new ProofLimit();
  }
  check(n: bigint): void {
    if (bits(n) > EXPRESSION_LIMITS.rationalBits) throw new ProofLimit();
  }
  multiply(a: bigint, b: bigint): bigint {
    this.tick();
    if (a === 0n || b === 0n) return 0n;
    if (bits(a) + bits(b) - 1 > EXPRESSION_LIMITS.rationalBits)
      throw new ProofLimit();
    const result = a * b;
    this.check(result);
    return result;
  }
  rational(numerator: bigint, denominator: bigint): Rational {
    this.tick();
    this.check(numerator);
    this.check(denominator);
    if (denominator === 0n) throw new UndefinedExpression();
    let a = abs(numerator),
      b = abs(denominator);
    while (b) {
      this.tick();
      const next = a % b;
      a = b;
      b = next;
    }
    const sign = denominator < 0n ? -1n : 1n;
    return {
      numerator: (numerator / a) * sign,
      denominator: (denominator / a) * sign,
    };
  }
}
export function containsVariable(node: ExpressionNode): boolean {
  return (
    node.kind === 'variable' ||
    (node.kind === 'unary'
      ? containsVariable(node.operand)
      : node.kind === 'binary'
        ? containsVariable(node.left) || containsVariable(node.right)
        : false)
  );
}
function integerPower(value: Rational): bigint {
  if (
    value.denominator !== 1n ||
    abs(value.numerator) > BigInt(EXPRESSION_LIMITS.power)
  )
    invalid();
  return value.numerator;
}
/** Validate every power, including powers in a variable-bearing expression. */
export function validatePowers(node: ExpressionNode): void {
  if (node.kind === 'unary') validatePowers(node.operand);
  if (node.kind !== 'binary') return;
  validatePowers(node.left);
  validatePowers(node.right);
  if (node.operator !== '^') return;
  if (containsVariable(node.right)) invalid();
  try {
    integerPower(evaluateConstant(node.right, new RationalBudget()));
  } catch (error) {
    // Inability to prove a constant exponent's bounds is not invalid syntax.
    // evaluateConstant enforces the integer/power bounds before any power runs.
    if (
      !(error instanceof ProofLimit) &&
      !(error instanceof UndefinedExpression)
    )
      throw error;
  }
}
export function evaluateConstant(
  node: ExpressionNode,
  budget: RationalBudget,
): Rational {
  budget.tick();
  if (node.kind === 'literal')
    return node.exponent >= 0
      ? budget.rational(
          budget.multiply(node.coefficient, 10n ** BigInt(node.exponent)),
          1n,
        )
      : budget.rational(node.coefficient, 10n ** BigInt(-node.exponent));
  if (node.kind === 'variable') throw new ProofLimit();
  if (node.kind === 'unary') {
    const value = evaluateConstant(node.operand, budget);
    return {
      numerator: node.operator === '-' ? -value.numerator : value.numerator,
      denominator: value.denominator,
    };
  }
  const left = evaluateConstant(node.left, budget),
    right = evaluateConstant(node.right, budget);
  if (node.operator === '^') {
    const exponent = integerPower(right),
      magnitude = abs(exponent);
    if (left.numerator === 0n && exponent <= 0n)
      throw new UndefinedExpression();
    if (
      BigInt(bits(left.numerator)) * magnitude >
        BigInt(EXPRESSION_LIMITS.rationalBits) ||
      BigInt(bits(left.denominator)) * magnitude >
        BigInt(EXPRESSION_LIMITS.rationalBits)
    )
      throw new ProofLimit();
    budget.tick();
    const numerator = left.numerator ** magnitude,
      denominator = left.denominator ** magnitude;
    return exponent < 0n
      ? budget.rational(denominator, numerator)
      : budget.rational(numerator, denominator);
  }
  if (node.operator === '*')
    return budget.rational(
      budget.multiply(left.numerator, right.numerator),
      budget.multiply(left.denominator, right.denominator),
    );
  if (node.operator === '/')
    return budget.rational(
      budget.multiply(left.numerator, right.denominator),
      budget.multiply(left.denominator, right.numerator),
    );
  const a = budget.multiply(left.numerator, right.denominator),
    b = budget.multiply(right.numerator, left.denominator);
  return budget.rational(
    node.operator === '+' ? a + b : a - b,
    budget.multiply(left.denominator, right.denominator),
  );
}
export function compareConstants(
  a: ExpressionNode,
  b: ExpressionNode,
): boolean {
  const budget = new RationalBudget();
  const left = evaluateConstant(a, budget),
    right = evaluateConstant(b, budget);
  // Both rationals are reduced with positive denominators; no large cross product.
  return (
    left.numerator === right.numerator && left.denominator === right.denominator
  );
}
