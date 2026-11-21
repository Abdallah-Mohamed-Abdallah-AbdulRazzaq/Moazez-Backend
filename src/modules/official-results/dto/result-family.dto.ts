import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsUUID, ValidateIf } from 'class-validator';
import { z } from 'zod/v4';
import { resultLabel } from '../domain/result-definition';
import { ResultPageQueryDto } from './result-configuration.dto';
import {
  commonFamilyRelease,
  familyContext,
  familyGroupShape,
  familyStudent,
} from './result-release.dto';

const uuid = z.uuid();
const generation = z.number().int().min(0);
const release = z.object({
  ...commonFamilyRelease,
  publicationId: uuid,
  status: z.literal('PUBLISHED'),
  publishedAt: z.iso.datetime(),
  revision: generation,
});
const period = z.object({
  reportingPeriodId: uuid,
  academicYearId: uuid,
  termId: uuid.optional(),
  kind: z.enum(['TERM', 'CUSTOM', 'YEAR']),
  name: resultLabel,
  status: z.enum(['OPEN', 'ENTRY_CLOSED', 'ARCHIVED']),
  startsOn: z.iso.date(),
  endsOn: z.iso.date(),
});
const page = (item: z.ZodType) =>
  z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  });
export const familyOutputs = {
  periods: page(period),
  result: z.object({
    schemaVersion: z.literal('1.0'),
    source: z.literal('OFFICIAL_RESULTS'),
    resultSetId: uuid,
    viewVersion: z.string().length(64),
    student: familyStudent,
    academicContext: familyContext,
    groups: z.array(
      z.object({ ...familyGroupShape, releases: z.array(release) }),
    ),
    summary: z.object({
      status: z.enum(['ACTIVE', 'STALE', 'NOT_CONFIGURED']),
      overallScore: z.string().nullable(),
      overallMaxScore: z.string().nullable(),
      completeness: z.enum(['COMPLETE', 'PARTIAL', 'INCOMPLETE']),
      reasonCode: z.string().optional(),
      aggregatePublicationId: uuid.optional(),
    }),
  }),
  history: page(release.extend({ groupId: uuid, definitionVersionId: uuid })),
};
const present = (_object: unknown, value: unknown) => value !== undefined;

export class ResultFamilyHistoryQueryDto extends ResultPageQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf(present)
  @IsUUID()
  groupId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf(present)
  @IsUUID()
  publicationId?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @ValidateIf(present)
  @IsISO8601({ strict: true })
  occurredFrom?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @ValidateIf(present)
  @IsISO8601({ strict: true })
  occurredTo?: string;
}
