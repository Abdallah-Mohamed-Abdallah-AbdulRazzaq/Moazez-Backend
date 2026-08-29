/* eslint-disable @typescript-eslint/no-unsafe-argument -- Jest asymmetric error matchers are intentionally passed through to toThrow. */
import {
  MembershipStatus,
  StudentCredentialAudienceMode,
  StudentCredentialMode,
  StudentCredentialBatchStatus,
  StudentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../../../common/context/request-context';
import { BullmqService } from '../../../../infrastructure/queue/bullmq.service';
import { CreateStudentCredentialBatchUseCase } from '../application/create-student-credential-batch.use-case';
import { StudentCredentialAudienceService } from '../application/student-credential-audience.service';
import {
  parseStudentCredentialAudience,
  parseStudentCredentialMode,
} from '../domain/student-credential-audience';
import { STUDENT_CREDENTIAL_MODE_API_VALUES } from '../domain/student-credential.types';
import { StudentCredentialBatchRepository } from '../infrastructure/student-credential-batch.repository';

const UUIDS = {
  student: '00000000-0000-4000-8000-000000000001',
  student2: '00000000-0000-4000-8000-000000000002',
  source: '00000000-0000-4000-8000-000000000003',
  year: '00000000-0000-4000-8000-000000000004',
  stage: '00000000-0000-4000-8000-000000000005',
  grade: '00000000-0000-4000-8000-000000000006',
  section: '00000000-0000-4000-8000-000000000007',
  classroom: '00000000-0000-4000-8000-000000000008',
  enrollment: '00000000-0000-4000-8000-000000000009',
} as const;

describe('student credential audience contracts', () => {
  it.each([
    ['import_batch', { sourceRegistrationBatchId: UUIDS.source }],
    ['selected_students', { studentIds: [UUIDS.student] }],
    ['academic_year', { academicYearId: UUIDS.year }],
    ['stage', { academicYearId: UUIDS.year, stageId: UUIDS.stage }],
    ['grade', { academicYearId: UUIDS.year, gradeId: UUIDS.grade }],
    ['section', { academicYearId: UUIDS.year, sectionId: UUIDS.section }],
    ['classroom', { academicYearId: UUIDS.year, classroomId: UUIDS.classroom }],
    ['missing_password', {}],
  ])('accepts the exact %s selector combination', (audienceMode, selectors) => {
    expect(
      parseStudentCredentialAudience({ audienceMode, ...selectors }),
    ).toMatchObject({
      audienceMode: audienceMode.toUpperCase(),
    });
  });

  it('rejects selected audiences above the 10,000 target bound', () => {
    expect(() =>
      parseStudentCredentialAudience({
        audienceMode: 'selected_students',
        studentIds: Array.from({ length: 10_001 }, () => UUIDS.student),
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'students.credentials.audience_invalid',
        details: { reasonCode: 'selected_students_limit_exceeded' },
      }),
    );
  });

  it('rejects mixed selectors, duplicates, invalid UUIDs, and unknown modes with the stable 422 code', () => {
    for (const command of [
      {
        audienceMode: 'import_batch',
        sourceRegistrationBatchId: UUIDS.source,
        academicYearId: UUIDS.year,
      },
      {
        audienceMode: 'selected_students',
        studentIds: [UUIDS.student, UUIDS.student],
      },
      { audienceMode: 'selected_students', studentIds: ['not-a-uuid'] },
      { audienceMode: 'unknown' },
    ]) {
      expect(() => parseStudentCredentialAudience(command)).toThrow(
        expect.objectContaining({
          code: 'students.credentials.audience_invalid',
          httpStatus: 422,
        }),
      );
    }
  });

  it('accepts only the two external credential modes', () => {
    expect(STUDENT_CREDENTIAL_MODE_API_VALUES).toEqual([
      'unique_generated',
      'shared_temporary',
    ]);
    expect(
      parseStudentCredentialMode({
        audienceMode: 'missing_password',
        credentialMode: 'unique_generated',
      }),
    ).toBe(StudentCredentialMode.UNIQUE_GENERATED);
    expect(() =>
      parseStudentCredentialMode({
        audienceMode: 'missing_password',
        credentialMode: 'UNIQUE_GENERATED',
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'students.credentials.audience_invalid',
      }),
    );
    expect(() =>
      parseStudentCredentialMode({
        audienceMode: 'missing_password',
        credentialMode: 'shared_admin_provided',
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'students.credentials.audience_invalid',
      }),
    );
  });

  it('keeps a missing-password Student eligible when optional placement is unavailable', async () => {
    const repository = {
      resolveAudienceCandidates: jest.fn().mockResolvedValue({
        students: [studentFixture()],
        totalMatched: 1,
        missingSelectedStudents: 0,
        references: new Map([
          [
            UUIDS.student,
            {
              studentId: UUIDS.student,
              expectedUserId: null,
              enrollmentId: null,
            },
          ],
        ]),
      }),
    };
    const service = new StudentCredentialAudienceService(
      repository as unknown as StudentCredentialBatchRepository,
    );

    const result = await service.resolve(scope(), {
      audienceMode: StudentCredentialAudienceMode.MISSING_PASSWORD,
      sourceRegistrationBatchId: null,
      studentIds: [],
      academicYearId: null,
      stageId: null,
      gradeId: null,
      sectionId: null,
      classroomId: null,
    });

    expect(result.eligible).toHaveLength(1);
    expect(result.eligible[0]?.enrollmentId).toBeNull();
    expect(result.skipped).toBe(0);
  });

  it('partitions current tenant eligibility and reports inaccessible selected ids only as an aggregate', async () => {
    const repository = {
      resolveAudienceCandidates: jest.fn().mockResolvedValue({
        students: [
          studentFixture(),
          studentFixture({
            id: UUIDS.student2,
            user: { ...studentFixture().user, passwordHash: 'hash' },
          }),
        ],
        totalMatched: 3,
        missingSelectedStudents: 1,
        references: new Map([
          [
            UUIDS.student,
            {
              studentId: UUIDS.student,
              expectedUserId: null,
              enrollmentId: UUIDS.enrollment,
            },
          ],
          [
            UUIDS.student2,
            {
              studentId: UUIDS.student2,
              expectedUserId: null,
              enrollmentId: null,
            },
          ],
        ]),
      }),
    };
    const service = new StudentCredentialAudienceService(
      repository as unknown as StudentCredentialBatchRepository,
    );
    const result = await service.resolve(scope(), {
      audienceMode: StudentCredentialAudienceMode.MISSING_PASSWORD,
      sourceRegistrationBatchId: null,
      studentIds: [],
      academicYearId: null,
      stageId: null,
      gradeId: null,
      sectionId: null,
      classroomId: null,
    });

    expect(result.eligible).toHaveLength(1);
    expect(result.eligible[0]?.enrollmentId).toBe(UUIDS.enrollment);
    expect(result.skippedReasons).toEqual({
      inaccessible_or_not_found: 1,
      password_already_present: 1,
    });
    expect(JSON.stringify(result)).not.toContain('missing-student-id');
  });

  it('persists before enqueue and returns the accepted batch when Redis is unavailable', async () => {
    const audience = {
      resolve: jest.fn().mockResolvedValue({
        totalMatched: 1,
        eligible: [
          {
            studentId: UUIDS.student,
            userId: '00000000-0000-4000-8000-000000000011',
            enrollmentId: UUIDS.enrollment,
            credentialVersion: 0,
            fullName: 'Student One',
            username: 'student.one',
            loginEmail: 'student.one@example.test',
            hasPassword: false,
            mustChangePassword: false,
          },
        ],
        skipped: 0,
        skippedReasons: {},
      }),
    };
    const repository = {
      createBatch: jest.fn().mockResolvedValue(batchFixture()),
    };
    const bullmq = {
      ensureJobFromPersistedTruth: jest
        .fn()
        .mockRejectedValue(new Error('queue_redis_unavailable')),
    };
    const useCase = new CreateStudentCredentialBatchUseCase(
      audience as never,
      repository as unknown as StudentCredentialBatchRepository,
      bullmq as unknown as BullmqService,
    );

    const result = await inScope(() =>
      useCase.execute({
        audienceMode: 'selected_students',
        studentIds: [UUIDS.student],
        credentialMode: 'unique_generated',
      }),
    );

    expect(result.status).toBe('pending');
    expect(repository.createBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        targets: [expect.objectContaining({ enrollmentId: UUIDS.enrollment })],
      }),
    );
    expect(repository.createBatch.mock.invocationCallOrder[0]).toBeLessThan(
      bullmq.ensureJobFromPersistedTruth.mock.invocationCallOrder[0],
    );
    expect(bullmq.ensureJobFromPersistedTruth).toHaveBeenCalledWith(
      'files-imports',
      'execute-student-credential-batch',
      { batchId: 'batch-1' },
      expect.objectContaining({
        jobId: 'student-credential-batch-execution-batch-1',
        attempts: 3,
      }),
    );
  });
});

