import { ApiProperty } from '@nestjs/swagger';
import {
  AcademicContentAudienceType,
  AcademicOnlineSessionPlatform,
  AcademicSubjectResourceCategory,
} from '@prisma/client';
import { AcademicContentRevisionSnapshotV2 } from '../../../academics/academic-content/domain/academic-content-revision-snapshot';
import {
  STUDENT_ACADEMIC_CONTENT_TYPES,
  type StudentAcademicContentType,
} from '../../../academics/academic-content/domain/academic-content-recipient.query';

export type StudentAcademicContentSummary =
  | { weekStartDate: string; weekEndDate: string }
  | { resourceCategory: AcademicSubjectResourceCategory }
  | { platform: AcademicOnlineSessionPlatform; startAt: string; endAt: string };
export type StudentAcademicContentDetails = Extract<
  AcademicContentRevisionSnapshotV2,
  { type: 'WEEKLY_PLAN' | 'SUBJECT_RESOURCE' | 'ONLINE_SESSION' }
>['state'];

export class StudentAcademicContentCardDto {
  @ApiProperty({ format: 'uuid' }) contentId!: string;
  @ApiProperty({ format: 'uuid' }) publicationId!: string;
  @ApiProperty({ format: 'uuid' }) revisionId!: string;
  @ApiProperty({ enum: STUDENT_ACADEMIC_CONTENT_TYPES })
  type!: StudentAcademicContentType;
  @ApiProperty({ enum: ['STUDENTS', 'STUDENTS_AND_GUARDIANS'] })
  audience!: AcademicContentAudienceType;
  @ApiProperty() title!: string;
  @ApiProperty({ nullable: true }) description!: string | null;
  @ApiProperty({ format: 'date-time' }) publishedAt!: string;
  @ApiProperty({ format: 'date-time' }) visibleFrom!: string;
  @ApiProperty({ format: 'date-time', nullable: true }) visibleUntil!:
    | string
    | null;
  @ApiProperty({ type: Object, nullable: true })
  summary!: StudentAcademicContentSummary | null;
}
export class StudentAcademicContentPaginationDto {
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total!: number;
}
export class StudentAcademicContentListResponseDto {
  @ApiProperty({ type: [StudentAcademicContentCardDto] })
  items!: StudentAcademicContentCardDto[];
  @ApiProperty({ type: StudentAcademicContentPaginationDto })
  pagination!: StudentAcademicContentPaginationDto;
}
export class StudentAcademicContentAssetDto {
  @ApiProperty({ format: 'uuid' }) fileId!: string;
  @ApiProperty() originalName!: string;
  @ApiProperty() mimeType!: string;
  @ApiProperty({ description: 'Decimal bytes' }) sizeBytes!: string;
  @ApiProperty() sortOrder!: number;
}
export class StudentAcademicContentLinkDto {
  @ApiProperty({ format: 'uuid' }) revisionLinkId!: string;
  @ApiProperty() label!: string;
  @ApiProperty() url!: string;
  @ApiProperty() sortOrder!: number;
}
export class StudentAcademicContentTagDto {
  @ApiProperty() value!: string;
  @ApiProperty() sortOrder!: number;
}
export class StudentAcademicContentDetailDto extends StudentAcademicContentCardDto {
  @ApiProperty({ type: [StudentAcademicContentAssetDto] })
  assets!: StudentAcademicContentAssetDto[];
  @ApiProperty({ type: [StudentAcademicContentLinkDto] })
  links!: StudentAcademicContentLinkDto[];
  @ApiProperty({ type: [StudentAcademicContentTagDto] })
  tags!: StudentAcademicContentTagDto[];
  @ApiProperty({ type: Object, nullable: true })
  details!: StudentAcademicContentDetails | null;
}
export class StudentAcademicContentDetailResponseDto {
  @ApiProperty({ type: StudentAcademicContentDetailDto })
  content!: StudentAcademicContentDetailDto;
}
