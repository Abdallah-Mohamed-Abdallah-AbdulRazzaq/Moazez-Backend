import { OfficialResultsError } from './official-results.error';
import type { ResultDefinition, ResultField } from './result-definition';
import { ResultFraction } from './result-fraction';
import type { ResultValue } from './result-value';

type ResultCalculationPolicy = ResultDefinition['calculationPolicy'];
type IncompleteReason =
  | 'REQUIRED_INPUT_MISSING'
  | 'ABSENT_INPUT_BLOCKS_CALCULATION'
  | 'EXCUSED_INPUT_BLOCKS_CALCULATION';

export type ResultCalculation = {
  fieldId: string;
  calculationStatus: 'READY' | 'INCOMPLETE' | 'NOT_APPLICABLE';
  value: ResultValue;
  reason?: IncompleteReason;
  evaluation?: {
    nominalMaxScore?: string;
    effectiveMaxScore?: string;
    normalizedPercentage: string;
    displayPercentage?: string;
  };
  effectiveWeight?: string;
};

type Numeric = {
  points: ResultFraction;
  maximum: ResultFraction;
  nominalMaximum: ResultFraction;
};
type Operand =
  | { status: 'READY'; numeric: Numeric }
  | { status: 'INCOMPLETE'; reason: IncompleteReason }
  | { status: 'NOT_APPLICABLE' };
type Evaluated = { output: ResultCalculation; operand: Operand };

const zero = new ResultFraction(0n);
const one = new ResultFraction(1n);
const hundred = new ResultFraction(100n);
const numericCeiling = new ResultFraction(1_000_000_000_000n);
const notApplicable = { status: 'NOT_APPLICABLE' } as const;
const missing = {
  status: 'INCOMPLETE',
  reason: 'REQUIRED_INPUT_MISSING',
} as const;
const fraction = ResultFraction.decimal;

const sum = (items: ResultFraction[]) =>
  items.reduce((total, item) => total.add(item), zero);
const ratio = (item: Numeric) => item.points.over(item.maximum);
const normalized = (item: Numeric) => ratio(item).times(hundred);

function maximum(field: ResultField) {
  if ('maxScore' in field.constraints)
    return fraction(field.constraints.maxScore);
  if ('nominalMaxScore' in field.constraints)
    return fraction(field.constraints.nominalMaxScore);
  return hundred;
}

function manualOperand(
  field: ResultField,
  value: ResultValue | undefined,
  policy: ResultCalculationPolicy,
): Operand {
  const max = maximum(field);
  const accept = (points: ResultFraction): Operand => ({
    status: 'READY',
    numeric: { points, maximum: max, nominalMaximum: max },
  });
  switch (value?.status) {
    case 'RECORDED':
      if ('score' in value) return accept(fraction(value.score));
      if ('percentage' in value) return accept(fraction(value.percentage));
      throw new OfficialResultsError('calculation.invalid');
    case 'ABSENT':
      return policy.absent === 'ZERO'
        ? accept(zero)
        : { status: 'INCOMPLETE', reason: 'ABSENT_INPUT_BLOCKS_CALCULATION' };
    case 'EXCUSED':
      return policy.excused === 'EXCLUDE'
        ? notApplicable
        : { status: 'INCOMPLETE', reason: 'EXCUSED_INPUT_BLOCKS_CALCULATION' };
    case 'NOT_APPLICABLE':
      return notApplicable;
    default:
      return missing;
  }
}

