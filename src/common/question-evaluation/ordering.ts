import {
  invalid,
  MANUAL,
  QuestionEvaluationInputError,
  type AnswerPhase,
  type EvaluationOutcome,
  type OrderingPrivateAnswerKeyV1,
  type OrderingPublicDefinitionV1,
  type OrderingStudentAnswerV1,
  type Phase,
} from './contracts';
import {
  absent,
  identifier,
  keyState,
  kind,
  list,
  record,
  text,
  unique,
  version,
} from './strict-data';

export function normalizeOrderingDefinition(
  value: unknown,
  phase: Phase,
): OrderingPublicDefinitionV1 {
  if (phase !== 'draft' && phase !== 'complete') invalid();
  const item = record(value, ['definitionVersion', 'kind', 'items']);
  const items = list(item.items, 50).map((value) => {
    const row = record(value, ['id', 'displayOrder', 'label']);
    if (
      typeof row.displayOrder !== 'number' ||
      !Number.isSafeInteger(row.displayOrder) ||
      row.displayOrder < 0 ||
      row.displayOrder > 1_000_000
    )
      invalid();
    const label = text(row.label, 1000).trim();
    if (!label) invalid();
    return {
      id: identifier(row.id),
      displayOrder: row.displayOrder,
      label,
    };
  });
  if (phase === 'complete' && !items.length) invalid();
  unique(items.map((row) => row.id));
  if (new Set(items.map((row) => row.displayOrder)).size !== items.length)
    invalid();
  return {
    definitionVersion: version(item.definitionVersion),
    kind: kind(item.kind, 'ordering'),
    items: items.sort((a, b) => a.displayOrder - b.displayOrder),
  };
}
export function normalizeOrderingKey(
  definition: unknown,
  value: unknown,
): OrderingPrivateAnswerKeyV1 {
  const current = normalizeOrderingDefinition(definition, 'complete');
  const item = record(value, ['keyVersion', 'kind', 'expectedItemIds']);
  const expectedItemIds = list(item.expectedItemIds, 50).map((value) =>
    identifier(value),
  );
  assertPermutation(current, expectedItemIds, true);
  return {
    keyVersion: version(item.keyVersion),
    kind: kind(item.kind, 'ordering'),
    expectedItemIds,
  };
}
function assertPermutation(
  definition: OrderingPublicDefinitionV1,
  ids: string[],
  complete: boolean,
): void {
  unique(ids);
  if (
    (complete && ids.length !== definition.items.length) ||
    ids.some((id) => !definition.items.some((item) => item.id === id))
  )
    invalid();
}
export function normalizeOrderingAnswer(
  definition: unknown,
  value: unknown,
  phase: AnswerPhase,
  required: boolean,
): OrderingStudentAnswerV1 | null {
  const current = normalizeOrderingDefinition(definition, 'complete');
  if (absent(value, phase, required)) return null;
  const item = record(value, ['orderedItemIds']);
  const orderedItemIds = list(item.orderedItemIds, 50).map((value) =>
    identifier(value),
  );
  assertPermutation(current, orderedItemIds, phase === 'final');
  return { orderedItemIds };
}
export function evaluateOrdering(
  definition: unknown,
  privateState: unknown,
  answer: unknown,
): EvaluationOutcome {
  const current = normalizeOrderingDefinition(definition, 'complete');
  const state = keyState(privateState);
  const key =
    state.state === 'configured'
      ? normalizeOrderingKey(current, state.key)
      : null;
  let normalized: OrderingStudentAnswerV1 | null;
  try {
    normalized = normalizeOrderingAnswer(current, answer, 'final', false);
  } catch (error) {
    if (error instanceof QuestionEvaluationInputError) return 'INVALID_INPUT';
    throw error;
  }
  if (!normalized || !key) return MANUAL;
  return normalized.orderedItemIds.every(
    (id, index) => id === key.expectedItemIds[index],
  )
    ? 'PROVED_EQUIVALENT'
    : 'PROVED_DIFFERENT';
}
