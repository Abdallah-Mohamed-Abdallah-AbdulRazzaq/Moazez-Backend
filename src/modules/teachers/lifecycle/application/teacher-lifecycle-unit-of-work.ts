import type {
  MembershipStatus,
  TeacherEmploymentStatus,
  TeacherEmploymentType,
  TeacherGender,
  TeacherWorkDay,
  UserStatus,
  UserType,
} from '@prisma/client';
import type { TeacherLifecycleSuccessfulAuditEntry } from '../domain/teacher-lifecycle-audit';

export type TeacherCredentialStatus =
  | 'missing'
  | 'temporary_or_must_change'
  | 'must_change'
  | 'set';

export interface TeacherLifecycleCredentialProjection {
  hasPassword: boolean;
  status: TeacherCredentialStatus;
  mustChangePassword: boolean;
  passwordProvisionedAt: Date | null;
  passwordChangedAt: Date | null;
  credentialVersion: number;
}

export interface TeacherLifecycleUserState {
  id: string;
  loginEmail: string;
  username: string | null;
  contactEmail: string | null;
  phone: string | null;
  firstName: string;
  lastName: string;
  userType: UserType;
  status: UserStatus;
  deletedAt: Date | null;
  credential: TeacherLifecycleCredentialProjection;
}

export interface TeacherLifecycleUserIdentityFields {
  loginEmail?: string;
  username?: string | null;
  contactEmail?: string | null;
  phone?: string | null;
}

export interface TeacherLifecycleInvitedUserInput extends TeacherLifecycleUserIdentityFields {
  loginEmail: string;
  firstName: string;
  lastName: string;
}

export type TeacherLifecycleIdentityConflictField =
  | 'loginEmail'
  | 'username'
  | 'contactEmail'
  | 'phone';

export function projectTeacherCredentialSummary(input: {
  passwordHash: string | null;
  mustChangePassword: boolean;
  passwordProvisionedAt: Date | null;
  passwordChangedAt: Date | null;
  credentialVersion: number;
}): TeacherLifecycleCredentialProjection {
  const hasPassword = Boolean(input.passwordHash);
  let status: TeacherCredentialStatus = 'set';
  if (!hasPassword) status = 'missing';
  else if (
    input.mustChangePassword &&
    input.passwordProvisionedAt !== null &&
    input.passwordChangedAt === null
  ) {
    status = 'temporary_or_must_change';
  } else if (input.mustChangePassword) status = 'must_change';

  return {
    hasPassword,
    status,
    mustChangePassword: input.mustChangePassword,
    passwordProvisionedAt: input.passwordProvisionedAt,
    passwordChangedAt: input.passwordChangedAt,
    credentialVersion: input.credentialVersion,
  };
}

export interface TeacherLifecycleRoleState {
  id: string;
  key: string;
  schoolId: string | null;
  deletedAt: Date | null;
}

export interface TeacherLifecycleMembershipState {
  id: string;
  userId: string;
  organizationId: string;
  schoolId: string | null;
  roleId: string;
  userType: UserType;
  status: MembershipStatus;
  startedAt: Date;
  endedAt: Date | null;
  deletedAt: Date | null;
  role: TeacherLifecycleRoleState;
  user: {
    userType: UserType;
    deletedAt: Date | null;
  };
}

