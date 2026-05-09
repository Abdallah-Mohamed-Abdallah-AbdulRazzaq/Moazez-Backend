export class ParentChildHierarchyNodeDto {
  id!: string;
  name!: string;
}

export class ParentChildCardDto {
  studentId!: string;
  displayName!: string;
  avatarUrl!: null;
  status!: 'active';
  enrollmentId!: string;
  classroom!: ParentChildHierarchyNodeDto;
  stage!: ParentChildHierarchyNodeDto;
  grade!: ParentChildHierarchyNodeDto;
  section!: ParentChildHierarchyNodeDto;
}

export type ParentChildrenListResponseDto = ParentChildCardDto[];

export class ParentChildDetailStudentDto {
  studentId!: string;
  displayName!: string;
  avatarUrl!: null;
  status!: 'active';
}

export class ParentChildDetailEnrollmentDto {
  enrollmentId!: string;
  academicYearId!: string;
  termId!: string | null;
  classroom!: ParentChildHierarchyNodeDto;
  stage!: ParentChildHierarchyNodeDto;
  grade!: ParentChildHierarchyNodeDto;
  section!: ParentChildHierarchyNodeDto;
}

export class ParentChildUnavailableSummaryDto {
  available!: false;
  reason!:
    | 'detailed_attendance_not_in_this_slice'
    | 'grades_slice_not_loaded'
    | 'behavior_slice_not_loaded'
    | 'progress_slice_not_loaded';
}

export class ParentChildDetailSummariesDto {
  attendance!: ParentChildUnavailableSummaryDto;
  grades!: ParentChildUnavailableSummaryDto;
  behavior!: ParentChildUnavailableSummaryDto;
  progress!: ParentChildUnavailableSummaryDto;
}

export class ParentChildDetailUnsupportedDto {
  schedule!: true;
  homeworks!: true;
  pickup!: true;
}

export class ParentChildDetailResponseDto {
  student!: ParentChildDetailStudentDto;
  enrollment!: ParentChildDetailEnrollmentDto;
  summaries!: ParentChildDetailSummariesDto;
  unsupported!: ParentChildDetailUnsupportedDto;
}
