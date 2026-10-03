import {
  AcademicContentAudienceType as Audience,
  AcademicContentTargetScopeType as Scope,
  AcademicContentType as Type,
  Prisma,
} from '@prisma/client';
import {
  AcademicContentRevisionAudience,
  AcademicContentRevisionGuardianContext,
  AcademicContentRevisionAudienceResolver,
} from '../infrastructure/academic-content-revision-audience.resolver';
import {
  AcademicContentAudienceRepository,
  ACADEMIC_CONTENT_PUBLICATION_AUDIENCE_PAGE_SIZE,
} from '../infrastructure/academic-content-audience.repository';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
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
      targets: [
        { ...target(Scope.CLASSROOM), subjectId: 'subject' },
      ] as AcademicAudienceTarget[],
    };
    const reads = {
      eligibleEnrollmentsPage: jest.fn().mockResolvedValue([enrollment()]),
      taughtGradeSubjects: jest
        .fn()
        .mockResolvedValue([{ gradeId: 'grade', subjectId: 'subject' }]),
      guardianLinksPage: jest.fn().mockResolvedValue([
        {
          id: 'link-1',
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
      resolve: async () => {
        const result: AcademicContentRevisionAudience = {
          students: [],
          guardians: [],
        };
        for await (const batch of resolver.resolveBatches(
          tx as unknown as Prisma.TransactionClient,
          identity,
        )) {
          result.students.push(...batch.students);
          result.guardians.push(...batch.guardians);
        }
        return result;
      },
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
      expect(f.reads.eligibleEnrollmentsPage).toHaveBeenCalledWith(
        'school',
        'frozen-year',
        'frozen-term',
        undefined,
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
        expect(f.reads.guardianLinksPage).toHaveBeenCalledWith(
          'school',
          ['student-e1'],
          undefined,
          f.tx,
        );
        expect(resolved.guardians[0]).toMatchObject({
          classroomId: 'class',
          recipientUserId: null,
          guardianCanReceiveNotifications: false,
          matchedRevisionTargetIds: ['frozen-target'],
        });
      } else {
        expect(f.reads.guardianLinksPage).not.toHaveBeenCalled();
      }
    },
  );
  it('fails closed when exact scoped V2 revision is missing', async () => {
    const f = fixture();
    f.tx.academicContentRevision.findFirst.mockResolvedValue(null);
    await expect(f.resolve()).rejects.toMatchObject({
      code: 'not_found',
    });
    expect(f.reads.eligibleEnrollmentsPage).not.toHaveBeenCalled();
  });
  it('fails closed before any relationship reads when the exact V2 revision has no frozen targets', async () => {
    const f = fixture();
    f.revision.targets = [];
    await expect(f.resolve()).rejects.toMatchObject({
      code: 'academic_content.publication.snapshot_conflict',
      httpStatus: 409,
    });
    expect(f.reads.eligibleEnrollmentsPage).not.toHaveBeenCalled();
    expect(f.reads.taughtGradeSubjects).not.toHaveBeenCalled();
    expect(f.reads.guardianLinksPage).not.toHaveBeenCalled();
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
      expect(f.reads.eligibleEnrollmentsPage).not.toHaveBeenCalled();
    },
  );

  it('advances Enrollment cursors and qualifies subjects set-wise for each page', async () => {
    const f = fixture(Audience.STUDENTS);
    f.revision.targets = [
      { ...target(Scope.SCHOOL, 'z'), subjectId: 'subject' },
      target(Scope.SCHOOL, 'a'),
    ];
    const first = Array.from({ length: 500 }, (_, i) =>
      enrollment(`e${String(i).padStart(4, '0')}`),
    );
    const last = Array.from({ length: 5 }, (_, i) => {
      const row = enrollment(`e${i + 500}`);
      row.classroom.section.gradeId = 'other-grade';
      return row;
    });
    f.reads.eligibleEnrollmentsPage
      .mockReset()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(last);
    f.reads.taughtGradeSubjects
      .mockReset()
      .mockResolvedValueOnce([{ gradeId: 'grade', subjectId: 'subject' }])
      .mockResolvedValueOnce([]);
    const result = await f.resolve();
    expect(result.students).toHaveLength(505);
    expect(result.students[0].matchedRevisionTargetIds).toEqual(['a', 'z']);
    expect(result.students[504].matchedRevisionTargetIds).toEqual(['a']);
    expect(
      f.reads.eligibleEnrollmentsPage.mock.calls.map(
        (args: unknown[]) => args[3],
      ),
    ).toEqual([undefined, first[499].id]);
    expect(f.reads.taughtGradeSubjects).toHaveBeenNthCalledWith(
      2,
      'school',
      'frozen-year',
      'frozen-term',
      ['other-grade'],
      ['subject'],
      f.tx,
    );
    expect(f.tx.academicContentRevision.findFirst).toHaveBeenCalledTimes(1);
    expect(f.tx.academicContentTarget.findMany).not.toHaveBeenCalled();
    expect(f.reads.guardianLinksPage).not.toHaveBeenCalled();
  });

  it('bounds Guardian link expansion even with multiple Enrollment contexts per Student', async () => {
    const f = fixture(Audience.GUARDIANS);
    f.revision.targets = [
      target(Scope.SCHOOL, 'z'),
      target(Scope.CLASSROOM, 'a'),
    ];
    const child = enrollment('e1');
    f.reads.eligibleEnrollmentsPage.mockResolvedValue([
      child,
      { ...child, id: 'e2' },
    ]);
    const links = Array.from({ length: 501 }, (_, i) => ({
      id: `link-${i}`,
      studentId: child.studentId,
      guardianId: `guardian-${i}`,
      guardian: {
        userId: null,
        canReceiveNotifications: i % 2 === 0 ? false : null,
      },
    }));
    f.reads.guardianLinksPage
      .mockReset()
      .mockResolvedValueOnce(links.slice(0, 500))
      .mockResolvedValueOnce(links.slice(500));
    const sizes: number[] = [];
    const contexts: AcademicContentRevisionGuardianContext[] = [];
    for await (const batch of f.resolver.resolveBatches(
      f.tx as unknown as Prisma.TransactionClient,
      f.identity,
    )) {
      expect(batch.students).toEqual([]);
      sizes.push(batch.guardians.length);
      contexts.push(...batch.guardians);
    }
    expect(sizes).toEqual([500, 500, 2]);
    expect(contexts).toHaveLength(1002);
    expect(
      new Set(
        contexts.map((row) =>
          JSON.stringify([row.guardianId, row.studentId, row.enrollmentId]),
        ),
      ).size,
    ).toBe(1002);
    expect(
      contexts.every(
        (row) =>
          row.matchedRevisionTargetIds.join(',') === 'a,z' &&
          row.recipientUserId === null,
      ),
    ).toBe(true);
    expect(
      new Set(contexts.map((row) => row.guardianCanReceiveNotifications)),
    ).toEqual(new Set([false, null]));
    expect(
      f.reads.guardianLinksPage.mock.calls.map((args: unknown[]) => args[2]),
    ).toEqual([undefined, links[499].id]);
  });

  it('uses fixed page limits and primary-key cursors on the explicit transaction only', async () => {
    const enrollmentRead = jest
      .fn<Promise<[]>, [unknown]>()
      .mockResolvedValue([]);
    const guardianRead = jest
      .fn<Promise<[]>, [unknown]>()
      .mockResolvedValue([]);
    const tx = {
      enrollment: { findMany: enrollmentRead },
      studentGuardian: { findMany: guardianRead },
    } as unknown as Prisma.TransactionClient;
    const reads = new AcademicContentAudienceRepository({} as PrismaService);
    await reads.eligibleEnrollmentsPage(
      'school',
      'year',
      'term',
      'enrollment-cursor',
      tx,
    );
    await reads.guardianLinksPage('school', ['student'], 'guardian-cursor', tx);
    for (const read of [enrollmentRead, guardianRead]) {
      expect(read).toHaveBeenCalledWith(
        expect.objectContaining({
          take: ACADEMIC_CONTENT_PUBLICATION_AUDIENCE_PAGE_SIZE,
          orderBy: { id: 'asc' },
          skip: 1,
        }),
      );
    }
    expect(enrollmentRead).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: { id: 'enrollment-cursor' },
        where: {
          schoolId: 'school',
          academicYearId: 'year',
          termId: 'term',
          status: 'ACTIVE',
          deletedAt: null,
          student: { schoolId: 'school', status: 'ACTIVE', deletedAt: null },
          classroom: {
            schoolId: 'school',
            deletedAt: null,
            section: {
              schoolId: 'school',
              deletedAt: null,
              grade: {
                schoolId: 'school',
                deletedAt: null,
                stage: { schoolId: 'school', deletedAt: null },
              },
            },
          },
        },
      }),
    );
    expect(guardianRead).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: { id: 'guardian-cursor' },
        where: {
          schoolId: 'school',
          studentId: { in: ['student'] },
          student: { schoolId: 'school', status: 'ACTIVE', deletedAt: null },
          guardian: { schoolId: 'school', deletedAt: null },
        },
      }),
    );
    expect(guardianRead.mock.calls[0][0]).toMatchObject({
      select: { id: true },
    });
  });
});
