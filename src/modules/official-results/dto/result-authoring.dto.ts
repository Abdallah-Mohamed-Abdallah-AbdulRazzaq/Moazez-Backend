import { type PipeTransform } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { z } from 'zod/v4';
import { ValidationDomainException } from '../../../common/exceptions/domain-exception';
import { resultResolutionInput } from '../application/result-scope.service';
import {
  resultAuthoringLabel,
  resultDefinitionAuthoringSchema,
  resultDefinitionResolvedSchema,
  resultLabel,
} from '../domain/result-definition';
import { templateScopeSelector } from '../domain/result-template-rules';
import { fieldMappingSchema } from '../domain/result-mapping';
import {
  resultOperationItem,
  resultOperationCounts,
} from '../infrastructure/repositories/result-operation.repository';
import { ResultPageQueryDto } from './result-configuration.dto';
import { importExecutionUnit } from './result-import.dto';
import { exportFileDescriptor } from './result-export.dto';

const uuid = z.uuid();
const instant = z.iso.datetime();
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const revision = z.number().int().min(1);
const generation = z.number().int().min(0);
const reason = z.string().trim().min(1).max(2000);
const ownership = z.enum(['SCHOOL', 'PLATFORM']);
const preview = z.object({
  previewId: uuid,
  previewDigest: digest,
  expiresAt: instant,
});
const confirm = preview.omit({ expiresAt: true }).strict();
const templateInput = z.strictObject({
  label: resultAuthoringLabel,
  description: reason.optional(),
});
const activation = z.strictObject({
  versionId: uuid,
  expectedTemplateRevision: revision,
});
const assignment = templateScopeSelector.extend({
  id: uuid.optional(),
  mode: z.enum(['REPLACE', 'EXTEND']),
  templateVersionId: uuid,
  baseTemplateVersionId: uuid.optional(),
  enabled: z.boolean(),
});
const expectedDraft = z.strictObject({
  expectedDefinitionVersionId: uuid,
  expectedSheetRevision: revision,
});

export const authoringInputs = {
  template: templateInput,
  clone: templateInput.extend({
    sourceTemplateId: uuid,
    sourceVersionId: uuid,
  }),
  version: z.strictObject({
    expectedLatestVersionId: uuid.nullable(),
    definition: resultDefinitionAuthoringSchema,
  }),
  activation,
  activate: activation.extend(confirm.shape),
  reason: z.strictObject({ reason, expectedRevision: revision }),
  assignment: z.strictObject({ expectedScopeRevision: generation, assignment }),
  resolution: resultResolutionInput,
  materialization: confirm,
  design: expectedDraft.extend({
    sheetId: uuid,
    definition: resultDefinitionAuthoringSchema,
    reason,
    originTemplateVersionId: uuid.optional(),
  }),
  designDecision: z
    .strictObject({
      definitionVersionId: uuid,
      contentDigest: digest,
      decision: z.enum(['APPROVE', 'RETURN']),
      comment: reason.optional(),
    })
    .refine((value) => value.decision !== 'RETURN' || Boolean(value.comment)),
  definitionPreview: expectedDraft.extend({
    targetDefinitionVersionId: uuid,
    fieldMapping: z.array(fieldMappingSchema).max(256),
  }),
  definitionAdoption: confirm.extend({ expectedSheetRevision: revision }),
};

