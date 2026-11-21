import { z } from 'zod/v4';
import { resultValue } from '../domain/result-value';

const uuid = z.uuid();
const count = z.number().int().nonnegative();
const digest = z.string().length(64);
const instant = z.iso.datetime();
const summary = z.object({
  parsedDataRows: count,
  validRows: count,
  invalidRows: count,
  rowsWithWarnings: count,
  omittedRows: count,
  selectedSheets: count,
  selectedSlots: count,
  selectedEditableFields: count,
  changedCells: count,
  unchangedCells: count,
  conflictingCells: count,
  blockingIssues: count,
  warningIssues: count,
  findingsTruncated: z.boolean(),
});
const context = z.object({
  sheetId: uuid,
  classroomId: uuid,
  groupId: uuid,
  reportingPeriodId: uuid,
  rosterRevision: count,
  policyRevision: count,
  draftDefinitionVersionId: uuid,
  sheetRevision: count,
  snapshotDataGeneration: count,
  correctionUnitId: uuid.nullable(),
});
const binding = z.object({
  formatVersion: z.literal('MOAZEZ_REVIEW_BINDING_V1'),
  schoolId: uuid,
  actorId: uuid,
  batchId: uuid,
  batchRevision: count,
  sourceVersion: count,
  sourceByteSha256: digest,
  exportId: uuid,
  exportRef: uuid.nullable(),
  previewId: uuid,
  previewRevision: count,
  selectedSheetIds: z.array(uuid),
  fields: z.array(z.object({ sheetId: uuid, fieldIds: z.array(uuid) })),
  context: z.array(context),
  changeSetSha256: digest,
  validationReadSetSha256: digest,
  requiredWarningIds: z.array(uuid),
  clearReason: z.string().nullable(),
  expiresAt: instant,
});
const batch = z.object({
  batchId: uuid,
  exportId: uuid,
  batchRevision: count,
  sourceVersion: count,
  status: z.enum([
    'UPLOADED',
    'VALIDATING',
    'CORRECTIONS_REQUIRED',
    'READY_TO_CONFIRM',
    'NO_CHANGES',
    'APPLYING',
    'APPLIED',
    'PARTIALLY_APPLIED',
    'FAILED',
    'CANCELLED',
    'EXPIRED',
  ]),
  summary,
  canConfirm: z.boolean(),
  failureCode: z.string().optional(),
  preview: z
    .object({
      id: uuid,
      revision: count,
      digest,
      digestAlgorithm: z.literal('SHA256_CANONICAL_JSON_V1'),
      binding,
    })
    .optional(),
  sheetUnits: z.array(
    z.object({
      sheetId: uuid,
      changedCells: count,
      canConfirm: z.boolean(),
      status: z.enum(['READY', 'NO_CHANGES', 'BLOCKED', 'EXCLUDED']),
      observedDataGeneration: count,
      expectedSheetRevision: count,
    }),
  ),
  createdAt: instant,
  expiresAt: instant,
});
const page = (item: z.ZodType) =>
  z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  });
const issue = z.object({
  id: uuid,
  code: z.string(),
  severity: z.enum(['ERROR', 'CONFLICT', 'WARNING', 'INFO']),
  message: z.string(),
  messageAr: z.string(),
  action: z.string(),
  sheetId: uuid.optional(),
  rowRef: uuid.optional(),
  fieldId: uuid.optional(),
  location: z
    .object({ record: count, line: count.optional(), column: count.optional() })
    .optional(),
  comparison: z
    .object({
      baseline: resultValue,
      current: resultValue,
      incoming: resultValue,
      currentVersion: count,
    })
    .optional(),
});
const change = z.object({
  sheetId: uuid,
  rowRef: uuid,
  slotId: uuid,
  fieldId: uuid,
  expectedCellVersion: count,
  operation: z.enum(['SET', 'CLEAR']),
  before: resultValue,
  after: resultValue,
  value: resultValue.optional(),
  reason: z.string().optional(),
});
const row = z.object({
  rowRef: uuid.optional(),
  sheetId: uuid.optional(),
  slotId: uuid.optional(),
  record: count,
  line: count,
  status: z.enum(['VALID', 'INVALID', 'EXCLUDED']),
  changedCells: count,
  unchangedCells: count,
});
export const importOutputs = {
  batch,
  list: page(batch),
  issues: page(issue),
  changes: page(change),
  rows: page(row),
};
