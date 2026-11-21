import { normalizeManualValue, type ResultValue } from './result-value';
import { resultDecimalString, type ResultField } from './result-definition';
import { resultContentDigest } from './result-content-digest';
import type { ImportIssueSuffix } from './result-import.contract';

export type RequestedValue =
  | { kind: 'KEEP' }
  | { kind: 'SET'; value: ResultValue; normalized?: boolean }
  | { kind: 'CLEAR'; value: { status: 'MISSING' }; normalized?: boolean }
  | { kind: 'ISSUE'; issue: ImportIssueSuffix };

function issue(code: ImportIssueSuffix): RequestedValue {
  return { kind: 'ISSUE', issue: code };
}

export function normalizeImportValue(
  field: ResultField,
  value: ResultValue,
  normalized = false,
): RequestedValue {
  if (field.kind === 'CALCULATED') return issue('readonly_value_changed');
  if (value.status === 'MISSING' || !field.allowedStates.includes(value.status))
    return issue('invalid_state');
  if (
    'text' in value &&
    'maxCharacters' in field.constraints &&
    [...value.text].length > field.constraints.maxCharacters
  )
    return issue('text_too_long');
  if (
    'optionCode' in value &&
    !field.options?.some(
      (option) => option.active && option.code === value.optionCode,
    )
  )
    return issue('invalid_option');
  const decimal =
    'score' in value
      ? value.score
      : 'percentage' in value
        ? value.percentage
        : null;
  if (decimal !== null && 'inputScale' in field.constraints) {
    if (
      !resultDecimalString.safeParse(decimal).success ||
      (decimal.split('.')[1]?.length ?? 0) > field.constraints.inputScale
    )
      return issue('invalid_numeric_value');
    try {
      return {
        kind: 'SET',
        value: normalizeManualValue(field, value),
        normalized,
      };
    } catch {
      return issue('score_out_of_range');
    }
  }
  try {
    return {
      kind: 'SET',
      value: normalizeManualValue(field, value),
      normalized,
    };
  } catch {
    return issue('invalid_state');
  }
}

export function parseImportCommand(
  field: ResultField,
  rawValue: string,
  rawState: string,
  decodeText: (value: string) => string,
): RequestedValue {
  const state = rawState.trim();
  const bareValue = field.kind === 'TEXT' ? rawValue : rawValue.trim();
  const trimmed = state !== rawState || bareValue !== rawValue;
  if (!bareValue && !state) return { kind: 'KEEP' };
  if (state === 'CLEAR')
    return bareValue
      ? issue('contradictory_command')
      : { kind: 'CLEAR', value: { status: 'MISSING' }, normalized: trimmed };
  if (state === 'ABSENT' || state === 'EXCUSED' || state === 'NOT_APPLICABLE')
    return bareValue
      ? issue('contradictory_command')
      : normalizeImportValue(field, { status: state }, trimmed);
  if (state && state !== 'RECORDED') return issue('invalid_state');
  if (!bareValue) return issue('value_required');
  const status = 'RECORDED' as const;
  switch (field.kind) {
    case 'SCORE':
    case 'PERCENTAGE': {
      const decimal = bareValue.replace(/[٠-٩۰-۹٫]/gu, (digit) => {
        if (digit === '٫') return '.';
        const code = digit.charCodeAt(0);
        return String(code - (code >= 0x06f0 ? 0x06f0 : 0x0660));
      });
      return normalizeImportValue(
        field,
        field.kind === 'SCORE'
          ? { status, score: decimal }
          : { status, percentage: decimal },
        trimmed || decimal !== bareValue,
      );
    }
    case 'TEXT': {
      const text = decodeText(bareValue);
      return text
        ? normalizeImportValue(field, { status, text }, trimmed)
        : issue('value_required');
    }
    case 'SELECT':
      return normalizeImportValue(
        field,
        { status, optionCode: decodeText(bareValue) },
        trimmed,
      );
    case 'PASS_FAIL':
      return bareValue === 'PASS' || bareValue === 'FAIL'
        ? normalizeImportValue(field, { status, outcome: bareValue }, trimmed)
        : issue('invalid_option');
    case 'BOOLEAN':
      return bareValue === 'true' || bareValue === 'false'
        ? normalizeImportValue(
            field,
            { status, boolean: bareValue === 'true' },
            trimmed,
          )
        : issue('invalid_option');
    case 'CALCULATED':
      return issue('readonly_value_changed');
  }
}

export function mergeResultImport(
  baseline: ResultValue,
  incoming: ResultValue,
  current: ResultValue,
) {
  const base = resultContentDigest(baseline);
  const next = resultContentDigest(incoming);
  const saved = resultContentDigest(current);
  if (next === base) return 'KEEP_CURRENT';
  if (next === saved) return 'CONVERGED';
  return saved === base ? 'APPLY' : 'CONFLICT';
}
