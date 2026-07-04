import {
  DismissalAcademicNodeDto,
  DismissalStaffAssignmentGateDto,
} from '../../staff-assignments/dto/dismissal-staff-assignment.dto';

export class DismissalProfileIdentityDto {
  displayName!: string;
  userType!: 'dismissal_staff';
  status!: 'active';
}

export class DismissalProfileSchoolDto {
  name!: string | null;
  timezone!: string;
}

export class DismissalProfileAcademicScopeDto {
  stage!: DismissalAcademicNodeDto | null;
  grade!: DismissalAcademicNodeDto | null;
  section!: DismissalAcademicNodeDto | null;
  classroom!: DismissalAcademicNodeDto | null;
  isLead!: boolean;
  startsAt!: string | null;
  endsAt!: string | null;
}

export class DismissalProfileAssignmentsDto {
  totalCount!: number;
  leadCount!: number;
  activeCount!: number;
  gates!: DismissalStaffAssignmentGateDto[];
  academicScopes!: DismissalProfileAcademicScopeDto[];
}

export class DismissalProfileReadinessDto {
  hasAssignments!: boolean;
  canViewGates!: boolean;
  canManageRequests!: boolean;
  canDeliver!: boolean;
  canEscalate!: boolean;
}

export class DismissalProfileResponseDto {
  profile!: DismissalProfileIdentityDto;
  school!: DismissalProfileSchoolDto;
  assignments!: DismissalProfileAssignmentsDto;
  readiness!: DismissalProfileReadinessDto;
}
