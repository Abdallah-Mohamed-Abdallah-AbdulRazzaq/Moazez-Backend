import { z } from 'zod/v4';
import { resultAuthoringLabel, resultDecimalString } from './result-definition';
import { periodSelector, resultIdList } from './result-scope';

const uuid = z.uuid();
const revision = z.number().int().min(0);
const identity = z.strictObject({ groupId: uuid, releaseUnitId: uuid });
export const resultAggregateDefinition = z.strictObject({
  code: z.string().regex(/^[A-Za-z0-9_]{1,64}$/u),
  label: resultAuthoringLabel,
  reportingPeriodSelector: periodSelector,
  inputs: z
    .array(
      identity.extend({
        fieldId: uuid,
        weight: resultDecimalString.optional(),
      }),
    )
    .min(1)
    .max(200),
  operation: z.enum([
    'SUM_POINTS',
    'NORMALIZED_AVERAGE',
    'WEIGHTED_PERCENTAGE',
  ]),
  calculationPolicy: z.strictObject({
    displayRounding: z.strictObject({
      mode: z.enum(['HALF_UP', 'HALF_EVEN', 'DOWN']),
      scale: z.number().int().min(0).max(6),
    }),
  }),
  audiences: z
    .array(z.enum(['STUDENT', 'PARENT', 'STAFF']))
    .min(1)
    .max(3)
    .refine((list) => list.length === new Set(list).size),
  requiredCoverage: z.array(identity).min(1).max(200),
});
export const aggregateInputs = {
  profile: z
    .strictObject({
      profileId: uuid.optional(),
      expectedProfileRevision: revision,
      definition: resultAggregateDefinition,
    })
    .refine(
      (value) => Boolean(value.profileId) === value.expectedProfileRevision > 0,
    ),
  candidate: z.strictObject({
    studentId: uuid,
    reportingPeriodId: uuid,
    profileVersionId: uuid,
    sourcePublicationIds: resultIdList,
  }),
  publish: z.strictObject({
    candidateId: uuid,
    contentDigest: z.string().regex(/^[0-9a-f]{64}$/u),
    expectedCandidateRevision: revision.min(1),
    expectedCurrentAggregatePublicationId: uuid.nullable(),
  }),
};
export const resultAggregateValue = z.object({
  overallScore: resultDecimalString.nullable(),
  overallMaxScore: resultDecimalString.nullable(),
  completeness: z.enum(['COMPLETE', 'PARTIAL', 'INCOMPLETE']),
});
export type AggregateInput<K extends keyof typeof aggregateInputs> = z.infer<
  (typeof aggregateInputs)[K]
>;
export type AggregateDefinition = z.infer<typeof resultAggregateDefinition>;
export type AggregateValue = z.infer<typeof resultAggregateValue>;
