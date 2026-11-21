import { z } from 'zod/v4';
import { fieldMappingSchema } from './result-mapping';
import { resultIdList } from './result-scope';

const uuid = z.uuid();
const revision = z.number().int().min(1);
const reason = z.string().trim().min(1).max(2000);
const revisionBinding = {
  slotId: uuid,
  expectedPlacementRevision: revision,
  reason,
};

export const rosterPreviewInput = z.strictObject({
  expectedRosterGeneration: revision,
  rosterAsOf: z.iso.datetime(),
  selectedSlotIds: resultIdList.optional(),
});

export const rosterDecision = z.discriminatedUnion('action', [
  z.strictObject({
    ...revisionBinding,
    action: z.enum([
      'KEEP_HISTORICAL',
      'CLOSE_DRAFT',
      'EXEMPT_GROUP',
      'REINSTATE_GROUP',
    ]),
  }),
  z.strictObject({
    ...revisionBinding,
    action: z.literal('MOVE_DRAFT'),
    destinationSheetId: uuid,
    destinationEnrollmentId: uuid,
    fieldMapping: z.array(fieldMappingSchema).max(256),
  }),
]);

export const rosterReconcileInput = z.strictObject({
  expectedRosterGeneration: revision,
  previewId: uuid,
  previewDigest: z.string().regex(/^[a-f0-9]{64}$/u),
  decisions: z.array(rosterDecision).max(200),
});

export type RosterPreviewInput = z.infer<typeof rosterPreviewInput>;
export type RosterReconcileInput = z.infer<typeof rosterReconcileInput>;
export type RosterDecision = z.infer<typeof rosterDecision>;