const template = z.object({
  templateId: uuid,
  revision,
  label: resultLabel,
  ownership,
  description: z.string().nullable(),
  activeVersionId: uuid.nullable(),
  latestVersionId: uuid.nullable(),
  currentVersionId: uuid.nullable(),
  archived: z.boolean(),
});
const identityMap = z.object({
  fields: z.array(z.object({ clientKey: z.string(), fieldId: uuid })),
  units: z.array(z.object({ clientUnitKey: z.string(), releaseUnitId: uuid })),
});
const templateVersion = z.object({
  templateVersionId: uuid,
  templateId: uuid,
  definitionVersionId: uuid,
  version: revision,
  definition: resultDefinitionResolvedSchema,
  contentDigest: digest,
  createdAt: instant.optional(),
  origin: z.object({
    kind: z.enum(['PLATFORM', 'PLATFORM_CLONE', 'SCHOOL_CLONE', 'SCHOOL']),
    platformTemplateCode: z.string().optional(),
    platformTemplateVersion: revision.optional(),
    sourceTemplateId: uuid.optional(),
    sourceVersionId: uuid.optional(),
    predecessorId: uuid.nullable().optional(),
    fieldLineage: z.record(z.string(), uuid).optional(),
    unitLineage: z.record(z.string(), uuid).optional(),
  }),
  identityMap: identityMap.optional(),
});
const assignmentResponse = z.object({
  assignmentId: uuid,
  revision,
  scopeRevision: revision,
  assignment: assignment.extend({ baseTemplateVersionId: uuid.nullable() }),
});
const scopeTuple = z.object({
  reportingPeriodId: uuid,
  classroomId: uuid,
  groupId: uuid,
});
const operation = z.object({
  operationId: uuid,
  operationType: z.string(),
  status: z.enum([
    'QUEUED',
    'RUNNING',
    'COMPLETED',
    'PARTIALLY_COMPLETED',
    'APPLYING',
    'APPLIED',
    'PARTIALLY_APPLIED',
    'FAILED',
    'CANCELLED',
  ]),
  counts: resultOperationCounts,
  createdAt: instant,
  updatedAt: instant,
  itemsPath: z.string(),
  terminationReason: z.string().optional(),
  file: exportFileDescriptor.optional(),
});
const schoolTemplateImpact = z.object({
  templateId: uuid,
  versionId: uuid,
  expectedTemplateRevision: revision,
  previousVersionId: uuid.nullable(),
  definitionDigest: digest,
  affectedAssignments: generation,
  assignmentDigest: digest,
  altersExistingSheets: z.literal(false),
});
const blocker = z.object({ fieldId: uuid, code: z.string() });
const adoptionImpact = z.object({
  targetDefinitionVersionId: uuid,
  expectedSheetRevision: revision,
  affectedValues: generation,
  blockers: z.array(blocker),
  addedFieldIds: z.array(uuid),
  retiredFieldIds: z.array(uuid),
});
const versionImpact = z.object({
  kind: z.literal('TEMPLATE_ACTIVATION'),
  resourceId: uuid,
  before: z.object({ versionId: uuid.nullable(), revision }),
  after: z.object({ versionId: uuid, revision }),
});
const draftImpact = z.object({
  kind: z.literal('DEFINITION_ADOPTION'),
  resourceId: uuid,
  before: z.object({ definitionVersionId: uuid, sheetRevision: revision }),
  after: z.object({ definitionVersionId: uuid, sheetRevision: revision }),
});
const design = z.object({
  candidateId: uuid,
  definitionVersionId: uuid,
  contentDigest: digest,
  status: z.enum(['IN_REVIEW', 'ACCEPTED', 'RETURNED', 'SUPERSEDED']),
  definition: resultDefinitionResolvedSchema,
  identityMap: identityMap.optional(),
  sheetRevision: revision.optional(),
  comment: z.string().optional(),
});
const preset = z.object({
  presetId: uuid,
  code: z.string(),
  label: resultLabel,
  kind: z.string(),
  ownership,
  allowedStates: z.array(z.string()),
  constraints:
    resultDefinitionResolvedSchema.shape.fields.element.shape.constraints,
});

const page = (entry: z.ZodType) =>
  z.object({
    items: z.array(entry),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  });

export const authoringOutputs = {
  template,
  templates: page(template),
  templateVersion,
  activationPreview: preview.extend({
    impact: schoolTemplateImpact,
    impacts: z.array(versionImpact),
    blockers: z.array(blocker),
  }),
  presets: page(preset),
  assignment: assignmentResponse,
  assignments: page(assignmentResponse),
  resolution: preview.extend({
    tuples: z.array(
      scopeTuple.extend({
        rosterCount: generation,
        pendingPlacementCount: generation,
        existingSheetId: uuid.nullable(),
        draftDefinitionVersionId: uuid.nullable(),
        templateVersionId: uuid.nullable(),
        sourceRuleIds: z.array(uuid),
        policyVersionId: uuid.nullable(),
        policyRevision: generation,
      }),
    ),
    conflicts: z.array(scopeTuple.extend({ code: z.string() })),
  }),
  operation,
  operationItems: page(
    z.union([
      resultOperationItem,
      importExecutionUnit,
      z.object({ status: z.literal('COMPLETED'), file: exportFileDescriptor }),
    ]),
  ),
  design,
  definitionPreview: preview.extend({
    impact: adoptionImpact,
    impacts: z.array(draftImpact),
    blockers: z.array(blocker),
  }),
  sheet: scopeTuple.extend({
    sheetId: uuid,
    sheetRevision: revision,
    dataGeneration: generation,
    rosterGeneration: generation,
    draftDefinitionVersionId: uuid,
    lastAcceptedDefinitionVersionId: uuid.nullable(),
  }),
};

export type AuthoringInput<K extends keyof typeof authoringInputs> = z.infer<
  (typeof authoringInputs)[K]
>;

export class ResultBodyPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: z.ZodType<T>) {}

  transform(value: unknown): T {
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) {
      throw new ValidationDomainException('Invalid Official Results command', {
        fields: parsed.error.issues
          .slice(0, 20)
          .map(({ path, code }) => ({ path, code })),
      });
    }
    return parsed.data;
  }
}

const whenPresent = (_object: unknown, value: unknown) => value !== undefined;

export class ResultTemplatesQueryDto extends ResultPageQueryDto {
  @ApiPropertyOptional({ enum: ['SCHOOL', 'PLATFORM'] })
  @ValidateIf(whenPresent)
  @IsIn(['SCHOOL', 'PLATFORM'])
  ownership?: 'SCHOOL' | 'PLATFORM';

  @ApiPropertyOptional({ type: Boolean })
  @ValidateIf(whenPresent)
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  archived?: boolean;

  @ApiPropertyOptional({ maxLength: 200 })
  @ValidateIf(whenPresent)
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ enum: ['SUBJECT', 'CUSTOM'] })
  @ValidateIf(whenPresent)
  @IsIn(['SUBJECT', 'CUSTOM'])
  groupKind?: 'SUBJECT' | 'CUSTOM';
}
