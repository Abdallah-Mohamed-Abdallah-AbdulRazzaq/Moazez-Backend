import { z } from 'zod/v4';
import { OfficialResultsError } from './official-results.error';
import type { ResultField } from './result-definition';
import {
  normalizeManualValue,
  resultValue,
  type ResultValue,
} from './result-value';

const target = {
  slotId: z.uuid(),
  fieldId: z.uuid(),
  expectedCellVersion: z.number().int().min(0).max(2_147_483_646),
};

const reason = z.string().trim().min(1).max(2000);
export const resultCellOperation = z.discriminatedUnion('operation', [
  z.strictObject({
    ...target,
    operation: z.literal('SET'),
    value: resultValue,
    reason: reason.optional(),
  }),
  z.strictObject({ ...target, operation: z.literal('CLEAR'), reason }),
]);
export type ResultCellOperation = z.infer<typeof resultCellOperation>;

export const resultGridPatch = z.strictObject({
  expectedDefinitionVersionId: z.uuid(),
  expectedSheetRevision: z.number().int().min(1),
  operations: z.array(resultCellOperation).min(1).max(1000),
  changeReason: reason.optional(),
});
export type ResultGridPatch = z.infer<typeof resultGridPatch>;

export function checkedResultValue(
  field: ResultField,
  operation: ResultCellOperation,
): ResultValue {
  if (field.kind === 'CALCULATED')
    throw new OfficialResultsError('schema.protected');
  if (operation.operation === 'CLEAR') return { status: 'MISSING' };
  const value = operation.value;
  if (value.status === 'MISSING')
    throw new OfficialResultsError('cell.invalid_value');
  if (field.stateReasonRequired.includes(value.status) && !operation.reason) {
    throw new OfficialResultsError('cell.reason_required');
  }
  return normalizeManualValue(field, value);
}
