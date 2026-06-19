export class ParentProfileParentDto {
  userId!: string;
  displayName!: string;
  firstName!: string;
  lastName!: string;
  email!: string;
  phone!: string | null;
  avatarUrl!: null;
}

export class ParentProfileGuardianDto {
  relationship!: string;
  isPrimary!: boolean;
}

export class ParentProfileChildDto {
  studentId!: string;
  displayName!: string;
  enrollmentId!: string;
}

export class ParentProfileSchoolDto {
  name!: string | null;
  logoUrl!: null;
}

export class ParentProfileUnsupportedDto {
  avatarUpload!: true;
  preferences!: true;
  supportTickets!: true;
  addChild!: true;
}

export class ParentProfileResponseDto {
  parent!: ParentProfileParentDto;
  guardians!: ParentProfileGuardianDto[];
  children!: ParentProfileChildDto[];
  school!: ParentProfileSchoolDto;
  unsupported!: ParentProfileUnsupportedDto;
}
