import { z } from 'zod/v4';
import { academicSelector, resultIdList } from './result-scope';
import type { ResultDefinition, ResultField } from './result-definition';
import type { ResultValue } from './result-value';

export const resultsBulkQueue = 'official-results-bulk';
export const resultsExportJob = 'official-results-export';
export const resultsBulkReconcileJob = 'official-results-bulk-reconcile';
export const resultsReconcileInterval = 60_000;

export const exportRequest = z.strictObject({
  reportingPeriodId: z.uuid(),
  academicScope: academicSelector,
  groupIds: resultIdList,
  format: z.enum(['CSV', 'XLSX']),
  mode: z.enum(['EDIT_DRAFT', 'READ_PUBLISHED']),
  selectedFieldIds: resultIdList.optional(),
  selectedSlotIds: z
    .array(z.uuid())
    .min(1)
    .max(25000)
    .refine((ids) => new Set(ids).size === ids.length)
    .transform((ids) => ids.sort())
    .optional(),
});

export const exportCreate = z.strictObject({
  previewId: z.uuid(),
  previewDigest: z.string().regex(/^[a-f0-9]{64}$/u),
});

export type ExportRequest = z.infer<typeof exportRequest>;
export type ExportCreate = z.infer<typeof exportCreate>;

export const identityHeaders = [
  'export_ref',
  'row_ref',
  'sheet_ref',
  'slot_ref',
  'enrollment_ref',
  'student_code',
  'student_name_ar',
  'school',
  'academic_year',
  'reporting_period',
  'term',
  'stage',
  'grade',
  'section',
  'classroom',
  'group',
  'schema_version',
  'exported_at_utc',
] as const;

export type ExportIdentity = Omit<
  Record<(typeof identityHeaders)[number], string>,
  'export_ref' | 'row_ref' | 'schema_version' | 'exported_at_utc'
>;

export type ExportBaseCell = {
  fieldId: string;
  value: ResultValue;
  version: number;
};

export type ExportRow = {
  identity: ExportIdentity;
  studentId: string;
  placementRevision: number;
  slotRevision: number;
  publicationIds: string[];
  base: ExportBaseCell[];
};

export type ExportSheetContext = {
  id: string;
  definitionVersionId: string;
  definitionDigest: string;
  sheetRevision: number;
  dataGeneration: number;
  rosterGeneration: number;
  policyRevision: number;
  correctionUnitId: string | null;
  classroomId: string;
  groupId: string;
};

export type ExportSheetPlan = {
  context: ExportSheetContext;
  definition: ResultDefinition;
  fields: ResultField[];
  rows: ExportRow[];
  groupLabel: string;
  classroomLabel: string;
  filenameCodes: string[];
  uploadBytes: number;
  maxRows: number;
};

export type ExportManifest = {
  version: 'MOAZEZ_RESULTS_CSV_V1' | 'MOAZEZ_RESULTS_XLSX_V1';
  codec: 'MOAZEZ_TEXT_ESCAPE_V1' | 'XLSX_TYPED';
  exportId: string;
  exportRef: string;
  schoolId: string;
  creatorId: string;
  request: ExportRequest;
  exportedAt: string;
  reuseUntil: string;
  headers: string[];
  fields: ResultField[];
  sheets: ExportSheetContext[];
  rows: (ExportRow & { rowRef: string; protectedValues: string[] })[];
};
