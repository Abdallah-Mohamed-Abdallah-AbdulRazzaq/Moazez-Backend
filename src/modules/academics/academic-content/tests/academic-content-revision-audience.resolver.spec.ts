import {
  AcademicContentAudienceType as Audience,
  AcademicContentTargetScopeType as Scope,
  AcademicContentType as Type,
  Prisma,
} from '@prisma/client';
import { AcademicContentRevisionAudienceResolver } from '../application/academic-content-revision-audience.resolver';
import { AcademicContentAudienceRepository } from '../infrastructure/academic-content-audience.repository';
import {
  AcademicAudienceEnrollment,
  AcademicAudienceTarget,
  academicAudienceSubjectRequirements,
  matchAcademicAudienceGuardians,
  matchAcademicAudienceStudents,
} from '../domain/academic-content-audience-matcher';

const enrollment = (id = 'e1'): AcademicAudienceEnrollment => ({
  id,
  studentId: `student-${id}`,
  classroomId: 'class',
  student: { userId: null },
  classroom: {
    sectionId: 'section',
    section: { gradeId: 'grade', grade: { stageId: 'stage' } },
  },
});
const target = (
  scopeType: Scope,
  id = 'frozen-target',
): AcademicAudienceTarget => ({
  id,
  scopeType,
  stageId: scopeType === Scope.STAGE ? 'stage' : null,
  gradeId: scopeType === Scope.GRADE ? 'grade' : null,
  sectionId: scopeType === Scope.SECTION ? 'section' : null,
  classroomId: scopeType === Scope.CLASSROOM ? 'class' : null,
  subjectId: null,
});

describe('shared academic audience matcher', () => {
  it.each(Object.values(Scope))(
    'matches %s scope and rejects a different hierarchy',
    (scope) => {
      expect(
        matchAcademicAudienceStudents([target(scope)], [enrollment()], []),
      ).toHaveLength(1);
      if (scope === Scope.SCHOOL) return;
      const other = enrollment();
      other.classroomId = 'other';
      other.classroom.sectionId = 'other';
      other.classroom.section.gradeId = 'other';
      other.classroom.section.grade.stageId = 'other';
      expect(
        matchAcademicAudienceStudents([target(scope)], [other], []),
      ).toEqual([]);
    },
  );
  it('requires the taught grade/subject matrix only for subject-qualified targets', () => {
    const qualified = { ...target(Scope.SCHOOL), subjectId: 'subject' };
    expect(
      matchAcademicAudienceStudents([qualified], [enrollment()], []),
    ).toEqual([]);
    expect(
      matchAcademicAudienceStudents(
        [qualified],
        [enrollment()],
        [{ gradeId: 'other', subjectId: 'subject' }],
      ),
    ).toEqual([]);
    expect(
      matchAcademicAudienceStudents(
        [qualified],
        [enrollment()],
        [{ gradeId: 'grade', subjectId: 'subject' }],
      ),
    ).toHaveLength(1);
    expect(
      academicAudienceSubjectRequirements(
        [qualified, qualified, target(Scope.SCHOOL)],
        [enrollment(), enrollment()],
      ),
    ).toEqual({ subjectIds: ['subject'], gradeIds: ['grade'] });
  });
  it('deduplicates Enrollment and sorts the unique union of exact target identities', () => {
    const students = matchAcademicAudienceStudents(
      [
        target(Scope.SCHOOL, 'z'),
        target(Scope.CLASSROOM, 'a'),
        target(Scope.CLASSROOM, 'a'),
      ],
      [enrollment('e2'), enrollment(), enrollment()],
      [],
    );
    expect(students.map((row) => row.enrollmentId)).toEqual(['e1', 'e2']);
    expect(students[0]).toMatchObject({
      studentUserId: null,
      matchedTargetIds: ['a', 'z'],
    });
  });
  it.each([false, null, true])(
    'preserves nullable accounts and notification metadata %s for distinct child contexts',
    (preference) => {
      const students = matchAcademicAudienceStudents(
        [target(Scope.SCHOOL, 'a')],
        [enrollment(), enrollment('e2')],
        [],
      );
      const links = students.map((row) => ({
        studentId: row.studentId,
        guardianId: 'guardian',
        guardian: { userId: null, canReceiveNotifications: preference },
      }));
      const contexts = matchAcademicAudienceGuardians(students, [
        ...links,
        ...links,
      ]);
      expect(contexts).toHaveLength(2);
      for (const context of contexts)
        expect(context).toMatchObject({
          classroomId: 'class',
          recipientUserId: null,
          canReceiveNotifications: preference,
          matchedTargetIds: ['a'],
        });
      const withAccount = links.map((row) => ({
        ...row,
        guardian: { ...row.guardian, userId: 'same-account' },
      }));
      expect(
        matchAcademicAudienceGuardians(students, withAccount).map(
          (row) => row.recipientUserId,
        ),
      ).toEqual(['same-account', 'same-account']);
    },
  );
  it('unions attribution across repeated guardian/enrollment contexts', () => {
    const base = matchAcademicAudienceStudents(
      [target(Scope.SCHOOL, 'z')],
      [enrollment()],
      [],
    )[0];
    const result = matchAcademicAudienceGuardians(
      [base, { ...base, matchedTargetIds: ['a', 'z'] }],
      [
        {
          studentId: base.studentId,
          guardianId: 'guardian',
          guardian: { userId: null, canReceiveNotifications: false },
        },
      ],
    );
    expect(result).toHaveLength(1);
    expect(result[0].matchedTargetIds).toEqual(['a', 'z']);
  });
});

