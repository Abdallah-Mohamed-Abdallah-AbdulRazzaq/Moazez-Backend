import { StudentStatus, UserStatus, UserType } from '@prisma/client';
import type {
  ParentProfileChildRecord,
  ParentProfileGuardianRecord,
  ParentProfileIdentityRecord,
} from '../infrastructure/parent-profile-read.adapter';
import { ParentProfilePresenter } from '../presenters/parent-profile.presenter';

describe('ParentProfilePresenter', () => {
  it('presents the safe Parent App profile contract', () => {
    const result = ParentProfilePresenter.present({
      parent: parentIdentityFixture(),
      guardians: [guardianFixture()],
      children: [childFixture()],
      school: { name: 'Moazez Demo School', logoUrl: null },
    });

    expect(result).toEqual({
      parent: {
        userId: 'parent-user-1',
        displayName: 'Mona Parent',
        firstName: 'Mona',
        lastName: 'Parent',
        email: 'parent@example.test',
        phone: null,
        avatarUrl: null,
      },
      guardians: [
        {
          guardianId: 'guardian-1',
          relationship: 'mother',
          isPrimary: true,
        },
      ],
      children: [
        {
          studentId: 'student-1',
          displayName: 'Sara Child',
          enrollmentId: 'enrollment-1',
        },
      ],
      school: { name: 'Moazez Demo School', logoUrl: null },
      unsupported: {
        avatarUpload: true,
        preferences: true,
        supportTickets: true,
        addChild: true,
      },
    });
  });

  it('does not expose forbidden profile fields', () => {
    const serialized = JSON.stringify(
      ParentProfilePresenter.present({
        parent: parentIdentityFixture(),
        guardians: [guardianFixture()],
        children: [childFixture()],
        school: { name: 'Moazez Demo School', logoUrl: null },
      }),
    );

    for (const forbidden of [
      'schoolId',
      'organizationId',
      'scheduleId',
      'medical',
      'document',
      'internalNote',
      'private',
      'password',
      'session',
      'token',
      'objectKey',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

function parentIdentityFixture(): ParentProfileIdentityRecord {
  return {
    id: 'parent-user-1',
    email: 'parent@example.test',
    phone: null,
    firstName: 'Mona',
    lastName: 'Parent',
    userType: UserType.PARENT,
    status: UserStatus.ACTIVE,
    deletedAt: null,
  };
}

function guardianFixture(): ParentProfileGuardianRecord {
  return {
    id: 'guardian-1',
    relation: 'mother',
    isPrimary: true,
  };
}

function childFixture(): ParentProfileChildRecord {
  return {
    id: 'enrollment-1',
    studentId: 'student-1',
    student: {
      id: 'student-1',
      firstName: 'Sara',
      lastName: 'Child',
      status: StudentStatus.ACTIVE,
    },
  };
}
