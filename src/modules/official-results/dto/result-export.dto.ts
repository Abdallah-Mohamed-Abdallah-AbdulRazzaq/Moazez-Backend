import { z } from 'zod/v4';
import { exportRequest } from '../domain/result-export.contract';

const uuid = z.uuid();
const count = z.number().int().nonnegative();
const dates = z.iso.datetime();
const blocker = z.object({ code: z.string() });
const summary = z.object({
  sheets: z.array(
    z.object({
      sheetId: uuid,
      classroomId: uuid,
      groupId: uuid,
      classroomLabel: z.string(),
      groupLabel: z.string(),
      definitionVersionIds: z.array(uuid),
      fields: z.array(
        z.object({
          fieldId: uuid,
          code: z.string(),
          label: z.object({ ar: z.string(), en: z.string() }),
          optionCodes: z.array(z.string()).optional(),
        }),
      ),
      rows: count,
      sheetRevision: count,
      dataGeneration: count,
      rosterGeneration: count,
      policyRevision: count,
    }),
  ),
  sheetCount: count,
  rowCount: count,
});
const file = z.object({
  fileId: uuid,
  filename: z.string(),
  mediaType: z.string(),
  sizeBytes: count,
  downloadPath: z.string(),
  expiresAt: dates,
});
const saved = z.object({
  exportId: uuid,
  status: z.enum(['QUEUED', 'GENERATING', 'READY', 'FAILED', 'EXPIRED']),
  format: exportRequest.shape.format,
  mode: exportRequest.shape.mode,
  createdAt: dates,
  reuseUntil: dates,
  expiresAt: dates,
  manifestSummary: summary,
  files: z.array(file),
  failureCode: z.string().optional(),
});
export const exportOutputs = {
  preview: z.object({
    previewId: uuid,
    previewDigest: z.string().length(64),
    expiresAt: dates,
    selection: exportRequest,
    summary,
    impacts: z.array(
      z.object({
        kind: z.literal('EXPORT_SHEET'),
        resourceId: uuid,
        before: z.object({ files: count }),
        after: z.object({ rows: count, fields: count }),
      }),
    ),
    blockers: z.array(blocker),
  }),
  export: saved,
  list: z.object({
    items: z.array(saved),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  }),
};
const bytes = { schema: { type: 'string', format: 'binary' } };
export const exportMedia = {
  'text/csv': bytes,
  'application/zip': bytes,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': bytes,
};