function calculate(
  field: ResultField,
  operands: Operand[],
  policy: ResultCalculationPolicy,
): Evaluated {
  const blocked = operands.find((operand) => operand.status === 'INCOMPLETE');
  if (blocked)
    return {
      operand: blocked,
      output: {
        fieldId: field.id,
        calculationStatus: 'INCOMPLETE',
        value: { status: 'MISSING' },
        reason: blocked.reason,
      },
    };
  const included = operands.flatMap((operand, index) =>
    operand.status === 'READY' ? [{ numeric: operand.numeric, index }] : [],
  );
  if (included.length === 0)
    return {
      operand: notApplicable,
      output: {
        fieldId: field.id,
        calculationStatus: 'NOT_APPLICABLE',
        value: { status: 'NOT_APPLICABLE' },
      },
    };

  const formula = field.formula!;
  const { mode, scale } = policy.displayRounding;
  const output = (
    value: ResultValue,
    numeric: Numeric,
    effectiveWeight?: string,
  ): Evaluated => {
    if (
      numeric.maximum.compare(zero) <= 0n ||
      numeric.points.compare(zero) < 0n ||
      numeric.points.compare(numeric.maximum) > 0n ||
      numeric.maximum.compare(numericCeiling) >= 0n
    ) {
      throw new OfficialResultsError('calculation.invalid');
    }
    const percentage = normalized(numeric);
    return {
      operand: { status: 'READY', numeric },
      output: {
        fieldId: field.id,
        calculationStatus: 'READY',
        value,
        evaluation: {
          ...(field.outputKind === 'SCORE'
            ? {
                nominalMaxScore: numeric.nominalMaximum.format(scale, mode),
                effectiveMaxScore: numeric.maximum.format(scale, mode),
              }
            : {}),
          normalizedPercentage: percentage.format(6, 'HALF_UP'),
          ...(field.outputKind === 'PASS_FAIL' || field.outputKind === 'SELECT'
            ? {
                displayPercentage: percentage.format(scale, mode),
              }
            : {}),
        },
        ...(effectiveWeight === undefined ? {} : { effectiveWeight }),
      },
    };
  };
  const score = (numeric: Numeric) =>
    output(
      { status: 'RECORDED', score: numeric.points.format(scale, mode) },
      numeric,
    );

  switch (formula.op) {
    case 'SUM_POINTS':
      return score({
        points: sum(included.map((item) => item.numeric.points)),
        maximum: sum(included.map((item) => item.numeric.maximum)),
        nominalMaximum: maximum(field),
      });
    case 'NORMALIZED_AVERAGE':
    case 'WEIGHTED_PERCENTAGE': {
      const weighted = formula.op === 'WEIGHTED_PERCENTAGE';
      const contributions = included.map(({ numeric, index }) => {
        const weight = weighted
          ? fraction(formula.operands[index].weight!)
          : one;
        return { weight, weightedRatio: ratio(numeric).times(weight) };
      });
      const effective = sum(contributions.map((item) => item.weight));
      const points = sum(contributions.map((item) => item.weightedRatio))
        .over(effective)
        .times(hundred);
      return output(
        { status: 'RECORDED', percentage: points.format(scale, mode) },
        { points, maximum: hundred, nominalMaximum: hundred },
        weighted ? effective.format(scale, mode) : undefined,
      );
    }
    case 'SCALE_TO': {
      const target = fraction(formula.targetMaxScore!);
      return score({
        points: ratio(included[0].numeric).times(target),
        maximum: target,
        nominalMaximum: target,
      });
    }
    case 'PASS_THRESHOLD': {
      const input = included[0].numeric;
      const passes =
        normalized(input).compare(fraction(formula.thresholdPercentage!)) >= 0n;
      return output(
        { status: 'RECORDED', outcome: passes ? 'PASS' : 'FAIL' },
        input,
      );
    }
    case 'GRADE_BAND': {
      const input = included[0].numeric;
      const percentage = normalized(input);
      const band = formula.bands!.find(
        (item, index) =>
          percentage.compare(fraction(item.minimum)) >= 0n &&
          (percentage.compare(fraction(item.maximum)) < 0n ||
            (index === formula.bands!.length - 1 &&
              percentage.compare(fraction(item.maximum)) === 0n)),
      );
      if (!band) throw new OfficialResultsError('calculation.invalid');
      return output({ status: 'RECORDED', optionCode: band.code }, input);
    }
  }
}

export function evaluateResultFields(
  definition: ResultDefinition,
  values: ReadonlyMap<string, ResultValue>,
  eligibleOutputs?: ReadonlySet<string>,
): Map<string, ResultCalculation> {
  const fields = new Map(definition.fields.map((field) => [field.id, field]));
  const resolved = new Map<string, Evaluated>();
  const pending = new Set<string>();
  const evaluate = (field: ResultField): Evaluated => {
    const cached = resolved.get(field.id);
    if (cached) return cached;
    if (!field.formula || pending.has(field.id))
      throw new OfficialResultsError('calculation.invalid');
    pending.add(field.id);
    try {
      const operands = field.formula.operands.map(({ fieldId }) => {
        const source = fields.get(fieldId);
        if (!source) throw new OfficialResultsError('calculation.invalid');
        return source.formula
          ? evaluate(source).operand
          : manualOperand(
              source,
              values.get(fieldId),
              definition.calculationPolicy,
            );
      });
      const result = calculate(field, operands, definition.calculationPolicy);
      resolved.set(field.id, result);
      return result;
    } finally {
      pending.delete(field.id);
    }
  };
  return new Map(
    definition.fields
      .filter(
        (field) =>
          field.formula && (!eligibleOutputs || eligibleOutputs.has(field.id)),
      )
      .map((field) => [field.id, evaluate(field).output]),
  );
}
