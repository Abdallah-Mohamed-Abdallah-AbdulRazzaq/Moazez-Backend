import {
  AcademicContentAudienceType as Audience,
  AcademicContentTargetScopeType as Scope,
  AcademicContentType as ContentType,
} from '@prisma/client';
import { AcademicContentAudienceResolver } from '../application/academic-content-audience.resolver';
import { AcademicContentAudienceRepository } from '../infrastructure/academic-content-audience.repository';

const schoolId = '00000000-0000-4000-8000-000000000001';
const yearId = '00000000-0000-4000-8000-000000000002';
const termId = '00000000-0000-4000-8000-000000000003';
const gradeId = '00000000-0000-4000-8000-000000000004';
const subjectId = '00000000-0000-4000-8000-000000000005';
const classroomId = '00000000-0000-4000-8000-000000000006';

describe('AcademicContentAudienceResolver', () => {
  function fixture(audience: Audience, taught: boolean) {
    const reads = {
      loadContent: jest.fn().mockResolvedValue({
        id: 'content',
        schoolId,
        academicYearId: yearId,
        termId,
        type: ContentType.GENERAL_RESOURCE,
        audience,
      }),
      loadTargets: jest.fn().mockResolvedValue([
        {
          id: 'grade-target',
          scopeType: Scope.GRADE,
          stageId: null,
          gradeId,
          sectionId: null,
          classroomId: null,
          subjectId,
        },
        {
          id: 'class-target',
          scopeType: Scope.CLASSROOM,
          stageId: null,
          gradeId: null,
          sectionId: null,
          classroomId,
          subjectId: null,
        },
      ]),
      eligibleEnrollments: jest.fn().mockResolvedValue([
        {
          id: 'enrollment-a',
          studentId: 'student-a',
          classroomId,
          student: { userId: null },
          classroom: {
            sectionId: 'section',
            section: { gradeId, grade: { stageId: 'stage' } },
          },
        },
        {
          id: 'enrollment-b',
          studentId: 'student-b',
          classroomId: 'other-class',
          student: { userId: 'user-b' },
          classroom: {
            sectionId: 'section',
            section: { gradeId, grade: { stageId: 'stage' } },
          },
        },
      ]),
      taughtGradeSubjects: jest
        .fn()
        .mockResolvedValue(taught ? [{ gradeId, subjectId }] : []),
      guardianLinks: jest.fn().mockResolvedValue([
        {
          guardianId: 'guardian',
          studentId: 'student-a',
          guardian: { userId: null, canReceiveNotifications: false },
        },
        {
          guardianId: 'guardian',
          studentId: 'student-b',
          guardian: { userId: null, canReceiveNotifications: false },
        },
      ]),
    };
    return {
      reads,
      resolver: new AcademicContentAudienceResolver(
        reads as unknown as AcademicContentAudienceRepository,
      ),
    };
  }

  it('unions overlapping targets, dedupes by enrollment, and retains two guardian-child contexts', async () => {
    const { resolver, reads } = fixture(Audience.STUDENTS_AND_GUARDIANS, true);
    const result = await resolver.resolve('content', schoolId);
    expect(reads.eligibleEnrollments).toHaveBeenCalledWith(
      schoolId,
      yearId,
      termId,
    );
    expect(result.students).toHaveLength(2);
    expect(result.students[0]).toMatchObject({
      studentUserId: null,
      matchedTargetIds: ['class-target', 'grade-target'],
    });
    expect(result.guardians).toHaveLength(2);
    expect(result.guardians.map((row) => row.studentId)).toEqual([
      'student-a',
      'student-b',
    ]);
    expect(result.guardians[0]).toMatchObject({
      recipientUserId: null,
      canReceiveNotifications: false,
    });
    expect(await resolver.resolve('content', schoolId)).toEqual(result);
  });

  it('uses the exact taught-grade matrix for subject-qualified targets', async () => {
    const { resolver } = fixture(Audience.STUDENTS, false);
    const result = await resolver.resolve('content', schoolId);
    expect(result.students).toHaveLength(1);
    expect(result.students[0].matchedTargetIds).toEqual(['class-target']);
    expect(result.guardians).toEqual([]);
  });

  it('returns only the audience mode requested, including no external staff population', async () => {
    const staff = fixture(Audience.INTERNAL_STAFF, true);
    expect(await staff.resolver.resolve('content', schoolId)).toEqual({
      students: [],
      guardians: [],
    });
    expect(staff.reads.eligibleEnrollments).not.toHaveBeenCalled();
    const guardian = fixture(Audience.GUARDIANS, true);
    const result = await guardian.resolver.resolve('content', schoolId);
    expect(result.students).toEqual([]);
    expect(result.guardians).toHaveLength(2);
  });
});
