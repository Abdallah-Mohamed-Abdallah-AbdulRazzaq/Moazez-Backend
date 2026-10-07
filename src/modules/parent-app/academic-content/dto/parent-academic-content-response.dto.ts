import { ApiProperty } from '@nestjs/swagger';
import {
  AcademicContentAudienceType,
  AcademicGuardianNotePriority,
  AcademicOnlineSessionPlatform,
  AcademicSubjectResourceCategory,
} from '@prisma/client';
import { AcademicContentRevisionSnapshotV2 } from '../../../academics/academic-content/domain/academic-content-revision-snapshot';
import {
  PARENT_ACADEMIC_CONTENT_TYPES,
  type ParentAcademicContentType,
} from '../../../academics/academic-content/domain/academic-content-recipient.query';

export type ParentAcademicContentSummary =
  | { weekStartDate: string; weekEndDate: string }
  | { priority: AcademicGuardianNotePriority; requiresAcknowledgement: boolean }
  | { resourceCategory: AcademicSubjectResourceCategory }
  | { platform: AcademicOnlineSessionPlatform; startAt: string; endAt: string };
export type ParentAcademicContentDetails = Extract<
  AcademicContentRevisionSnapshotV2,
  {
    type:
      | 'WEEKLY_PLAN'
      | 'GUARDIAN_WEEKLY_NOTE'
      | 'SUBJECT_RESOURCE'
      | 'ONLINE_SESSION';
  }
>['state'];

export class ParentAcademicContentCardDto {
  @ApiProperty({ format: 'uuid' }) contentId!: string;
  @ApiProperty({ format: 'uuid' }) publicationId!: string;
  @ApiProperty({ format: 'uuid' }) revisionId!: string;
  @ApiProperty({ enum: PARENT_ACADEMIC_CONTENT_TYPES })
  type!: ParentAcademicContentType;
  @ApiProperty({ enum: ['GUARDIANS', 'STUDENTS_AND_GUARDIANS'] })
  audience!: AcademicContentAudienceType;
  @ApiProperty() title!: string;
  @ApiProperty({ nullable: true }) description!: string | null;
  @ApiProperty({ format: 'date-time' }) publishedAt!: string;
  @ApiProperty({ format: 'date-time' }) visibleFrom!: string;
  @ApiProperty({ format: 'date-time', nullable: true }) visibleUntil!:
    | string
    | null;
  @ApiProperty({ type: Object, nullable: true })
  summary!: ParentAcademicContentSummary | null;
}
export class ParentAcademicContentPaginationDto {
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total!: number;
}
export class ParentAcademicContentListResponseDto {
  @ApiProperty({ type: [ParentAcademicContentCardDto] })
  items!: ParentAcademicContentCardDto[];
  @ApiProperty({ type: ParentAcademicContentPaginationDto })
  pagination!: ParentAcademicContentPaginationDto;
}
export class ParentAcademicContentAssetDto {
  @ApiProperty({ format: 'uuid' }) fileId!: string;
  @ApiProperty() originalName!: string;
  @ApiProperty() mimeType!: string;
  @ApiProperty({ description: 'Decimal bytes' }) sizeBytes!: string;
  @ApiProperty() sortOrder!: number;
}
export class ParentAcademicContentLinkDto {
  @ApiProperty() label!: string;
  @ApiProperty() url!: string;
  @ApiProperty() sortOrder!: number;
}
export class ParentAcademicContentTagDto {
  @ApiProperty() value!: string;
  @ApiProperty() sortOrder!: number;
}
export class ParentAcademicContentDetailDto extends ParentAcademicContentCardDto {
  @ApiProperty({ type: [ParentAcademicContentAssetDto] })
  assets!: ParentAcademicContentAssetDto[];
  @ApiProperty({ type: [ParentAcademicContentLinkDto] })
  links!: ParentAcademicContentLinkDto[];
  @ApiProperty({ type: [ParentAcademicContentTagDto] })
  tags!: ParentAcademicContentTagDto[];
  @ApiProperty({ type: Object, nullable: true })
  details!: ParentAcademicContentDetails | null;
}
export class ParentAcademicContentDetailResponseDto {
  @ApiProperty({ type: ParentAcademicContentDetailDto })
  content!: ParentAcademicContentDetailDto;
}

export class ParentAcademicContentAccessibleChildDto {
  @ApiProperty({ format: 'uuid' }) studentId!: string;
}
export class ParentAcademicContentAccessibleChildrenResponseDto {
  @ApiProperty({ format: 'uuid' }) academicContentId!: string;
  @ApiProperty({ format: 'uuid' }) publicationId!: string;
  @ApiProperty({ type: [ParentAcademicContentAccessibleChildDto] })
  children!: ParentAcademicContentAccessibleChildDto[];
}
