import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { z } from 'zod/v4';
import { resultValue } from '../domain/result-value';
import { ResultPageQueryDto } from './result-configuration.dto';

export class ResultReportsQueryDto extends ResultPageQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  sheetId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  reportingPeriodId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  classroomId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  fieldId?: string;
}

const uuid = z.uuid();
const count = z.number().int().nonnegative();
const page = (item: z.ZodType) =>
  z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  });
const closureSummary = z.object({
  sheets: count,
  eligibleSlots: count,
  publishedSlots: count,
  missingRequiredCells: count,
  pendingReviews: count,
  pendingImports: count,
});
const revision = z.object({
  status: z.enum(['OPEN', 'ENTRY_CLOSED', 'ARCHIVED']),
  revision: count,
});
export const reportOutputs = {
  closureSummary,
  reopen: z.object({
    previewId: uuid,
    previewDigest: z.string().length(64),
    expiresAt: z.iso.datetime(),
    blockers: z.array(z.object({ code: z.string() })),
    impacts: z.array(
      z.object({
        kind: z.literal('PERIOD_REOPEN'),
        resourceId: uuid,
        before: revision,
        after: revision,
      }),
    ),
    summary: closureSummary,
    capabilities: z.object({
      canEnter: z.boolean(),
      canReviewExisting: z.boolean(),
    }),
  }),
  history: page(
    z.object({
      id: uuid,
      resourceId: uuid,
      type: z.enum(['CELL', 'DEFINITION', 'REVIEW', 'PUBLICATION', 'IMPORT']),
      action: z.string(),
      occurredAt: z.iso.datetime(),
      actorId: uuid,
      revision: count,
      sheetId: uuid,
      fieldId: uuid.optional(),
      before: resultValue.optional(),
      after: resultValue.optional(),
      operationId: uuid.optional(),
    }),
  ),
  missing: page(
    z.object({
      sheetId: uuid,
      slotId: uuid,
      studentId: uuid,
      studentName: z.string(),
      enrollmentId: uuid,
      fieldId: uuid,
      fieldLabel: z.object({ ar: z.string(), en: z.string() }),
      reason: z.enum(['MISSING', 'RECONCILIATION_REQUIRED']),
      canEnter: z.boolean(),
    }),
  ).extend({
    scope: z.object({ sheetIds: z.array(uuid) }),
    counts: z.object({
      missingFields: count,
      reconciliationFields: count,
      affectedSlots: count,
    }),
  }),
};