describe('Revision V2 audience resolver', () => {
  function fixture(
    audience: Audience = Audience.STUDENTS_AND_GUARDIANS,
    type: Type = Type.GENERAL_RESOURCE,
  ) {
    const revision = {
      academicYearId: 'frozen-year',
      termId: 'frozen-term',
      type,
      audience,
      targets: [{ ...target(Scope.CLASSROOM), subjectId: 'subject' }],
    };
    const reads = {
      eligibleEnrollments: jest.fn().mockResolvedValue([enrollment()]),
      taughtGradeSubjects: jest
        .fn()
        .mockResolvedValue([{ gradeId: 'grade', subjectId: 'subject' }]),
      guardianLinks: jest.fn().mockResolvedValue([
        {
          studentId: 'student-e1',
          guardianId: 'guardian',
          guardian: { userId: null, canReceiveNotifications: false },
        },
      ]),
    };
    const tx = {
      academicContentRevision: {
        findFirst: jest.fn().mockResolvedValue(revision),
      },
      academicContentTarget: {
        findMany: jest.fn(() => {
          throw new Error('Mutable targets accessed');
        }),
      },
    };
    const resolver = new AcademicContentRevisionAudienceResolver(
      reads as unknown as AcademicContentAudienceRepository,
    );
    const identity = {
      schoolId: 'school',
      contentId: 'content',
      revisionId: 'revision',
    };
    return {
      revision,
      reads,
      tx,
      resolver,
      identity,
      resolve: () =>
        resolver.resolve(tx as unknown as Prisma.TransactionClient, identity),
    };
  }
  it.each([
    Audience.STUDENTS,
    Audience.GUARDIANS,
    Audience.STUDENTS_AND_GUARDIANS,
  ])(
    'resolves %s from exact frozen identity using the explicit transaction',
    async (mode) => {
      const f = fixture(mode);
      const resolved = await f.resolve();
      expect(f.tx.academicContentRevision.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'revision',
            schoolId: 'school',
            academicContentId: 'content',
            snapshotContractVersion: 2,
          },
        }),
      );
      expect(f.reads.eligibleEnrollments).toHaveBeenCalledWith(
        'school',
        'frozen-year',
        'frozen-term',
        f.tx,
      );
      expect(f.reads.taughtGradeSubjects).toHaveBeenCalledWith(
        'school',
        'frozen-year',
        'frozen-term',
        ['grade'],
        ['subject'],
        f.tx,
      );
      expect(f.tx.academicContentTarget.findMany).not.toHaveBeenCalled();
      expect(resolved.students).toHaveLength(
        mode === Audience.GUARDIANS ? 0 : 1,
      );
      expect(resolved.guardians).toHaveLength(
        mode === Audience.STUDENTS ? 0 : 1,
      );
      if (mode !== Audience.GUARDIANS)
        expect(resolved.students[0]).toEqual({
          studentId: 'student-e1',
          enrollmentId: 'e1',
          classroomId: 'class',
          recipientUserId: null,
          matchedRevisionTargetIds: ['frozen-target'],
        });
      if (mode !== Audience.STUDENTS) {
        expect(f.reads.guardianLinks).toHaveBeenCalledWith(
          'school',
          ['student-e1'],
          f.tx,
        );
        expect(resolved.guardians[0]).toMatchObject({
          classroomId: 'class',
          recipientUserId: null,
          guardianCanReceiveNotifications: false,
          matchedRevisionTargetIds: ['frozen-target'],
        });
      }
    },
  );
  it('fails closed when exact scoped V2 revision is missing', async () => {
    const f = fixture();
    f.tx.academicContentRevision.findFirst.mockResolvedValue(null);
    await expect(f.resolve()).rejects.toMatchObject({
      code: 'not_found',
    });
    expect(f.reads.eligibleEnrollments).not.toHaveBeenCalled();
  });
  it.each([
    [Audience.INTERNAL_STAFF, Type.TEACHER_PREPARATION],
    [Audience.INTERNAL_STAFF, Type.GENERAL_RESOURCE],
  ])(
    'rejects nonexternal frozen type/audience %s %s',
    async (audience, type) => {
      const f = fixture(audience, type);
      await expect(f.resolve()).rejects.toMatchObject({
        code: 'academic_content.publication.audience_unavailable',
      });
      expect(f.reads.eligibleEnrollments).not.toHaveBeenCalled();
    },
  );
});
