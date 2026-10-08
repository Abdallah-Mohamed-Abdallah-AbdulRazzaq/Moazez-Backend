import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, ValidateIf } from 'class-validator';
import {
  ACADEMIC_CONTENT_ANALYTICS_RANGES,
  ACADEMIC_CONTENT_ANALYTICS_MEASUREMENTS,
  type AcademicContentAnalyticsRange,
  type AcademicContentAnalyticsCounts,
} from '../../../academics/academic-content/domain/academic-content-analytics.contract';

export class TeacherAcademicContentAnalyticsQueryDto {
  @ApiPropertyOptional({
    enum: ACADEMIC_CONTENT_ANALYTICS_RANGES,
    default: '30d',
  })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsIn(ACADEMIC_CONTENT_ANALYTICS_RANGES)
  range?: AcademicContentAnalyticsRange;
}

export class TeacherAcademicContentAnalyticsResponseDto {
  @ApiProperty() contentId!: string;
  @ApiProperty({ nullable: true }) publicationId!: string | null;
  @ApiProperty({ nullable: true }) revisionId!: string | null;
  @ApiProperty() includedPublicationCount!: string;
  @ApiProperty() window!: {
    range: AcademicContentAnalyticsRange;
    from: string;
    toExclusive: string;
    timezone: 'UTC';
  };
  @ApiProperty() metrics!: AcademicContentAnalyticsCounts;
  @ApiProperty() measurements!: typeof ACADEMIC_CONTENT_ANALYTICS_MEASUREMENTS;
}
