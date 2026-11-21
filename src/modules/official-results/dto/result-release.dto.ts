import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsUUID, ValidateIf } from 'class-validator';
import { z } from 'zod/v4';
import {
  resultDefinitionResolvedSchema,
  resultLabel,
} from '../domain/result-definition';
import { releaseSnapshot } from '../domain/result-release.contract';
import { resultValue } from '../domain/result-value';
import { authoringOutputs } from './result-authoring.dto';
import { ResultPageQueryDto } from './result-configuration.dto';

const uuid = z.uuid();
const revision = z.number().int().min(1);
const generation = z.number().int().min(0);
const digest = z.string().regex(/^[0-9a-f]{64}$/u);
const instant = z.iso.datetime();
const states = [
  'SUBMITTED',
  'READY_FOR_DIRECT',
  'APPROVED',
  'RETURNED',
  'SUPERSEDED',
] as const;
const completeness = z.enum(['COMPLETE', 'PARTIAL']);
const familyNamed = z.object({ id: uuid, name: resultLabel });
const capabilities = z.record(
  z.string(),
  z.object({ allowed: z.boolean(), reasonCode: z.string().optional() }),
);
const candidate = z.object({
  candidateKind: z.literal('RESULT_RELEASE'),
  candidateId: uuid,
  candidateRevision: revision,
  contentDigest: digest,
  status: z.enum(states),
  intent: z.enum(['REVIEW', 'DIRECT_PUBLICATION']),
  sheetId: uuid,
  slotId: uuid,
  definitionVersionId: uuid,
  releaseUnitId: uuid,
  sourceSlotRevision: revision,
  submittedAt: instant,
  completeness,
  validationIssues: releaseSnapshot.shape.validationIssues,
  comment: z.string().optional(),
  capabilities,
});
const publication = z.object({
  publicationId: uuid,
  slotId: uuid,
  candidateId: uuid,
  releaseUnitId: uuid,
  definitionVersionId: uuid,
  revision,
  publicationGeneration: generation,
  publishedAt: instant,
  predecessorId: uuid.nullable(),
  status: z.enum(['ACTIVE', 'SUPERSEDED', 'REVOKED']),
  authorizationMode: z.enum(['DIRECT', 'APPROVED', 'APPROVE_AND_PUBLISH']),
});
const field = resultDefinitionResolvedSchema.shape.fields.element;
export const familyField = z.object({
  fieldId: uuid,
  definitionVersionId: uuid,
  code: z.string(),
  label: resultLabel,
  kind: field.shape.kind,
  outputKind: field.shape.outputKind,
  order: generation,
  value: resultValue,
  options: field.shape.options,
  constraints: field.shape.constraints.optional(),
  calculationStatus: z
    .enum(['READY', 'INCOMPLETE', 'NOT_APPLICABLE'])
    .optional(),
  evaluation: z
    .object({
      nominalMaxScore: z.string().optional(),
      effectiveMaxScore: z.string().optional(),
      normalizedPercentage: z.string(),
      displayPercentage: z.string().optional(),
    })
    .optional(),
});
export const familyContext = releaseSnapshot.shape.academicContext.omit({
  stage: true,
  grade: true,
  section: true,
  classroom: true,
});
export const familyStudent = z.object({ id: uuid, displayName: z.string() });
export const placement = z.object({
  enrollmentId: uuid,
  stage: familyNamed,
  grade: familyNamed,
  section: familyNamed,
  classroom: familyNamed,
});
export const familyGroupShape = {
  groupId: uuid,
  kind: z.enum(['SUBJECT', 'CUSTOM']),
  label: resultLabel,
  order: generation,
  subject: familyNamed.optional(),
};
export const commonFamilyRelease = {
  releaseUnitId: uuid,
  releaseUnitLabel: resultLabel,
  completeness,
  academicPlacement: placement,
  fields: z.array(familyField),
};
const previewRelease = z.object({
  ...commonFamilyRelease,
  candidateId: uuid,
  candidateRevision: revision,
  publicationId: z.null(),
  publishedAt: z.null(),
  status: z.literal('PREVIEW'),
});

export const releaseOutputs = {
  candidate,
  publication,
  operation: authoringOutputs.operation,
  reviews: z.object({
    items: z.array(candidate),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  }),
  decision: z.object({
    decisionId: uuid,
    candidateId: uuid,
    candidateKind: z.enum(['RESULT_RELEASE', 'AGGREGATE']),
    contentDigest: digest,
    decision: z.enum(['APPROVE', 'RETURN']),
    reviewerId: uuid,
    decidedAt: instant,
    comment: z.string().optional(),
  }),
  correction: z.object({
    sheetId: uuid,
    slotId: uuid,
    previousPublicationId: uuid,
    reason: z.string(),
    draftDefinitionVersionId: uuid,
    sheetRevision: revision,
    correctionId: uuid,
    capabilities,
  }),
  topologyPreview: z.object({
    previewId: uuid,
    previewDigest: digest,
    expiresAt: instant,
    impacts: z.array(
      z.object({
        kind: z.literal('PUBLICATION_TOPOLOGY'),
        resourceId: uuid,
        before: z.object({ activePublicationIds: z.array(uuid) }),
        after: z.object({
          preservedPublicationIds: z.array(uuid),
          candidateIds: z.array(uuid),
        }),
      }),
    ),
    blockers: z.array(z.object({ code: z.string() })),
  }),
  composition: z.object({
    slotId: uuid,
    publicationGeneration: generation,
    activePublications: z.array(publication),
    replacedPublicationIds: z.array(uuid),
    preservedPublicationIds: z.array(uuid),
  }),
  preview: z.object({
    mode: z.literal('PREVIEW'),
    audience: z.enum(['STUDENT', 'PARENT']),
    candidateId: uuid,
    result: z.object({
      schemaVersion: z.literal('1.0'),
      source: z.literal('OFFICIAL_RESULTS'),
      student: familyStudent,
      academicContext: familyContext,
      groups: z.array(
        z.object({ ...familyGroupShape, releases: z.array(previewRelease) }),
      ),
    }),
  }),
};
export const candidateAudienceInput = z.strictObject({
  audience: z.enum(['STUDENT', 'PARENT']),
});
const present = (_object: unknown, value: unknown) => value !== undefined;

export class ResultReviewsQueryDto extends ResultPageQueryDto {
  @ApiPropertyOptional({ enum: ['RESULT_RELEASE', 'AGGREGATE'] })
  @ValidateIf(present)
  @IsIn(['RESULT_RELEASE', 'AGGREGATE'])
  candidateKind?: 'RESULT_RELEASE' | 'AGGREGATE';

  @ApiPropertyOptional({ enum: states })
  @ValidateIf(present)
  @IsIn(states)
  candidateStatus?: (typeof states)[number];

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf(present)
  @IsUUID()
  sheetId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf(present)
  @IsUUID()
  reportingPeriodId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf(present)
  @IsUUID()
  submitterId?: string;
}
