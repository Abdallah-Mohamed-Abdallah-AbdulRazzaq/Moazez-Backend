import { z } from 'zod/v4';
import { OfficialResultsError } from './official-results.error';
import {
  decimalMicros,
  resultDecimalString,
  type ResultField,
} from './result-definition';

const statusOnly = z.strictObject({
  status: z.enum(['MISSING', 'ABSENT', 'EXCUSED', 'NOT_APPLICABLE']),
});
const recorded = z.literal('RECORDED');
export const resultValue = z.union([
  statusOnly,
  z.strictObject({ status: recorded, score: resultDecimalString }),
  z.strictObject({ status: recorded, percentage: resultDecimalString }),
  z.strictObject({
    status: recorded,
    text: z
      .string()
      .min(1)
      .max(5000)
      .refine((value) => !value.includes('\u0000')),
  }),
  z.strictObject({ status: recorded, optionCode: z.string().min(1).max(64) }),
  z.strictObject({ status: recorded, outcome: z.enum(['PASS', 'FAIL']) }),
  z.strictObject({ status: recorded, boolean: z.boolean() }),
]);
export type ResultValue = z.infer<typeof resultValue>;

export function formatDecimalMicros(value: bigint, scale: number): string {
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  const whole = absolute / 1_000_000n;
  const fraction = (absolute % 1_000_000n).toString().padStart(6, '0');
  return scale > 0
    ? `${sign}${whole}.${fraction.slice(0, scale)}`
    : `${sign}${whole}`;
}

function numeric(
  value: string,
  minimum: string,
  maximum: string,
  scale: number,
): string {
  if ((value.split('.')[1]?.length ?? 0) > scale)
    throw new OfficialResultsError('cell.invalid_value');
  const rounded = decimalMicros(value);
  if (rounded < decimalMicros(minimum) || rounded > decimalMicros(maximum)) {
    throw new OfficialResultsError('cell.invalid_value');
  }
  return formatDecimalMicros(rounded, scale);
}

export function normalizeManualValue(
  field: ResultField,
  input: unknown,
): ResultValue {
  const parsed = resultValue.safeParse(input);
  if (
    !parsed.success ||
    field.kind === 'CALCULATED' ||
    !field.allowedStates.includes(parsed.data.status)
  ) {
    throw new OfficialResultsError('cell.invalid_value');
  }
  const value = parsed.data;
  if (value.status !== 'RECORDED') return value;
  const rules = field.constraints;
  if (field.kind === 'SCORE' && 'score' in value && 'maxScore' in rules) {
    return {
      status: 'RECORDED',
      score: numeric(
        value.score,
        rules.minScore,
        rules.maxScore,
        rules.inputScale,
      ),
    };
  }
  if (
    field.kind === 'PERCENTAGE' &&
    'percentage' in value &&
    'maxPercentage' in rules
  ) {
    return {
      status: 'RECORDED',
      percentage: numeric(
        value.percentage,
        rules.minPercentage,
        rules.maxPercentage,
        rules.inputScale,
      ),
    };
  }
  if (
    field.kind === 'TEXT' &&
    'text' in value &&
    'maxCharacters' in rules &&
    [...value.text].length <= rules.maxCharacters
  ) {
    return value;
  }
  if (
    field.kind === 'SELECT' &&
    'optionCode' in value &&
    field.options?.some(
      (option) => option.active && option.code === value.optionCode,
    )
  ) {
    return value;
  }
  if (
    (field.kind === 'BOOLEAN' && 'boolean' in value) ||
    (field.kind === 'PASS_FAIL' && 'outcome' in value)
  )
    return value;
  throw new OfficialResultsError('cell.invalid_value');
}

export function cellColumns(value: ResultValue) {
  return {
    status: value.status,
    numericValue:
      'score' in value
        ? value.score
        : 'percentage' in value
          ? value.percentage
          : null,
    textValue: 'text' in value ? value.text : null,
    optionCode: 'optionCode' in value ? value.optionCode : null,
    outcome: 'outcome' in value ? value.outcome : null,
    booleanValue: 'boolean' in value ? value.boolean : null,
  };
}

export function storedCellValue(row: {
  status: ResultValue['status'];
  fieldKind: ResultField['kind'];
  numericValue: { toString(): string } | null;
  textValue: string | null;
  optionCode: string | null;
  outcome: 'PASS' | 'FAIL' | null;
  booleanValue: boolean | null;
}): ResultValue {
  if (row.status !== 'RECORDED') return { status: row.status };
  if (row.fieldKind === 'SCORE' && row.numericValue !== null)
    return { status: 'RECORDED', score: row.numericValue.toString() };
  if (row.fieldKind === 'PERCENTAGE' && row.numericValue !== null)
    return { status: 'RECORDED', percentage: row.numericValue.toString() };
  if (row.fieldKind === 'TEXT' && row.textValue !== null)
    return { status: 'RECORDED', text: row.textValue };
  if (row.fieldKind === 'SELECT' && row.optionCode !== null)
    return { status: 'RECORDED', optionCode: row.optionCode };
  if (row.fieldKind === 'PASS_FAIL' && row.outcome !== null)
    return { status: 'RECORDED', outcome: row.outcome };
  if (row.fieldKind === 'BOOLEAN' && row.booleanValue !== null)
    return { status: 'RECORDED', boolean: row.booleanValue };
  throw new OfficialResultsError('cell.invalid_value');
}
