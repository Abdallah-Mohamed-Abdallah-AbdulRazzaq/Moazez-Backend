export class StudentProfileStudentDto {
  studentId!: string;
  userId!: string;
  displayName!: string;
  firstName!: string;
  lastName!: string;
  email!: string;
  phone!: string | null;
  avatarUrl!: null;
  studentNumber!: null;
  status!: 'active';
}

export class StudentProfileSchoolDto {
  name!: string | null;
  logoUrl!: null;
}

export class StudentProfileHierarchyNodeDto {
  id!: string;
  name!: string;
}

export class StudentProfileEnrollmentDto {
  enrollmentId!: string;
  academicYearId!: string;
  termId!: string | null;
  classroom!: StudentProfileHierarchyNodeDto;
  stage!: StudentProfileHierarchyNodeDto;
  grade!: StudentProfileHierarchyNodeDto;
  section!: StudentProfileHierarchyNodeDto;
}

export class StudentProfileUnsupportedDto {
  avatarUpload!: true;
  preferences!: true;
  seatNumber!: true;
}

export class StudentProfileSummaryDto {
  name!: string;
  grade!: string;
  school_name!: string | null;
  student_code!: string | null;
  level!: number;
  current_xp!: number;
  total_xp!: number;
  next_level_xp!: number;
  rank_title!: string | null;
  rank_image_url!: string | null;
}

export class StudentProfileBadgeDto {
  title!: string;
  subtitle!: string;
  image_url!: string | null;
  season!: string | null;
  rank_value!: number;
}

export class StudentProfileTopStudentDto {
  rank!: number;
  name!: string;
  xp!: number;
  note!: string | null;
  is_current_student!: boolean;
  is_top_three!: boolean;
}

export class StudentProfileResponseDto {
  student!: StudentProfileStudentDto;
  school!: StudentProfileSchoolDto;
  enrollment!: StudentProfileEnrollmentDto;
  unsupported!: StudentProfileUnsupportedDto;
  student_profile!: StudentProfileSummaryDto;
  recent_badges!: StudentProfileBadgeDto[];
  top_students!: StudentProfileTopStudentDto[];
  leaderboard!: [];
}