export interface TeacherLifecycleProfileState {
  id: string;
  schoolId: string;
  userId: string;
  teacherCode: string | null;
  firstNameAr: string | null;
  lastNameAr: string | null;
  firstNameEn: string | null;
  lastNameEn: string | null;
  gender: TeacherGender | null;
  employmentStatus: TeacherEmploymentStatus;
  department: string | null;
  specialization: string | null;
  employmentType: TeacherEmploymentType | null;
  experienceYears: number | null;
  hireDate: Date | null;
  workingDays: TeacherWorkDay[];
  workStartTime: Date | null;
  workEndTime: Date | null;
  notesAr: string | null;
  notesEn: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface TeacherLifecycleProfileManagedFields {
  teacherCode?: string | null;
  firstNameAr?: string | null;
  lastNameAr?: string | null;
  firstNameEn?: string | null;
  lastNameEn?: string | null;
  gender?: TeacherGender | null;
  department?: string | null;
  specialization?: string | null;
  employmentType?: TeacherEmploymentType | null;
  experienceYears?: number | null;
  hireDate?: Date | null;
  workingDays?: TeacherWorkDay[];
  workStartTime?: Date | null;
  workEndTime?: Date | null;
  notesAr?: string | null;
  notesEn?: string | null;
}

export interface TeacherLifecycleTransactionContext {
  user: {
    findState(userId: string): Promise<TeacherLifecycleUserState | null>;
    findProvisioningIdentityConflicts(
      fields: TeacherLifecycleUserIdentityFields,
    ): Promise<TeacherLifecycleIdentityConflictField[]>;
    findIdentityConflicts(input: {
      userId: string;
      fields: TeacherLifecycleUserIdentityFields;
    }): Promise<TeacherLifecycleIdentityConflictField[]>;
    updateIdentityFields(input: {
      userId: string;
      fields: TeacherLifecycleUserIdentityFields;
    }): Promise<TeacherLifecycleUserState>;
    updateDisplayNames(input: {
      userId: string;
      firstName: string;
      lastName: string;
    }): Promise<TeacherLifecycleUserState>;
    createInvitedTeacher(
      input: TeacherLifecycleInvitedUserInput,
    ): Promise<TeacherLifecycleUserState>;
    setStatus(input: {
      userId: string;
      expectedStatus: UserStatus;
      status: UserStatus;
    }): Promise<TeacherLifecycleUserState>;
    setType(
      userId: string,
      userType: UserType,
    ): Promise<TeacherLifecycleUserState>;
  };
  membership: {
    resolveExactTeacherRole(
      schoolId: string,
    ): Promise<TeacherLifecycleRoleState | null>;
    findCurrentSchoolState(input: {
      schoolId: string;
      userId: string;
    }): Promise<TeacherLifecycleMembershipState | null>;
    listTeacherFootprints(
      userId: string,
    ): Promise<TeacherLifecycleMembershipState[]>;
    createExactTeacher(input: {
      userId: string;
      organizationId: string;
      schoolId: string;
      roleId: string;
      status: 'ACTIVE' | 'SUSPENDED';
    }): Promise<TeacherLifecycleMembershipState>;
    setRoleAndTypeForReviewedTransition(input: {
      membershipId: string;
      schoolId: string;
      roleId: string;
      userType: UserType;
    }): Promise<TeacherLifecycleMembershipState>;
    setActive(input: {
      membershipId: string;
      schoolId: string;
      expectedStatus: MembershipStatus;
      expectedEndedAt: Date | null;
    }): Promise<TeacherLifecycleMembershipState>;
    setSuspended(input: {
      membershipId: string;
      schoolId: string;
      expectedStatus: MembershipStatus;
      expectedEndedAt: Date | null;
    }): Promise<TeacherLifecycleMembershipState>;
    setInactive(input: {
      membershipId: string;
      schoolId: string;
      expectedStatus: MembershipStatus;
      expectedEndedAt: Date | null;
      endedAt: Date;
    }): Promise<TeacherLifecycleMembershipState>;
    setTransferred(input: {
      membershipId: string;
      schoolId: string;
      endedAt: Date;
    }): Promise<TeacherLifecycleMembershipState>;
    softDelete(input: {
      membershipId: string;
      schoolId: string;
      endedAt: Date;
      deletedAt: Date;
    }): Promise<TeacherLifecycleMembershipState>;
  };
  profile: {
    findLiveById(input: {
      schoolId: string;
      profileId: string;
    }): Promise<TeacherLifecycleProfileState | null>;
    findArchivedById(input: {
      schoolId: string;
      profileId: string;
    }): Promise<TeacherLifecycleProfileState | null>;
    findTrustedByIdIncludingArchived(input: {
      schoolId: string;
      profileId: string;
    }): Promise<TeacherLifecycleProfileState | null>;
    listLiveFootprintsForUser(
      userId: string,
    ): Promise<Array<{ id: string; schoolId: string; userId: string }>>;
    findExactSchoolUserFootprint(input: {
      schoolId: string;
      userId: string;
    }): Promise<TeacherLifecycleProfileState | null>;
    create(input: {
      schoolId: string;
      userId: string;
      employmentStatus: TeacherEmploymentStatus;
      fields: TeacherLifecycleProfileManagedFields;
    }): Promise<TeacherLifecycleProfileState>;
    update(input: {
      schoolId: string;
      profileId: string;
      fields: TeacherLifecycleProfileManagedFields;
    }): Promise<TeacherLifecycleProfileState>;
    restore(input: {
      schoolId: string;
      profileId: string;
      userId: string;
      fields: TeacherLifecycleProfileManagedFields;
    }): Promise<TeacherLifecycleProfileState>;
    setEmploymentStatus(input: {
      schoolId: string;
      profileId: string;
      expectedEmploymentStatus: TeacherEmploymentStatus;
      employmentStatus: TeacherEmploymentStatus;
    }): Promise<TeacherLifecycleProfileState>;
    archive(input: {
      schoolId: string;
      profileId: string;
      deletedAt: Date;
    }): Promise<TeacherLifecycleProfileState>;
  };
  audit: {
    writeSuccessful(entry: TeacherLifecycleSuccessfulAuditEntry): Promise<void>;
  };
  sessions: {
    revokeUserSessions(userId: string, revokedAt: Date): Promise<number>;
  };
}

export abstract class TeacherLifecycleUnitOfWork {
  abstract execute<T>(
    callback: (context: TeacherLifecycleTransactionContext) => Promise<T>,
  ): Promise<T>;
}
