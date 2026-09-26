import { randomUUID } from 'node:crypto';
import {
  AcademicContentType,
  AcademicGuardianNotePriority,
  AcademicOnlineSessionPlatform,
  AcademicSubjectResourceCategory,
  GradeAssessmentType,
  GradeScopeType,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';

const databaseUrl = process.env.DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase('ACC-5A PostgreSQL type detail invariants', () => {
  jest.setTimeout(120_000);
  const prisma = new PrismaService({
    datasources: {
      db: {
        url: databaseUrl ?? 'postgresql://unused:unused@127.0.0.1:1/unused',
      },
    },
  });
  const suffix = randomUUID().slice(0, 8);
  const id: Record<string, string> = {};
  const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
  const instant = (value: string) => new Date(value);

  async function makeSchool(label: string) {
    const schoolId = (
      await prisma.school.create({
        data: {
          organizationId: id.organization,
          name: `${label} ${suffix}`,
          slug: `acc5a-${label}-${suffix}`,
        },
      })
    ).id;
    const yearId = (
      await prisma.academicYear.create({
        data: {
          schoolId,
          nameAr: `سنة ${label} ${suffix}`,
          nameEn: `Year ${label} ${suffix}`,
          startDate: day('2028-01-01'),
          endDate: day('2028-12-31'),
        },
      })
    ).id;
    const termId = (
      await prisma.term.create({
        data: {
          schoolId,
          academicYearId: yearId,
          nameAr: `فصل ${label} ${suffix}`,
          nameEn: `Term ${label} ${suffix}`,
          startDate: day('2028-01-01'),
          endDate: day('2028-12-31'),
        },
      })
    ).id;
    const stageId = (
      await prisma.stage.create({
        data: {
          schoolId,
          nameAr: `مرحلة ${label} ${suffix}`,
          nameEn: `Stage ${label} ${suffix}`,
        },
      })
    ).id;
    const gradeId = (
      await prisma.grade.create({
        data: {
          schoolId,
          stageId,
          nameAr: `صف ${label} ${suffix}`,
          nameEn: `Grade ${label} ${suffix}`,
        },
      })
    ).id;
    const sectionId = (
      await prisma.section.create({
        data: {
          schoolId,
          gradeId,
          nameAr: `شعبة ${label} ${suffix}`,
          nameEn: `Section ${label} ${suffix}`,
        },
      })
    ).id;
    const classroomId = (
      await prisma.classroom.create({
        data: {
          schoolId,
          sectionId,
          nameAr: `فصل ${label} ${suffix}`,
          nameEn: `Class ${label} ${suffix}`,
        },
      })
    ).id;
    const subjectId = (
      await prisma.subject.create({
        data: {
          schoolId,
          nameAr: `مادة ${label} ${suffix}`,
          nameEn: `Subject ${label} ${suffix}`,
        },
      })
    ).id;
    const allocationId = (
      await prisma.teacherSubjectAllocation.create({
        data: {
          schoolId,
          teacherUserId: id.user,
          subjectId,
          classroomId,
          termId,
        },
      })
    ).id;
    const curriculumId = (
      await prisma.curriculum.create({
        data: {
          schoolId,
          academicYearId: yearId,
          termId,
          gradeId,
          subjectId,
          title: `Curriculum ${label}`,
          createdByUserId: id.user,
        },
      })
    ).id;
    const homeworkId = (
      await prisma.homeworkAssignment.create({
        data: {
          schoolId,
          academicYearId: yearId,
          termId,
          classroomId,
          subjectId,
          teacherUserId: id.user,
          teacherSubjectAllocationId: allocationId,
          title: `Homework ${label}`,
          dueAt: instant('2028-09-10T12:00:00Z'),
          createdByUserId: id.user,
        },
      })
    ).id;
    const assessmentId = (
      await prisma.gradeAssessment.create({
        data: {
          schoolId,
          academicYearId: yearId,
          termId,
          subjectId,
          scopeType: GradeScopeType.SCHOOL,
          scopeKey: schoolId,
          type: GradeAssessmentType.QUIZ,
          date: day('2028-09-10'),
          weight: 1,
          maxScore: 10,
        },
      })
    ).id;
    return {
      schoolId,
      yearId,
      termId,
      stageId,
      gradeId,
      sectionId,
      classroomId,
      subjectId,
      allocationId,
      curriculumId,
      homeworkId,
      assessmentId,
    };
  }

  async function content(type: AcademicContentType, title: string) {
    const audience =
      type === AcademicContentType.TEACHER_PREPARATION
        ? 'INTERNAL_STAFF'
        : type === AcademicContentType.GUARDIAN_WEEKLY_NOTE
          ? 'GUARDIANS'
          : 'STUDENTS';
    return prisma.academicContent.create({
      data: {
        schoolId: id.school,
        academicYearId: id.year,
        termId: id.term,
        type,
        audience,
        title,
        createdByUserId: id.user,
      },
    });
  }

  const weeklyData = (academicContentId: string) => ({
    schoolId: id.school,
    academicContentId,
    weekStartDate: day('2028-09-03'),
    weekEndDate: day('2028-09-09'),
  });
  const sessionData = (academicContentId: string) => ({
    schoolId: id.school,
    academicContentId,
    platform: AcademicOnlineSessionPlatform.ZOOM,
    joinUrl: 'https://example.test/meeting',
    startAt: instant('2028-09-03T10:00:00Z'),
    endAt: instant('2028-09-03T11:00:00Z'),
    timezone: 'Africa/Cairo',
  });

  beforeAll(async () => {
    await prisma.$connect();
    id.organization = (
      await prisma.organization.create({
        data: { name: `ACC5A ${suffix}`, slug: `acc5a-${suffix}` },
      })
    ).id;
    id.user = (
      await prisma.user.create({
        data: {
          email: `acc5a-${suffix}@example.test`,
          firstName: 'ACC',
          lastName: 'Test',
          userType: UserType.SCHOOL_USER,
        },
      })
    ).id;
    const own = await makeSchool('own');
    const foreign = await makeSchool('foreign');
    Object.assign(id, {
      school: own.schoolId,
      year: own.yearId,
      term: own.termId,
      stage: own.stageId,
      grade: own.gradeId,
      section: own.sectionId,
      classroom: own.classroomId,
      subject: own.subjectId,
      allocation: own.allocationId,
      curriculum: own.curriculumId,
      homework: own.homeworkId,
      assessment: own.assessmentId,
      foreignSchool: foreign.schoolId,
      foreignYear: foreign.yearId,
      foreignTerm: foreign.termId,
      foreignStage: foreign.stageId,
      foreignGrade: foreign.gradeId,
      foreignSection: foreign.sectionId,
      foreignClassroom: foreign.classroomId,
      foreignSubject: foreign.subjectId,
      foreignAllocation: foreign.allocationId,
      foreignCurriculum: foreign.curriculumId,
      foreignHomework: foreign.homeworkId,
      foreignAssessment: foreign.assessmentId,
    });
  });

  afterAll(async () => {
    try {
      const schools = [id.school, id.foreignSchool].filter(Boolean);
      if (schools.length) {
        const where = { schoolId: { in: schools } };
        await prisma.academicContentRevision.deleteMany({ where });
        await prisma.academicContentWeeklyPlanHomeworkReference.deleteMany({
          where,
        });
        await prisma.academicContentWeeklyPlanAssessmentReference.deleteMany({
          where,
        });
        await prisma.academicContentPreparationDetail.deleteMany({ where });
        await prisma.academicContentWeeklyPlanDetail.deleteMany({ where });
        await prisma.academicContentGuardianNoteDetail.deleteMany({ where });
        await prisma.academicContentSubjectResourceDetail.deleteMany({ where });
        await prisma.academicContentOnlineSessionDetail.deleteMany({ where });
        await prisma.academicContent.deleteMany({ where });
        await prisma.homeworkAssignment.deleteMany({ where });
        await prisma.gradeAssessment.deleteMany({ where });
        await prisma.curriculum.deleteMany({ where });
        await prisma.teacherSubjectAllocation.deleteMany({ where });
        await prisma.subject.deleteMany({ where });
        await prisma.classroom.deleteMany({ where });
        await prisma.section.deleteMany({ where });
        await prisma.grade.deleteMany({ where });
        await prisma.stage.deleteMany({ where });
        await prisma.term.deleteMany({ where });
        await prisma.academicYear.deleteMany({ where });
        await prisma.school.deleteMany({ where: { id: { in: schools } } });
      }
      if (id.user) await prisma.user.delete({ where: { id: id.user } });
      if (id.organization)
        await prisma.organization.delete({ where: { id: id.organization } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('accepts each of the five details on its matching parent', async () => {
    const preparation = await content(
      AcademicContentType.TEACHER_PREPARATION,
      'Preparation',
    );
    const weekly = await content(AcademicContentType.WEEKLY_PLAN, 'Weekly');
    const note = await content(
      AcademicContentType.GUARDIAN_WEEKLY_NOTE,
      'Guardian',
    );
    const resource = await content(
      AcademicContentType.SUBJECT_RESOURCE,
      'Resource',
    );
    const session = await content(
      AcademicContentType.ONLINE_SESSION,
      'Session',
    );
    id.preparation = preparation.id;
    id.weekly = weekly.id;
    id.note = note.id;
    id.resource = resource.id;
    id.session = session.id;
    await expect(
      prisma.academicContentPreparationDetail.create({
        data: {
          schoolId: id.school,
          academicContentId: id.preparation,
          topic: 'Fractions',
          curriculumId: id.curriculum,
          objectives: ['one'],
        },
      }),
    ).resolves.toMatchObject({ contentType: 'TEACHER_PREPARATION' });
    id.weeklyDetail = (
      await prisma.academicContentWeeklyPlanDetail.create({
        data: weeklyData(id.weekly),
      })
    ).id;
    await expect(
      prisma.academicContentGuardianNoteDetail.create({
        data: {
          schoolId: id.school,
          academicContentId: id.note,
          body: 'Please review',
          priority: AcademicGuardianNotePriority.NORMAL,
          requiresAcknowledgement: false,
        },
      }),
    ).resolves.toMatchObject({ contentType: 'GUARDIAN_WEEKLY_NOTE' });
    await expect(
      prisma.academicContentSubjectResourceDetail.create({
        data: {
          schoolId: id.school,
          academicContentId: id.resource,
          resourceCategory: AcademicSubjectResourceCategory.WORKSHEET,
          curriculumId: id.curriculum,
        },
      }),
    ).resolves.toMatchObject({ contentType: 'SUBJECT_RESOURCE' });
    await expect(
      prisma.academicContentOnlineSessionDetail.create({
        data: sessionData(id.session),
      }),
    ).resolves.toMatchObject({ contentType: 'ONLINE_SESSION' });
    expect(
      await prisma.academicContentRevision.count({
        where: { schoolId: id.school },
      }),
    ).toBe(0);
  });

  it('rejects all detail types for GENERAL_RESOURCE at the database boundary', async () => {
    const general = await content(
      AcademicContentType.GENERAL_RESOURCE,
      'General',
    );
    await expect(
      prisma.academicContentPreparationDetail.create({
        data: { schoolId: id.school, academicContentId: general.id },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.academicContentWeeklyPlanDetail.create({
        data: weeklyData(general.id),
      }),
    ).rejects.toThrow();
    await expect(
      prisma.academicContentGuardianNoteDetail.create({
        data: {
          schoolId: id.school,
          academicContentId: general.id,
          body: 'Note',
          priority: AcademicGuardianNotePriority.NORMAL,
          requiresAcknowledgement: false,
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.academicContentSubjectResourceDetail.create({
        data: {
          schoolId: id.school,
          academicContentId: general.id,
          resourceCategory: AcademicSubjectResourceCategory.OTHER,
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.academicContentOnlineSessionDetail.create({
        data: sessionData(general.id),
      }),
    ).rejects.toThrow();
  });

  it('rejects wrong parent types, discriminator spoofing, and a second detail row', async () => {
    await expect(
      prisma.academicContentPreparationDetail.create({
        data: { schoolId: id.school, academicContentId: id.weekly },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.academicContentWeeklyPlanDetail.create({
        data: weeklyData(id.preparation),
      }),
    ).rejects.toThrow();
    await expect(
      prisma.academicContentPreparationDetail.create({
        data: {
          schoolId: id.school,
          academicContentId: id.weekly,
          contentType: AcademicContentType.WEEKLY_PLAN,
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.academicContentPreparationDetail.create({
        data: { schoolId: id.school, academicContentId: id.preparation },
      }),
    ).rejects.toThrow();
  });

  it('enforces same-school Curriculum references and hierarchy shape', async () => {
    const own = await content(
      AcademicContentType.TEACHER_PREPARATION,
      'Curriculum own',
    );
    await expect(
      prisma.academicContentPreparationDetail.create({
        data: {
          schoolId: id.school,
          academicContentId: own.id,
          curriculumId: id.curriculum,
        },
      }),
    ).resolves.toBeDefined();
    const foreign = await content(
      AcademicContentType.TEACHER_PREPARATION,
      'Curriculum foreign',
    );
    await expect(
      prisma.academicContentPreparationDetail.create({
        data: {
          schoolId: id.school,
          academicContentId: foreign.id,
          curriculumId: id.foreignCurriculum,
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.academicContentPreparationDetail.create({
        data: {
          schoolId: id.school,
          academicContentId: foreign.id,
          curriculumUnitId: randomUUID(),
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.academicContentPreparationDetail.create({
        data: {
          schoolId: id.school,
          academicContentId: foreign.id,
          curriculumLessonId: randomUUID(),
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.academicContentPreparationDetail.create({
        data: {
          schoolId: id.school,
          academicContentId: foreign.id,
          lessonPlanItemId: randomUUID(),
        },
      }),
    ).rejects.toThrow();
    const subject = await content(
      AcademicContentType.SUBJECT_RESOURCE,
      'Resource foreign',
    );
    await expect(
      prisma.academicContentSubjectResourceDetail.create({
        data: {
          schoolId: id.school,
          academicContentId: subject.id,
          resourceCategory: AcademicSubjectResourceCategory.OTHER,
          curriculumId: id.foreignCurriculum,
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.academicContentSubjectResourceDetail.create({
        data: {
          schoolId: id.school,
          academicContentId: subject.id,
          resourceCategory: AcademicSubjectResourceCategory.OTHER,
          curriculumUnitId: randomUUID(),
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.academicContentSubjectResourceDetail.create({
        data: {
          schoolId: id.school,
          academicContentId: subject.id,
          resourceCategory: AcademicSubjectResourceCategory.OTHER,
          curriculumLessonId: randomUUID(),
        },
      }),
    ).rejects.toThrow();
  });

  it('enforces same-school and uniqueness for weekly Homework and Assessment references', async () => {
    await expect(
      prisma.academicContentWeeklyPlanHomeworkReference.create({
        data: {
          schoolId: id.school,
          weeklyPlanDetailId: id.weeklyDetail,
          homeworkAssignmentId: id.homework,
        },
      }),
    ).resolves.toBeDefined();
    await expect(
      prisma.academicContentWeeklyPlanHomeworkReference.create({
        data: {
          schoolId: id.school,
          weeklyPlanDetailId: id.weeklyDetail,
          homeworkAssignmentId: id.foreignHomework,
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.academicContentWeeklyPlanHomeworkReference.create({
        data: {
          schoolId: id.school,
          weeklyPlanDetailId: id.weeklyDetail,
          homeworkAssignmentId: id.homework,
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.academicContentWeeklyPlanAssessmentReference.create({
        data: {
          schoolId: id.school,
          weeklyPlanDetailId: id.weeklyDetail,
          gradeAssessmentId: id.assessment,
        },
      }),
    ).resolves.toBeDefined();
    await expect(
      prisma.academicContentWeeklyPlanAssessmentReference.create({
        data: {
          schoolId: id.school,
          weeklyPlanDetailId: id.weeklyDetail,
          gradeAssessmentId: id.foreignAssessment,
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.academicContentWeeklyPlanAssessmentReference.create({
        data: {
          schoolId: id.school,
          weeklyPlanDetailId: id.weeklyDetail,
          gradeAssessmentId: id.assessment,
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects inverted dates, missing OTHER provider, and JSON objects', async () => {
    const weekly = await content(
      AcademicContentType.WEEKLY_PLAN,
      'Invalid week',
    );
    await expect(
      prisma.academicContentWeeklyPlanDetail.create({
        data: {
          ...weeklyData(weekly.id),
          weekStartDate: day('2028-09-10'),
          weekEndDate: day('2028-09-09'),
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.academicContentWeeklyPlanDetail.create({
        data: { ...weeklyData(weekly.id), objectives: { invalid: true } },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.academicContentWeeklyPlanDetail.create({
        data: { ...weeklyData(weekly.id), topics: { invalid: true } },
      }),
    ).rejects.toThrow();
    const preparation = await content(
      AcademicContentType.TEACHER_PREPARATION,
      'Invalid list',
    );
    await expect(
      prisma.academicContentPreparationDetail.create({
        data: {
          schoolId: id.school,
          academicContentId: preparation.id,
          activities: { invalid: true },
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.academicContentPreparationDetail.create({
        data: {
          schoolId: id.school,
          academicContentId: preparation.id,
          objectives: { invalid: true },
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.academicContentPreparationDetail.create({
        data: {
          schoolId: id.school,
          academicContentId: preparation.id,
          learningOutcomes: { invalid: true },
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.academicContentPreparationDetail.create({
        data: {
          schoolId: id.school,
          academicContentId: preparation.id,
          teachingStrategies: { invalid: true },
        },
      }),
    ).rejects.toThrow();
    const session = await content(
      AcademicContentType.ONLINE_SESSION,
      'Invalid session',
    );
    await expect(
      prisma.academicContentOnlineSessionDetail.create({
        data: {
          ...sessionData(session.id),
          endAt: instant('2028-09-03T10:00:00Z'),
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.academicContentOnlineSessionDetail.create({
        data: {
          ...sessionData(session.id),
          platform: AcademicOnlineSessionPlatform.OTHER,
          providerName: '  ',
        },
      }),
    ).rejects.toThrow();
  });

  it('keeps V1 revisions valid with a nullable, untouched type snapshot', async () => {
    const revision = await prisma.academicContentRevision.create({
      data: {
        schoolId: id.school,
        academicContentId: id.preparation,
        revisionNumber: 1,
        snapshotContractVersion: 1,
        academicYearId: id.year,
        termId: id.term,
        type: AcademicContentType.TEACHER_PREPARATION,
        audience: 'INTERNAL_STAFF',
        title: 'Preparation',
        sourceStatus: 'DRAFT',
        capturedByUserId: id.user,
      },
    });
    expect(revision.typeSpecificSnapshot).toBeNull();
    expect(revision.snapshotContractVersion).toBe(1);
    expect(
      await prisma.academicContentRevision.count({
        where: { schoolId: id.school, academicContentId: id.preparation },
      }),
    ).toBe(1);
  });
});
