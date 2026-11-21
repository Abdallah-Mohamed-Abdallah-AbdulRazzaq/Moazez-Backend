import { z } from 'zod/v4';
import { resultIdList } from './result-scope';
import { resultValue, type ResultValue } from './result-value';
import type { ResultCellOperation } from './result-cell-operation';

export const resultValidateJob = 'official-results-validate';
const uuid = z.uuid();
const revision = z.number().int().positive();
const reason = z.string().trim().min(1).max(2_000);

export const validateImportOptions = z
  .strictObject({
    clearReason: reason.optional(),
    reasons: z
      .array(z.strictObject({ rowRef: uuid, fieldId: uuid, reason }))
      .max(10_000)
      .optional(),
    selectedSheetIds: resultIdList.optional(),
  })
  .refine((input) => {
    const keys = (input.reasons ?? []).map(
      (item) => item.rowRef + ':' + item.fieldId,
    );
    return new Set(keys).size === keys.length;
  });

const correctionTarget = {
  rowRef: uuid,
  fieldId: uuid,
  expectedCellVersion: z.number().int().nonnegative().optional(),
};
const correction = z.discriminatedUnion('operation', [
  z.strictObject({
    ...correctionTarget,
    operation: z.literal('SET'),
    value: resultValue,
    reason: reason.optional(),
  }),
  z.strictObject({
    ...correctionTarget,
    operation: z.literal('CLEAR'),
    reason: reason.optional(),
  }),
]);
export const importInputs = {
  intake: z.strictObject({
    exportId: uuid,
    expectedBatchRevision: revision.optional(),
    validateOptions: validateImportOptions.optional(),
  }),
  correct: z.strictObject({
    expectedBatchRevision: revision,
    changes: z
      .array(correction)
      .min(1)
      .max(10_000)
      .refine(
        (changes) =>
          new Set(changes.map((item) => item.rowRef + ':' + item.fieldId))
            .size === changes.length,
      ),
    clearReason: reason.optional(),
  }),
  revalidate: z.strictObject({
    expectedBatchRevision: revision,
    selectedSheetIds: resultIdList.optional(),
  }),
};
export type ImportInput<K extends keyof typeof importInputs> = z.infer<
  (typeof importInputs)[K]
>;
export type ImportOptions = z.infer<typeof validateImportOptions>;
export type ImportCorrection = z.infer<typeof correction>;

export const importIssueCatalog = {
  malformed_csv: 'The file has malformed CSV records or inconsistent columns',
  invalid_encoding: 'The file must be UTF-8 without NUL characters',
  limit_exceeded: 'The file or reviewed unit exceeds an operation limit',
  missing_header: 'An exported column is missing',
  unknown_header: 'A column was not included in the exported selection',
  duplicate_header: 'The file contains a duplicate column',
  unknown_row: 'The row is not part of this export',
  duplicate_row: 'The file repeats an exported row',
  identity_changed:
    'A protected identity value differs from the original export',
  export_expired: 'This export has expired for draft entry',
  readonly_export: 'Published result exports cannot be used for draft entry',
  roster_changed: 'Reconcile the current student placement before importing',
  target_locked: 'The target draft is not currently open to this editor',
  score_out_of_range: 'The score is outside the field limits',
  invalid_numeric_value:
    'The numeric value has unsupported syntax or precision',
  invalid_option: 'Use an active option code from the export',
  invalid_state: 'The value or status is not supported for this field',
  contradictory_command:
    'The value and status columns request incompatible changes',
  value_required: 'A recorded status requires a value',
  text_too_long: 'The text exceeds the field limit',
  clear_reason_required: 'An explicit clear requires a reviewed reason',
  clear_acknowledgment: 'Acknowledge this explicit reset of the saved result',
  status_reason_required: 'This status change requires a reviewed reason',
  readonly_value_changed: 'A protected read-only cell was changed',
  formula_not_allowed: 'Formula cells are not accepted',
  workbook_invalid: 'The workbook cannot be admitted by the declared format',
  cell_conflict: 'The proposed value conflicts with a more recent draft value',
  preview_stale: 'The correction refers to an older cell version',
  normalized_input: 'Whitespace or numeric glyphs were normalized',
  roster_added: 'Current roster has eligible students absent from this source',
  draft_incomplete: 'The proposed draft has incomplete required values',
} as const;

