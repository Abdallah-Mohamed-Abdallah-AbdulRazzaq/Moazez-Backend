import {
  invalid,
  MANUAL,
  QuestionEvaluationInputError,
  type AnswerPhase,
  type EvaluationOutcome,
  type MathExpressionPrivateAnswerKeyV1,
  type MathExpressionPublicDefinitionV1,
  type MathExpressionStudentAnswerV1,
  type Phase,
} from './contracts';
import { parseExpression, validateVariables } from './expression-parser';
import {
  assertNoProvablyUndefinedSubexpression,
  compareConstants,
  containsVariable,
  evaluateConstant,
  ProofLimit,
  RationalBudget,
  UndefinedExpression,
  validatePowers,
} from './expression-rational';
import {
  absent,
  keyState,
  kind,
  list,
  record,
  text,
  version,
} from './strict-data';

export function normalizeMathDefinition(
  value: unknown,
  phase: Phase,
): MathExpressionPublicDefinitionV1 {
  if (phase !== 'draft' && phase !== 'complete') invalid();
  const item = record(value, ['definitionVersion', 'kind', 'variables']);
  const variables = validateVariables(
    list(item.variables, 8).map((value) => text(value, 32)),
  );
  return {
    definitionVersion: version(item.definitionVersion),
    kind: kind(item.kind, 'math_expression'),
    variables,
  };
}
function parsed(value: unknown, definition: MathExpressionPublicDefinitionV1) {
  const node = parseExpression(value, definition.variables);
  validatePowers(node);
  return node;
}
export function normalizeMathAnswer(
  definition: unknown,
  value: unknown,
  phase: AnswerPhase,
  required: boolean,
):
  | MathExpressionStudentAnswerV1
  | Partial<MathExpressionStudentAnswerV1>
  | null {
  const current = normalizeMathDefinition(definition, 'complete');
  if (absent(value, phase, required)) return null;
  const item = record(
    value,
    phase === 'final' ? ['expression'] : [],
    phase === 'draft' ? ['expression'] : [],
  );
  if (!Object.hasOwn(item, 'expression')) return {};
  const expression = text(item.expression, 512);
  parsed(expression, current);
  return { expression };
}
export function normalizeMathKey(
  definition: unknown,
  value: unknown,
): MathExpressionPrivateAnswerKeyV1 {
  const current = normalizeMathDefinition(definition, 'complete');
  const item = record(value, ['keyVersion', 'kind', 'expression']);
  const expression = text(item.expression, 512),
    node = parsed(expression, current);
  try {
    assertNoProvablyUndefinedSubexpression(node);
  } catch (error) {
    if (error instanceof UndefinedExpression) invalid();
    throw error;
  }
  return {
    keyVersion: version(item.keyVersion),
    kind: kind(item.kind, 'math_expression'),
    expression,
  };
}
export function evaluateMathExpression(
  definition: unknown,
  privateState: unknown,
  answer: unknown,
): EvaluationOutcome {
  const current = normalizeMathDefinition(definition, 'complete');
  const state = keyState(privateState);
  const key =
    state.state === 'configured' ? normalizeMathKey(current, state.key) : null;
  let expression: string | undefined;
  try {
    expression = normalizeMathAnswer(
      current,
      answer,
      'final',
      false,
    )?.expression;
  } catch (error) {
    if (error instanceof QuestionEvaluationInputError) return 'INVALID_INPUT';
    throw error;
  }
  if (!expression) return MANUAL;
  const node = parsed(expression, current);
  try {
    assertNoProvablyUndefinedSubexpression(node);
    if (containsVariable(node)) return MANUAL;
    // Undefined input stays undefined even when an explicit manual key is used.
    if (!key) {
      evaluateConstant(node, new RationalBudget());
      return MANUAL;
    }
    const reference = parsed(key.expression, current);
    if (containsVariable(reference)) {
      evaluateConstant(node, new RationalBudget());
      return MANUAL;
    }
    return compareConstants(node, reference)
      ? 'PROVED_EQUIVALENT'
      : 'PROVED_DIFFERENT';
  } catch (error) {
    if (error instanceof UndefinedExpression) return 'UNDEFINED_EXPRESSION';
    if (error instanceof ProofLimit) return MANUAL;
    throw error;
  }
}
