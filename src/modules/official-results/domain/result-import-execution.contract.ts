import { z } from 'zod/v4';

export const resultApplyImportJob = 'official-results-apply';
export const importCommitBounds = { timeout: 20_000 };
const uuid = z.uuid();
const revision = z.number().int().positive();
const reason = z.string().trim().min(1).max(2_000);
const exactSelection = z
  .array(uuid)
  .min(1)
  .max(200)
  .refine(
    (ids) => ids.every((id, index) => index === 0 || ids[index - 1] < id),
    'Selected sheet IDs must be sorted and unique',
  );
export const applyImportInputs = {
  confirm: z.strictObject({
    previewId: uuid,
    previewDigest: z.string().regex(/^[a-f0-9]{64}$/u),
    expectedBatchRevision: revision,
    selectedSheetIds: exactSelection,
    acknowledgedWarningIds: z
      .array(uuid)
      .max(10_000)
      .refine((ids) => new Set(ids).size === ids.length)
      .transform((ids) => ids.sort()),
    clearReason: reason.optional(),
  }),
  cancel: z.strictObject({ expectedBatchRevision: revision, reason }),
  retry: z.strictObject({ expectedBatchRevision: revision }),
};
export type ApplyImportInput<K extends keyof typeof applyImportInputs> =
  z.infer<(typeof applyImportInputs)[K]>;
