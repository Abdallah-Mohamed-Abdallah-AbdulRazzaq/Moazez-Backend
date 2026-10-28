export type Phase = 'draft' | 'complete';
export type AnswerPhase = 'draft' | 'final';
export type EvaluationOutcome =
  | 'PROVED_EQUIVALENT'
  | 'PROVED_DIFFERENT'
  | 'UNKNOWN_REQUIRES_MANUAL_REVIEW'
  | 'INVALID_INPUT'
  | 'UNDEFINED_EXPRESSION';

export interface OrderingPublicDefinitionV1 {
  definitionVersion: 1;
  kind: 'ordering';
  items: { id: string; displayOrder: number; label: string }[];
}
export interface OrderingPrivateAnswerKeyV1 {
  keyVersion: 1;
  kind: 'ordering';
  expectedItemIds: string[];
}
export interface OrderingStudentAnswerV1 {
  orderedItemIds: string[];
}
export interface NumericPublicDefinitionV1 {
  definitionVersion: 1;
  kind: 'numeric';
  units: { required: boolean; allowedCodes: string[]; allowUnitless: boolean };
}
export interface NumericStudentAnswerV1 {
  value: string;
  unitCode: string | null;
}
export type NumericComparisonPolicyV1 =
  | { policyVersion: 1; mode: 'EXACT' }
  | { policyVersion: 1; mode: 'ABSOLUTE_TOLERANCE'; tolerance: string }
  | { policyVersion: 1; mode: 'RELATIVE_TOLERANCE'; relativeTolerance: string }
  | {
      policyVersion: 1;
      mode: 'EXPLICIT_ACCEPTED_RANGE';
      lower: string;
      upper: string;
      includeLower: boolean;
      includeUpper: boolean;
    };
export interface NumericPrivateAnswerKeyV1 {
  keyVersion: 1;
  kind: 'numeric';
  reference: NumericStudentAnswerV1;
  policy?: NumericComparisonPolicyV1;
}
export interface MathExpressionPublicDefinitionV1 {
  definitionVersion: 1;
  kind: 'math_expression';
  variables: string[];
}
export interface MathExpressionPrivateAnswerKeyV1 {
  keyVersion: 1;
  kind: 'math_expression';
  expression: string;
}
export interface MathExpressionStudentAnswerV1 {
  expression: string;
}
export type PrivateKeyState =
  | { state: 'manual' }
  | { state: 'configured'; key: unknown };
export const MANUAL: EvaluationOutcome = 'UNKNOWN_REQUIRES_MANUAL_REVIEW';

/** Fixed diagnostic: never includes a private key or untrusted input. */
export class QuestionEvaluationInputError extends Error {
  readonly code = 'question_evaluation.invalid';
  constructor() {
    super('Invalid question evaluation contract');
  }
}
export function invalid(): never {
  throw new QuestionEvaluationInputError();
}
