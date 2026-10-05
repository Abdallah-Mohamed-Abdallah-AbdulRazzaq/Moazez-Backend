import {
  AcademicContentAudienceType as Audience,
  AcademicContentStatus as Status,
  AcademicContentType as Type,
} from '@prisma/client';
import {
  hasTeacherAcademicContentMutableOwnership,
  teacherAcademicContentCapabilities,
} from '../domain/teacher-academic-content-ownership.policy';

const permissions = [
  'academics.academic_content.view',
  'academics.academic_content.manage',
  'academics.academic_content.publish',
];
const target = (teacherUserId = 'teacher') => ({
  teacherSubjectAllocationId: 'allocation',
  teacherSubjectAllocation: { schoolId: 'school', teacherUserId },
});
const content = {
  schoolId: 'school',
  createdByUserId: 'teacher',
  targets: [target()],
  status: Status.DRAFT,
  type: Type.GENERAL_RESOURCE,
  audience: Audience.STUDENTS,
};
const input = {
  content,
  teacherUserId: 'teacher',
  permissions,
  term: {
    startDate: new Date('2030-01-01'),
    endDate: new Date('2030-12-31'),
    isActive: true,
  },
  workflow: { preparationApprovalRequired: false },
  now: new Date('2030-06-01'),
};

describe('Teacher Academic Content mutable ownership and capabilities', () => {
  it('allows edit only for an owned Teacher draft in a writable term', () => {
    expect(teacherAcademicContentCapabilities(input)).toEqual({
      canEdit: true,
      canSubmit: false,
      canPublish: false,
      canUnschedule: false,
      canCancelPublication: false,
      canStartRevision: false,
    });
  });

  it.each([
    { ...content, createdByUserId: 'manager' },
    { ...content, targets: [target(), target('other')] },
    { ...content, targets: [target('other'), target()] },
    { ...content, targets: [target('reassigned')] },
    { ...content, targets: [] },
    {
      ...content,
      targets: [
        { teacherSubjectAllocationId: 'gone', teacherSubjectAllocation: null },
      ],
    },
    {
      ...content,
      targets: [
        {
          ...target(),
          teacherSubjectAllocation: {
            schoolId: 'foreign',
            teacherUserId: 'teacher',
          },
        },
      ],
    },
  ])('denies every mutation when any ownership condition fails: %j', (row) => {
    expect(hasTeacherAcademicContentMutableOwnership(row, 'teacher')).toBe(
      false,
    );
    expect(
      Object.values(
        teacherAcademicContentCapabilities({
          ...input,
          content: row,
          verifiedActions: {
            canSubmit: true,
            canPublish: true,
            canUnschedule: true,
            canCancelPublication: true,
            canStartRevision: true,
          },
        }),
      ),
    ).toEqual([false, false, false, false, false, false]);
  });

  it.each([
    Status.SUBMITTED,
    Status.APPROVED,
    Status.PUBLISHED,
    Status.ARCHIVED,
    Status.SCHEDULED,
  ])('keeps %s read-only', (status) => {
    expect(
      teacherAcademicContentCapabilities({
        ...input,
        content: { ...content, status },
      }).canEdit,
    ).toBe(false);
  });

  it('denies edit for missing, ended, inactive current terms and missing manage permission', () => {
    for (const term of [
      null,
      { ...input.term, endDate: new Date('2029-12-31') },
      { ...input.term, isActive: false },
    ])
      expect(
        teacherAcademicContentCapabilities({ ...input, term }).canEdit,
      ).toBe(false);
    expect(
      teacherAcademicContentCapabilities({
        ...input,
        permissions: [permissions[0]],
      }).canEdit,
    ).toBe(false);
  });

  it('requires core workflow, status, publication strategy and independently verified business state', () => {
    const preparation = {
      ...content,
      type: Type.TEACHER_PREPARATION,
      audience: Audience.INTERNAL_STAFF,
    };
    expect(
      teacherAcademicContentCapabilities({
        ...input,
        content: preparation,
        workflow: { preparationApprovalRequired: true },
        verifiedActions: { canSubmit: true, canPublish: true },
      }),
    ).toMatchObject({ canSubmit: true, canPublish: false });
    expect(
      teacherAcademicContentCapabilities({
        ...input,
        verifiedActions: { canSubmit: true, canPublish: true },
      }),
    ).toMatchObject({ canSubmit: false, canPublish: true });
    expect(
      teacherAcademicContentCapabilities({
        ...input,
        content: { ...content, status: Status.CHANGES_REQUESTED },
        verifiedActions: { canPublish: true },
      }).canPublish,
    ).toBe(false);
  });
});
