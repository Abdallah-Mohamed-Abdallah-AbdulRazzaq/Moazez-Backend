import {
  evaluateMathExpression,
  normalizeMathAnswer,
  normalizeMathDefinition,
  normalizeMathKey,
  QuestionEvaluationInputError,
} from './index';
import { ExpressionNodeBudget, parseExpression } from './expression-parser';
import { ProofLimit, RationalBudget } from './expression-rational';
const definition = {
  definitionVersion: 1,
  kind: 'math_expression',
  variables: ['x', 'y'],
};
const state = (expression: string) => ({
  state: 'configured',
  key: { keyVersion: 1, kind: 'math_expression', expression },
});
const compare = (answer: string, expected: string) =>
  evaluateMathExpression(definition, state(expected), { expression: answer });
describe('ST10-A bounded mathematical expression proof', () => {
  it.each([
    ['2*(3+4)', '14'],
    ['-2^2', '-4'],
    ['(-2)^2', '4'],
    ['2^3^2', '512'],
    ['2^-2', '1/4'],
    ['0.1+0.2', '0.3'],
    ['1/3+1/6', '1/2'],
    ['1e-100/2', '0.5e-100'],
    ['-(-2)', '2'],
    ['2^0', '1'],
  ])('proves %s == %s exactly', (answer, expected) =>
    expect(compare(answer, expected)).toBe('PROVED_EQUIVALENT'),
  );
  it('proves constant difference without approximate arithmetic', () => {
    expect(compare('9007199254740993', '9007199254740992')).toBe(
      'PROVED_DIFFERENT',
    );
    expect(compare('1/3', '0.3333333333333333333333333333333333')).toBe(
      'PROVED_DIFFERENT',
    );
  });
  it.each([
    ['x+x', '2*x'],
    ['x/x', '1'],
    ['x', 'x'],
    ['x+1', 'x+2'],
    ['1', 'x'],
  ])('requires manual review of %s vs %s', (answer, expected) =>
    expect(compare(answer, expected)).toBe('UNKNOWN_REQUIRES_MANUAL_REVIEW'),
  );
  it.each(['1/0', '0^0', '0^-2', '2^(1/0)'])(
    'distinguishes undefined %s from invalid syntax',
    (expression) => {
      expect(compare(expression, '1')).toBe('UNDEFINED_EXPRESSION');
      expect(() =>
        normalizeMathKey(definition, state(expression).key),
      ).toThrow();
    },
  );
  it.each([
    '2x',
    '2(3+4)',
    'sqrt(4)',
    'sin(0)',
    'x.y',
    'x[0]',
    'x=1',
    'x=>1',
    'Math.random()',
    'eval(1)',
    'Function(1)',
    'process.exit()',
    '<script>x</script>',
    '1;2',
    '1**2',
    '2^17',
    '2^-17',
    '2^0.5',
    '2^x',
    '2e101',
    'x\u202e',
    '未',
    'z',
    '',
    '()',
    '(1',
    '1+',
  ])('rejects unsupported syntax %s', (expression) =>
    expect(compare(expression, '1')).toBe('INVALID_INPUT'),
  );
  it('enforces all independent parser limits and exact evaluator growth', () => {
    expect(
      normalizeMathAnswer(
        definition,
        { expression: ' '.repeat(511) + '1' },
        'final',
        true,
      ),
    ).toBeDefined();
    expect(compare(' '.repeat(512) + '1', '1')).toBe('INVALID_INPUT');
    // Balanced trees isolate token budget from AST depth.
    const balanced = (n: number): string =>
      n === 1
        ? '1'
        : `(${balanced(Math.floor(n / 2))}+${balanced(Math.ceil(n / 2))})`;
    expect(compare(balanced(32), '32')).toBe('PROVED_EQUIVALENT'); // 125 tokens
    expect(compare(balanced(33), '33')).toBe('INVALID_INPUT'); // 129 tokens
    expect(compare('('.repeat(32) + '1' + ')'.repeat(32), '1')).toBe(
      'PROVED_EQUIVALENT',
    );
    expect(compare('('.repeat(33) + '1' + ')'.repeat(33), '1')).toBe(
      'INVALID_INPUT',
    );
    expect(compare('-'.repeat(31) + '1', '-1')).toBe('PROVED_EQUIVALENT');
    expect(compare('-'.repeat(32) + '1', '1')).toBe('INVALID_INPUT');
    const budget = new ExpressionNodeBudget();
    for (let i = 0; i < 256; i++)
      budget.add({ kind: 'literal', coefficient: 1n, exponent: 0, depth: 1 });
    expect(() =>
      budget.add({ kind: 'literal', coefficient: 1n, exponent: 0, depth: 1 }),
    ).toThrow();
    expect(() =>
      new ExpressionNodeBudget().add({
        kind: 'literal',
        coefficient: 1n,
        exponent: 0,
        depth: 33,
      }),
    ).toThrow();
    const rational = new RationalBudget();
    for (let i = 0; i < 4096; i++) rational.tick();
    expect(() => rational.tick()).toThrow(ProofLimit);
    expect(() => new RationalBudget().rational(1n << 4096n, 1n)).toThrow(
      ProofLimit,
    );
    expect(() => new RationalBudget().rational(1n, 1n << 4096n)).toThrow(
      ProofLimit,
    );
    expect(compare('((2^16)^16)^16', '1')).toBe(
      'UNKNOWN_REQUIRES_MANUAL_REVIEW',
    );
    const cancellation = '2^((((2^16)^16)^16)-(((2^16)^16)^16)+1)';
    expect(compare(cancellation, '2')).toBe('UNKNOWN_REQUIRES_MANUAL_REVIEW');
    expect(compare('2', cancellation)).toBe('UNKNOWN_REQUIRES_MANUAL_REVIEW');
    expect(compare('2^(2^16)', '2')).toBe('INVALID_INPUT');
  });
  it('bounds declarations and returns a frozen safe AST without proving variables', () => {
    const variables = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    expect(
      normalizeMathDefinition({ ...definition, variables }, 'complete')
        .variables,
    ).toHaveLength(8);
    for (const invalid of [
      [...variables, 'i'],
      ['x', 'x'],
      ['constructor'],
      ['__proto__'],
      ['Function'],
      ['x.y'],
      ['a'.repeat(33)],
    ])
      expect(() =>
        normalizeMathDefinition(
          { ...definition, variables: invalid },
          'complete',
        ),
      ).toThrow();
    const tree = parseExpression('x+1', ['x']);
    expect(Object.isFrozen(tree)).toBe(true);
    expect(tree.kind).toBe('binary');
  });
  it('preserves key failure, draft absence and explicit manual states', () => {
    expect(
      evaluateMathExpression(
        definition,
        { state: 'manual' },
        { expression: '2' },
      ),
    ).toBe('UNKNOWN_REQUIRES_MANUAL_REVIEW');
    expect(
      evaluateMathExpression(
        definition,
        { state: 'manual' },
        { expression: '1/0' },
      ),
    ).toBe('UNDEFINED_EXPRESSION');
    expect(normalizeMathAnswer(definition, {}, 'draft', true)).toEqual({});
    expect(normalizeMathAnswer(definition, null, 'final', false)).toBeNull();
    expect(() => normalizeMathAnswer(definition, {}, 'final', false)).toThrow();
    expect(() =>
      evaluateMathExpression(
        definition,
        { state: 'configured', key: { ...state('1').key, keyVersion: 2 } },
        { expression: '1' },
      ),
    ).toThrow(QuestionEvaluationInputError);
  });
});
