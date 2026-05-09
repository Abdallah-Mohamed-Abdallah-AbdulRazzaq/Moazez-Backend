import { StudentStatus } from '@prisma/client';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import {
  ParentAppChildNotFoundException,
  ParentAppRequiredParentException,
} from '../../shared/parent-app-errors';
import type {
  ParentAppAccessibleChild,
  ParentAppContext,
} from '../../shared/parent-app.types';
import { GetParentChildUseCase } from '../application/get-parent-child.use-case';
import { ListParentChildrenUseCase } from '../application/list-parent-children.use-case';
import {
  ParentChildrenReadAdapter,
  type ParentChildEnrollmentRecord,
} from '../infrastructure/parent-children-read.adapter';

describe('Parent Children use-cases', () => {
  it('children list rejects non-parent actors through ParentAppAccessService', async () => {
    const { listUseCase, accessService, readAdapter } = createUseCases();
    accessService.getParentAppContext.mockRejectedValue(
      new ParentAppRequiredParentException({ reason: 'actor_not_parent' }),
    );

    await expect(listUseCase.execute()).rejects.toMatchObject({
      code: 'parent_app.actor.required_parent',
    });
    expect(readAdapter.listChildren).not.toHaveBeenCalled();
  });

  it('children list returns linked current-school children only', async () => {
    const { listUseCase, accessService, readAdapter } = createUseCases();
    accessService.getParentAppContext.mockResolvedValue(contextFixture());
    readAdapter.listChildren.mockResolvedValue([
      childFixture(),
      childFixture({
        id: 'enrollment-2',
        studentId: 'student-2',
        student: {
          id: 'student-2',
          firstName: 'Omar',
          lastName: 'Child',
          status: StudentStatus.ACTIVE,
        },
      }),
    ]);

    const result = await listUseCase.execute();

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          studentId: 'student-1',
          enrollmentId: 'enrollment-1',
          displayName: 'Sara Child',
        }),
        expect.objectContaining({
          studentId: 'student-2',
          enrollmentId: 'enrollment-2',
          displayName: 'Omar Child',
        }),
      ]),
    );
    expect(JSON.stringify(result)).not.toContain('cross-school-student');
  });

  it('child detail accepts an owned current-school child', async () => {
    const { detailUseCase, accessService, readAdapter } = createUseCases();
    accessService.assertParentOwnsStudent.mockResolvedValue(accessibleChild());
    readAdapter.findChild.mockResolvedValue(childFixture());

    const result = await detailUseCase.execute('student-1');

    expect(accessService.assertParentOwnsStudent).toHaveBeenCalledWith(
      'student-1',
    );
    expect(readAdapter.findChild).toHaveBeenCalledWith(accessibleChild());
    expect(result.student).toEqual({
      studentId: 'student-1',
      displayName: 'Sara Child',
      avatarUrl: null,
      status: 'active',
    });
    expect(result.unsupported).toEqual({
      schedule: true,
      homeworks: true,
      pickup: true,
    });
  });

  it('child detail rejects same-school unlinked and cross-school child ids as safe 404', async () => {
    const { detailUseCase, accessService, readAdapter } = createUseCases();
    accessService.assertParentOwnsStudent.mockRejectedValue(
      new ParentAppChildNotFoundException({ studentId: 'blocked-student' }),
    );

    await expect(
      detailUseCase.execute('same-school-unlinked'),
    ).rejects.toMatchObject({
      code: 'parent_app.child.not_found',
    });
    await expect(
      detailUseCase.execute('cross-school-child'),
    ).rejects.toMatchObject({
      code: 'parent_app.child.not_found',
    });
    expect(readAdapter.findChild).not.toHaveBeenCalled();
  });

  it('does not expose school, organization, schedule, medical, document, or guardian private fields', async () => {
    const { detailUseCase, accessService, readAdapter } = createUseCases();
    accessService.assertParentOwnsStudent.mockResolvedValue(accessibleChild());
    readAdapter.findChild.mockResolvedValue(childFixture());

    const serialized = JSON.stringify(await detailUseCase.execute('student-1'));

    for (const forbidden of [
      'schoolId',
      'organizationId',
      'scheduleId',
      'medical',
      'document',
      'internalNote',
      'guardian',
      'private-phone',
      'password',
      'session',
      'token',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

function createUseCases(): {
  listUseCase: ListParentChildrenUseCase;
  detailUseCase: GetParentChildUseCase;
  accessService: jest.Mocked<ParentAppAccessService>;
  readAdapter: jest.Mocked<ParentChildrenReadAdapter>;
} {
  const accessService = {
    getParentAppContext: jest.fn(),
    assertParentOwnsStudent: jest.fn(),
  } as unknown as jest.Mocked<ParentAppAccessService>;
  const readAdapter = {
    listChildren: jest.fn(),
    findChild: jest.fn(),
  } as unknown as jest.Mocked<ParentChildrenReadAdapter>;

  return {
    listUseCase: new ListParentChildrenUseCase(accessService, readAdapter),
    detailUseCase: new GetParentChildUseCase(accessService, readAdapter),
    accessService,
    readAdapter,
  };
}

function contextFixture(): ParentAppContext {
  return {
    parentUserId: 'parent-user-1',
    schoolId: 'school-1',
    organizationId: 'org-1',
    membershipId: 'membership-1',
    roleId: 'role-1',
    permissions: ['students.records.view'],
    guardianIds: ['guardian-1'],
    children: [
      accessibleChild(),
      accessibleChild({
        studentId: 'student-2',
        enrollmentId: 'enrollment-2',
        classroomId: 'classroom-2',
      }),
    ],
  };
}

function accessibleChild(
  overrides?: Partial<ParentAppAccessibleChild>,
): ParentAppAccessibleChild {
  return {
    studentId: 'student-1',
    enrollmentId: 'enrollment-1',
    classroomId: 'classroom-1',
    academicYearId: 'year-1',
    termId: 'term-1',
    ...overrides,
  };
}

function childFixture(
  overrides?: Partial<ParentChildEnrollmentRecord>,
): ParentChildEnrollmentRecord {
  return {
    id: 'enrollment-1',
    studentId: 'student-1',
    academicYearId: 'year-1',
    termId: 'term-1',
    student: {
      id: 'student-1',
      firstName: 'Sara',
      lastName: 'Child',
      status: StudentStatus.ACTIVE,
    },
    classroom: {
      id: 'classroom-1',
      nameAr: 'Grade 4A AR',
      nameEn: 'Grade 4A',
      section: {
        id: 'section-1',
        nameAr: 'Section A AR',
        nameEn: 'Section A',
        grade: {
          id: 'grade-1',
          nameAr: 'Grade 4 AR',
          nameEn: 'Grade 4',
          stage: {
            id: 'stage-1',
            nameAr: 'Primary AR',
            nameEn: 'Primary',
          },
        },
      },
    },
    ...overrides,
  };
}