function scope() {
  return {
    actorId: 'actor-1',
    userType: UserType.SCHOOL_USER,
    organizationId: 'organization-1',
    schoolId: 'school-1',
    roleId: 'role-1',
  };
}

async function inScope<T>(callback: () => Promise<T>): Promise<T> {
  const context = createRequestContext('student-credential-test');
  context.actor = { id: 'actor-1', userType: UserType.SCHOOL_USER };
  context.activeMembership = {
    membershipId: 'membership-1',
    organizationId: 'organization-1',
    schoolId: 'school-1',
    roleId: 'role-1',
    permissions: [],
  };
  return runWithRequestContext(context, callback);
}

function studentFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: UUIDS.student,
    schoolId: 'school-1',
    organizationId: 'organization-1',
    userId: '00000000-0000-4000-8000-000000000011',
    firstName: 'Student',
    lastName: 'One',
    status: StudentStatus.ACTIVE,
    deletedAt: null,
    user: {
      id: '00000000-0000-4000-8000-000000000011',
      email: 'student.one@example.test',
      username: 'student.one',
      passwordHash: null,
      mustChangePassword: false,
      credentialVersion: 0,
      userType: UserType.STUDENT,
      status: UserStatus.ACTIVE,
      deletedAt: null,
      memberships: [
        {
          id: 'membership-1',
          schoolId: 'school-1',
          organizationId: 'organization-1',
          userType: UserType.STUDENT,
          status: MembershipStatus.ACTIVE,
          deletedAt: null,
        },
      ],
    },
    ...overrides,
  };
}

function batchFixture() {
  const now = new Date('2026-08-27T10:00:00.000Z');
  return {
    id: 'batch-1',
    schoolId: 'school-1',
    organizationId: 'organization-1',
    audienceMode: StudentCredentialAudienceMode.SELECTED_STUDENTS,
    credentialMode: StudentCredentialMode.UNIQUE_GENERATED,
    sourceRegistrationBatchId: null,
    academicYearId: null,
    stageId: null,
    gradeId: null,
    sectionId: null,
    classroomId: null,
    status: StudentCredentialBatchStatus.PENDING,
    totalRows: 1,
    generatedRows: 0,
    skippedRows: 0,
    failedRows: 0,
    createdById: 'actor-1',
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
  };
}
