export class TeacherProfileTeacherDto {
  userId!: string;
  displayName!: string;
  email!: string;
  phone!: string | null;
  avatarUrl!: string | null;
  userType!: 'teacher';
}

export class TeacherProfileSchoolDto {
  name!: string | null;
  logoUrl!: string | null;
}

export class TeacherProfileRoleDto {
  roleId!: string;
  name!: string | null;
}

export class TeacherProfileClassesSummaryDto {
  classesCount!: number;
  subjectsCount!: number;
  studentsCount!: number;
}

export class TeacherProfileResponseDto {
  teacher!: TeacherProfileTeacherDto;
  school!: TeacherProfileSchoolDto;
  role!: TeacherProfileRoleDto;
  classesSummary!: TeacherProfileClassesSummaryDto;
  permissions!: string[];
}

export class TeacherEmploymentProfileDto {
  employeeId!: string | null;
  department!: string | null;
  specialization!: string | null;
  employmentType!: string | null;
  joiningDate!: string | null;
  officeHours!: string | null;
  manager!: string | null;
  status!: 'unsupported';
}

export class TeacherEmploymentProfileResponseDto {
  employment!: TeacherEmploymentProfileDto;
  reason!: 'teacher_employment_profile_not_available';
}
