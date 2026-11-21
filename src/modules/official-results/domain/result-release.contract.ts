import { z } from 'zod/v4';
import { resultCellOperation } from './result-cell-operation';
import {
  resultDefinitionResolvedSchema,
  resultLabel,
} from './result-definition';
import { resultIdList } from './result-scope';
import { resultValue } from './result-value';

const uuid = z.uuid();
const revision = z.number().int().min(1);
const generation = z.number().int().min(0);
const digest = z.string().regex(/^[0-9a-f]{64}$/u);
const reason = z.string().trim().min(1).max(2000);
const candidateRef = z.strictObject({
  candidateId: uuid,
  contentDigest: digest,
  expectedCandidateRevision: revision,
});
const unit = z.strictObject({
  slotId: uuid,
  releaseUnitId: uuid,
  expectedSlotRevision: revision,
});
const confirm = z.strictObject({
  previewId: uuid,
  previewDigest: digest,
  expectedPublicationGeneration: generation,
});

export const releaseInputs = {
  capture: z.strictObject({
    sheetId: uuid,
    expectedSheetRevision: revision,
    intent: z.enum(['REVIEW', 'DIRECT_PUBLICATION']),
    units: z.array(unit).min(1).max(200),
  }),
  decide: candidateRef
    .extend({
      candidateKind: z.enum(['RESULT_RELEASE', 'AGGREGATE']),
      decision: z.enum(['APPROVE', 'RETURN']),
      comment: reason.optional(),
    })
    .refine(
      (value) => value.decision === 'APPROVE' || value.comment !== undefined,
    ),
  publish: z.strictObject({
    mode: z.enum(['APPROVED', 'DIRECT', 'APPROVE_AND_PUBLISH']),
    candidateRefs: z
      .array(
        candidateRef.extend({
          expectedCurrentPublicationId: uuid.nullable(),
          expectedPublicationGeneration: generation,
        }),
      )
      .min(1)
      .max(200),
  }),
  correction: z.strictObject({
    publicationId: uuid,
    expectedRevision: revision,
    expectedPublicationGeneration: generation,
    reason,
    operations: z.array(resultCellOperation).min(1).max(1000).optional(),
  }),
  revoke: z.strictObject({
    expectedPublicationId: uuid,
    expectedRevision: revision,
    expectedPublicationGeneration: generation,
    reason,
  }),
  topologyPreview: z.strictObject({
    expectedPublicationGeneration: generation,
    expectedActivePublicationIds: resultIdList,
    targetDefinitionVersionId: uuid,
    candidateRefs: z.array(candidateRef).min(1).max(64),
    preservedPublicationIds: z
      .array(uuid)
      .max(64)
      .refine((values) => new Set(values).size === values.length)
      .transform((values) => values.sort()),
    reason,
  }),
  topologyReplace: confirm,
};

export type ReleaseInput<K extends keyof typeof releaseInputs> = z.infer<
  (typeof releaseInputs)[K]
>;

const named = z.object({ id: uuid, name: resultLabel });
const field = resultDefinitionResolvedSchema.shape.fields.element;
const calculation = z.object({
  calculationStatus: z.enum(['READY', 'INCOMPLETE', 'NOT_APPLICABLE']),
  evaluation: z
    .object({
      nominalMaxScore: z.string().optional(),
      effectiveMaxScore: z.string().optional(),
      normalizedPercentage: z.string(),
      displayPercentage: z.string().optional(),
    })
    .optional(),
  reason: z.string().optional(),
  effectiveWeight: z.string().optional(),
});

export const releaseSnapshot = z.object({
  schemaVersion: z.literal('1.0'),
  calculatorVersion: z.literal(1),
  student: z.object({
    studentId: uuid,
    name: resultLabel,
    displayName: z.string(),
  }),
  academicContext: z.object({
    school: named,
    academicYear: named,
    reportingPeriod: named.extend({ kind: z.enum(['TERM', 'CUSTOM', 'YEAR']) }),
    term: named.optional(),
    stage: named,
    grade: named,
    section: named,
    classroom: named,
  }),
  enrollmentId: uuid,
  placementRevision: revision,
  group: z.object({
    groupId: uuid,
    kind: z.enum(['SUBJECT', 'CUSTOM']),
    subjectId: uuid.optional(),
    label: resultLabel,
  }),
  unit: resultDefinitionResolvedSchema.shape.releaseUnits.element,
  calculationPolicy: resultDefinitionResolvedSchema.shape.calculationPolicy,
  fields: z.array(
    z.object({
      definition: field,
      value: resultValue,
      cellVersion: generation.optional(),
      calculation: calculation.optional(),
    }),
  ),
  completeness: z.enum(['COMPLETE', 'PARTIAL']),
  validationIssues: z.array(z.object({ fieldId: uuid, code: z.string() })),
  definitionDigest: digest,
  policyVersionId: uuid.nullable(),
  correction: z
    .object({ previousPublicationId: uuid, reason: z.string() })
    .nullable(),
});

export type ReleaseSnapshot = z.infer<typeof releaseSnapshot>;