export type ImportIssueSuffix = keyof typeof importIssueCatalog;
export const importIssueMessagesAr: Record<ImportIssueSuffix, string> = {
  malformed_csv: 'صيغة CSV تالفة أو عدد الأعمدة غير متطابق',
  invalid_encoding: 'يجب أن يكون ترميز الملف UTF-8 وألا يحتوي على محارف فارغة',
  limit_exceeded: 'تجاوز الملف أو الكشف حد المعالجة المسموح',
  missing_header: 'أحد الأعمدة المصدّرة مفقود',
  unknown_header: 'يحتوي الملف على عمود خارج التحديد المصدّر',
  duplicate_header: 'يتكرر أحد أعمدة الملف',
  unknown_row: 'الصف غير موجود في هذا التصدير',
  duplicate_row: 'تكرر صف من الملف المصدّر',
  identity_changed: 'تغيّرت قيمة تعريف محمية عن التصدير الأصلي',
  export_expired: 'انتهت صلاحية التصدير لإدخال المسودات',
  readonly_export: 'تصدير النتائج المنشورة مخصص للقراءة',
  roster_changed: 'يجب مراجعة تسجيل الطالب قبل الاستيراد',
  target_locked: 'المسودة غير متاحة لهذا المحرر حاليًا',
  score_out_of_range: 'الدرجة خارج حدود الحقل',
  invalid_numeric_value: 'صيغة الرقم أو دقته غير مدعومة',
  invalid_option: 'استخدم رمز خيار نشط من التصدير',
  invalid_state: 'الحقل لا يدعم هذه القيمة أو الحالة',
  contradictory_command: 'تعارض بين القيمة والحالة',
  value_required: 'حالة الدرجة المسجّلة تتطلب قيمة',
  text_too_long: 'تجاوز النص طول الحقل المسموح',
  clear_reason_required: 'يتطلب المسح الصريح سببًا للمراجعة',
  clear_acknowledgment: 'أقر بالمسح الصريح لهذه النتيجة المحفوظة',
  status_reason_required: 'يتطلب تغيير الحالة سببًا للمراجعة',
  readonly_value_changed: 'تغيّرت خلية محمية للقراءة',
  formula_not_allowed: 'خلايا الصيغ غير مقبولة',
  workbook_invalid: 'ملف المصنف لا يطابق الصيغة المدعومة',
  cell_conflict: 'القيمة المقترحة تتعارض مع قيمة أحدث في المسودة',
  preview_stale: 'يشير التصحيح إلى إصدار سابق للخلية',
  normalized_input: 'تم توحيد المسافات أو كتابة الأرقام',
  roster_added: 'يوجد طلاب مؤهلون جدد لا يشملهم هذا الملف',
  draft_incomplete: 'المسودة المقترحة تحتوي على قيم مطلوبة غير مكتملة',
};
export type ImportFinding = {
  id: string;
  code: string;
  severity: 'ERROR' | 'CONFLICT' | 'WARNING' | 'INFO';
  message: string;
  messageAr: string;
  action: string;
  location?: { record: number; line?: number; column?: number };
  sheetId?: string;
  rowRef?: string;
  fieldId?: string;
  comparison?: {
    baseline: ResultValue;
    current: ResultValue;
    incoming: ResultValue;
    currentVersion: number;
  };
};

export class ResultImportFileError extends Error {
  constructor(readonly issue: ImportIssueSuffix) {
    super(importIssueCatalog[issue]);
  }
}

export type ImportChange = ResultCellOperation & {
  sheetId: string;
  rowRef: string;
  before: ResultValue;
  after: ResultValue;
};

export type ImportReadCell = {
  sheetId: string;
  slotId: string;
  fieldId: string;
  expectedCellVersion: number;
  value: ResultValue;
};

export type ImportSheetBinding = {
  sheetId: string;
  classroomId: string;
  groupId: string;
  reportingPeriodId: string;
  rosterRevision: number;
  policyRevision: number;
  draftDefinitionVersionId: string;
  sheetRevision: number;
  snapshotDataGeneration: number;
  correctionUnitId: string | null;
  slots: { slotId: string; placementRevision: number; enrollmentId: string }[];
};
export type ImportUnit = {
  context: ImportSheetBinding;
  changes: ImportChange[];
  validationReadSet: ImportReadCell[];
  status: 'READY' | 'NO_CHANGES' | 'BLOCKED' | 'EXCLUDED';
};
export type ImportRowSummary = {
  rowRef?: string;
  sheetId?: string;
  slotId?: string;
  record: number;
  line: number;
  status: 'VALID' | 'INVALID' | 'EXCLUDED';
  changedCells: number;
  unchangedCells: number;
};
export type ImportReviewBinding = {
  formatVersion: 'MOAZEZ_REVIEW_BINDING_V1';
  schoolId: string;
  actorId: string;
  batchId: string;
  batchRevision: number;
  sourceVersion: number;
  sourceByteSha256: string;
  exportId: string;
  exportRef: string | null;
  previewId: string;
  previewRevision: number;
  selectedSheetIds: string[];
  fields: { sheetId: string; fieldIds: string[] }[];
  context: Omit<ImportSheetBinding, 'slots'>[];
  changeSetSha256: string;
  validationReadSetSha256: string;
  requiredWarningIds: string[];
  clearReason: string | null;
  expiresAt: string;
};
export type ImportSummary = {
  parsedDataRows: number;
  validRows: number;
  invalidRows: number;
  rowsWithWarnings: number;
  omittedRows: number;
  selectedSheets: number;
  selectedSlots: number;
  selectedEditableFields: number;
  changedCells: number;
  unchangedCells: number;
  conflictingCells: number;
  blockingIssues: number;
  warningIssues: number;
  findingsTruncated: boolean;
};

export function blankImportSummary(): ImportSummary {
  return {
    parsedDataRows: 0,
    validRows: 0,
    invalidRows: 0,
    rowsWithWarnings: 0,
    omittedRows: 0,
    selectedSheets: 0,
    selectedSlots: 0,
    selectedEditableFields: 0,
    changedCells: 0,
    unchangedCells: 0,
    conflictingCells: 0,
    blockingIssues: 0,
    warningIssues: 0,
    findingsTruncated: false,
  };
}
