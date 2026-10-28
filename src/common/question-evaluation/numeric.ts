import {
  invalid,
  MANUAL,
  QuestionEvaluationInputError,
  type AnswerPhase,
  type EvaluationOutcome,
  type NumericComparisonPolicyV1,
  type NumericPrivateAnswerKeyV1,
  type NumericPublicDefinitionV1,
  type NumericStudentAnswerV1,
  type Phase,
} from './contracts';
import {
  absoluteDifference,
  canonicalDecimal,
  compareDecimals,
  multiplyDecimals,
  parseExactDecimal,
} from './exact-decimal';
import {
  absent,
  bool,
  keyState,
  kind,
  list,
  record,
  text,
  unique,
  version,
} from './strict-data';

export function normalizeNumericDefinition(
  value: unknown,
  phase: Phase,
): NumericPublicDefinitionV1 {
  if (phase !== 'draft' && phase !== 'complete') invalid();
  const item = record(value, ['definitionVersion', 'kind', 'units']);
  const unit = record(item.units, [
    'required',
    'allowedCodes',
    'allowUnitless',
  ]);
  const required = bool(unit.required),
    allowUnitless = bool(unit.allowUnitless);
  if (required === allowUnitless) invalid();
  const allowedCodes = list(unit.allowedCodes, 16).map((value) => {
    const code = text(value, 24);
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/u.test(code)) invalid();
    return code;
  });
  unique(allowedCodes);
  if (phase === 'complete' && !allowedCodes.length && !allowUnitless) invalid();
  return {
    definitionVersion: version(item.definitionVersion),
    kind: kind(item.kind, 'numeric'),
    units: { required, allowedCodes: allowedCodes.sort(), allowUnitless },
  };
}
function unitCode(
  definition: NumericPublicDefinitionV1,
  value: unknown,
): string | null {
  if (value === null && definition.units.allowUnitless) return null;
  if (
    typeof value !== 'string' ||
    !definition.units.allowedCodes.includes(value)
  )
    invalid();
  return value;
}
export function normalizeNumericAnswer(
  definition: unknown,
  value: unknown,
  phase: AnswerPhase,
  required: boolean,
): NumericStudentAnswerV1 | Partial<NumericStudentAnswerV1> | null {
  const current = normalizeNumericDefinition(definition, 'complete');
  if (absent(value, phase, required)) return null;
  const item = record(
    value,
    phase === 'final' ? ['value', 'unitCode'] : [],
    phase === 'draft' ? ['value', 'unitCode'] : [],
  );
  return {
    ...(Object.hasOwn(item, 'value')
      ? { value: canonicalDecimal(parseExactDecimal(item.value)) }
      : {}),
    ...(Object.hasOwn(item, 'unitCode')
      ? { unitCode: unitCode(current, item.unitCode) }
      : {}),
  };
}
function policy(
  value: unknown,
  reference: NumericStudentAnswerV1,
): NumericComparisonPolicyV1 {
  // First inspect the discriminant through closed data descriptors.
  const item = record(
    value,
    ['policyVersion', 'mode'],
    [
      'tolerance',
      'relativeTolerance',
      'lower',
      'upper',
      'includeLower',
      'includeUpper',
    ],
  );
  version(item.policyVersion);
  if (item.mode === 'EXACT') {
    record(value, ['policyVersion', 'mode']);
    return { policyVersion: 1, mode: 'EXACT' };
  }
  if (
    item.mode === 'ABSOLUTE_TOLERANCE' ||
    item.mode === 'RELATIVE_TOLERANCE'
  ) {
    const field =
      item.mode === 'ABSOLUTE_TOLERANCE' ? 'tolerance' : 'relativeTolerance';
    record(value, ['policyVersion', 'mode', field]);
    const tolerance = parseExactDecimal(item[field]);
    if (
      tolerance.coefficient < 0n ||
      (item.mode === 'RELATIVE_TOLERANCE' &&
        parseExactDecimal(reference.value).coefficient === 0n)
    )
      invalid();
    return item.mode === 'ABSOLUTE_TOLERANCE'
      ? {
          policyVersion: 1,
          mode: item.mode,
          tolerance: canonicalDecimal(tolerance),
        }
      : {
          policyVersion: 1,
          mode: item.mode,
          relativeTolerance: canonicalDecimal(tolerance),
        };
  }
  if (item.mode === 'EXPLICIT_ACCEPTED_RANGE') {
    record(value, [
      'policyVersion',
      'mode',
      'lower',
      'upper',
      'includeLower',
      'includeUpper',
    ]);
    const lower = parseExactDecimal(item.lower),
      upper = parseExactDecimal(item.upper);
    const includeLower = bool(item.includeLower),
      includeUpper = bool(item.includeUpper);
    const comparison = compareDecimals(lower, upper);
    if (
      comparison > 0 ||
      (comparison === 0 && (!includeLower || !includeUpper))
    )
      invalid();
    return {
      policyVersion: 1,
      mode: item.mode,
      lower: canonicalDecimal(lower),
      upper: canonicalDecimal(upper),
      includeLower,
      includeUpper,
    };
  }
  return invalid();
}
export function normalizeNumericKey(
  definition: unknown,
  value: unknown,
): NumericPrivateAnswerKeyV1 {
  const current = normalizeNumericDefinition(definition, 'complete');
  const item = record(value, ['keyVersion', 'kind', 'reference'], ['policy']);
  const reference = normalizeNumericAnswer(
    current,
    item.reference,
    'final',
    true,
  ) as NumericStudentAnswerV1;
  return {
    keyVersion: version(item.keyVersion),
    kind: kind(item.kind, 'numeric'),
    reference,
    ...(Object.hasOwn(item, 'policy')
      ? { policy: policy(item.policy, reference) }
      : {}),
  };
}
export function evaluateNumeric(
  definition: unknown,
  privateState: unknown,
  answer: unknown,
): EvaluationOutcome {
  const current = normalizeNumericDefinition(definition, 'complete');
  const state = keyState(privateState);
  const key =
    state.state === 'configured'
      ? normalizeNumericKey(current, state.key)
      : null;
  let normalized: NumericStudentAnswerV1 | null;
  try {
    normalized = normalizeNumericAnswer(
      current,
      answer,
      'final',
      false,
    ) as NumericStudentAnswerV1 | null;
  } catch (error) {
    if (error instanceof QuestionEvaluationInputError) return 'INVALID_INPUT';
    throw error;
  }
  if (
    !normalized ||
    !key?.policy ||
    normalized.unitCode !== key.reference.unitCode
  )
    return MANUAL;
  const value = parseExactDecimal(normalized.value),
    reference = parseExactDecimal(key.reference.value),
    configured = key.policy;
  let matches: boolean;
  if (configured.mode === 'EXACT')
    matches = compareDecimals(value, reference) === 0;
  else if (configured.mode === 'EXPLICIT_ACCEPTED_RANGE') {
    const lower = compareDecimals(value, parseExactDecimal(configured.lower)),
      upper = compareDecimals(value, parseExactDecimal(configured.upper));
    matches =
      (lower > 0 || (lower === 0 && configured.includeLower)) &&
      (upper < 0 || (upper === 0 && configured.includeUpper));
  } else {
    const tolerance =
      configured.mode === 'ABSOLUTE_TOLERANCE'
        ? parseExactDecimal(configured.tolerance)
        : multiplyDecimals(
            {
              coefficient:
                reference.coefficient < 0n
                  ? -reference.coefficient
                  : reference.coefficient,
              exponent: reference.exponent,
            },
            parseExactDecimal(configured.relativeTolerance),
          );
    matches =
      compareDecimals(absoluteDifference(value, reference), tolerance) <= 0;
  }
  return matches ? 'PROVED_EQUIVALENT' : 'PROVED_DIFFERENT';
}
