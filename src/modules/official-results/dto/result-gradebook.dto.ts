import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { z } from 'zod/v4';
import { resultGridPatch } from '../domain/result-cell-operation';
import {
  resultDefinitionResolvedSchema,
  resultLabel,
} from '../domain/result-definition';
import {
  rosterPreviewInput,
  rosterReconcileInput,
} from '../domain/result-roster-contract';
import { resultValue } from '../domain/result-value';
import { authoringOutputs } from './result-authoring.dto';
import { ResultPageQueryDto } from './result-configuration.dto';

const uuid = z.uuid();
const revision = z.number().int().min(1);
const generation = z.number().int().min(0);
const digest = z.string().regex(/^[0-9a-f]{64}$/u);
const states = [
  'RECORDED',
  'MISSING',
  'ABSENT',
  'EXCUSED',
  'NOT_APPLICABLE',
] as const;
const room = z.object({ id: uuid, name: resultLabel });
const context = z.object({
  school: room,
  academicYear: room,
  reportingPeriod: room.extend({ kind: z.enum(['TERM', 'CUSTOM', 'YEAR']) }),
  term: room.optional(),
  stage: room,
  grade: room,
  section: room,
  classroom: room,
});
const capabilities = z.record(
  z.string(),
  z.object({ allowed: z.boolean(), reasonCode: z.string().optional() }),
);
const sheet = authoringOutputs.sheet.extend({
  academicContext: context,
  group: z.object({
    groupId: uuid,
    kind: z.enum(['SUBJECT', 'CUSTOM']),
    subjectId: uuid.optional(),
    label: resultLabel,
  }),
  capabilities: capabilities.optional(),
});
const computed = z.object({
  fieldId: uuid,
  value: resultValue,
  editable: z.literal(false),
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
const manual = z.object({
  fieldId: uuid,
  value: resultValue,
  editable: z.boolean(),
  cellVersion: generation,
  reason: z.string().optional(),
});
const row = z.object({
  slotId: uuid,
  slotRevision: revision,
  placementRevision: revision,
  publicationGeneration: generation,
  student: z.object({
    studentId: uuid,
    displayName: z.string(),
    name: resultLabel,
  }),
  enrollmentId: uuid,
  placementStatus: z.enum(['ELIGIBLE', 'RECONCILIATION_REQUIRED', 'CLOSED']),
  historicalPlacement: z.boolean(),
  groupExempt: z.boolean(),
  completeness: z.enum(['COMPLETE', 'PARTIAL']),
  cells: z.array(z.union([manual, computed])),
});
const page = (item: z.ZodType) =>
  z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  });
const change = z.object({
  kind: z.enum([
    'ADDED',
    'MOVED',
    'WITHDRAWN',
    'AMBIGUOUS',
    'MOVED_IN',
    'APPLICABILITY',
  ]),
  studentId: uuid,
  slotId: uuid.nullable(),
  placementRevision: revision.nullable(),
  enrollmentId: uuid.nullable(),
  destinationEnrollmentId: uuid.nullable(),
  destinationSheetId: uuid.nullable(),
  classroomId: uuid.nullable(),
  groupExempt: z.boolean(),
});
const impact = z.object({
  kind: z.literal('ROSTER_RECONCILIATION'),
  resourceId: uuid,
  before: z.object({
    rosterGeneration: revision,
    rosterAsOf: z.iso.datetime(),
  }),
  after: z.object({
    rosterAsOf: z.iso.datetime(),
    eligibleAdditions: generation,
  }),
});

export const gradebookInputs = {
  patch: resultGridPatch,
  rosterPreview: rosterPreviewInput,
  rosterReconcile: rosterReconcileInput,
};
export const gradebookOutputs = {
  sheets: page(sheet),
  sheet: sheet.extend({ capabilities }),
  grid: sheet.extend({
    definitions: z.array(
      resultDefinitionResolvedSchema.shape.fields.element
        .omit({ id: true })
        .extend({ fieldId: uuid }),
    ),
    rows: page(row),
    capabilities,
    projection: z.object({
      audience: z.literal('STAFF'),
      actorMode: z.enum(['TEACHER', 'SCHOOL_MANAGEMENT']),
    }),
  }),
  patch: z.object({
    sheetId: uuid,
    sheetRevision: revision,
    dataGeneration: generation,
    operationId: uuid,
    changedCells: z.array(
      manual
        .omit({ editable: true, reason: true })
        .extend({ slotId: uuid, slotRevision: revision }),
    ),
    calculatedOutputs: z.array(
      computed.extend({ slotId: uuid, slotRevision: revision }),
    ),
  }),
  rosterPreview: z.object({
    previewId: uuid,
    previewDigest: digest,
    expiresAt: z.iso.datetime(),
    changes: z.array(change),
    impacts: z.array(impact),
    blockers: z.array(
      z.object({ code: z.string(), studentId: uuid, slotId: uuid.nullable() }),
    ),
  }),
  roster: sheet.extend({
    addedCount: generation,
    decisionsApplied: generation,
  }),
};

const present = (_object: unknown, value: unknown) => value !== undefined;
const queryIds = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? [value] : value;

class GradebookQueryDto extends ResultPageQueryDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @ValidateIf(present)
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: ['ID_ASC'] })
  @ValidateIf(present)
  @IsIn(['ID_ASC'])
  sort?: 'ID_ASC';
}

export class ResultSheetsQueryDto extends GradebookQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf(present)
  @IsUUID()
  reportingPeriodId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf(present)
  @IsUUID()
  stageId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf(present)
  @IsUUID()
  gradeId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf(present)
  @IsUUID()
  sectionId?: string;

  @ApiPropertyOptional({ type: [String], format: 'uuid', maxItems: 200 })
  @ValidateIf(present)
  @Transform(queryIds)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  classroomIds?: string[];

  @ApiPropertyOptional({ type: [String], format: 'uuid', maxItems: 200 })
  @ValidateIf(present)
  @Transform(queryIds)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  groupIds?: string[];
}

export class ResultGridQueryDto extends GradebookQueryDto {
  @ApiPropertyOptional({ type: [String], format: 'uuid', maxItems: 200 })
  @ValidateIf(present)
  @Transform(queryIds)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  studentIds?: string[];

  @ApiPropertyOptional({ type: [String], format: 'uuid', maxItems: 256 })
  @ValidateIf(present)
  @Transform(queryIds)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(256)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  selectedFieldIds?: string[];

  @ApiPropertyOptional({ enum: ['COMPLETE', 'PARTIAL'] })
  @ValidateIf(present)
  @IsIn(['COMPLETE', 'PARTIAL'])
  completeness?: 'COMPLETE' | 'PARTIAL';

  @ApiPropertyOptional({ enum: states })
  @ValidateIf(present)
  @IsIn(states)
  recordedState?: (typeof states)[number];
}
