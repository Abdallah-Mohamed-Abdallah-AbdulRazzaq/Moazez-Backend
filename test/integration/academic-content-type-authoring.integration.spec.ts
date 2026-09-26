import { randomUUID } from 'node:crypto';
import {
  AcademicContentType,
  AcademicContentTargetScopeType as Scope,
  AcademicGuardianNotePriority,
  AcademicOnlineSessionPlatform,
  AcademicSubjectResourceCategory,
  GradeAssessmentType,
  GradeScopeType,
  Prisma,
  TimetableScopeType,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../src/common/context/request-context';
import { AcademicContentRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content.repository';
import { AcademicContentValidationRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-validation.repository';
import { GetAcademicContentForManagementUseCase } from '../../src/modules/academics/academic-content/application/academic-content-management-read.use-cases';
import { GetAcademicContentReadinessUseCase } from '../../src/modules/academics/academic-content/application/academic-content-readiness.use-case';
import { presentAcademicContentDetail } from '../../src/modules/academics/academic-content/presenters/academic-content.presenter';
import { AcademicContentTypeDetailRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-type-detail.repository';
import { AcademicContentTargetRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-target.repository';
import {
  normalizeGuardianNote,
  normalizeOnlineSession,
  normalizePreparation,
  normalizeSubjectResource,
  normalizeWeeklyPlan,
  NormalizedDetail,
} from '../../src/modules/academics/academic-content/domain/academic-content-type-detail.policy';

const databaseUrl = process.env.DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase('ACC-5B PostgreSQL type authoring', () => {
  jest.setTimeout(120_000);
  const prisma = new PrismaService({
    datasources: {
      db: {
        url: databaseUrl ?? 'postgresql://unused:unused@127.0.0.1:1/unused',
      },
    },
  });
  const writer = new AcademicContentTypeDetailRepository(prisma);
  const contentReader = new AcademicContentRepository(prisma);
  const managementDetail = new GetAcademicContentForManagementUseCase(
    contentReader,
  );
  const readiness = new GetAcademicContentReadinessUseCase(
    contentReader,
    new AcademicContentValidationRepository(prisma),
  );
  const targets = new AcademicContentTargetRepository(prisma);
  const suffix = randomUUID().slice(0, 8);
  const ids: Record<string, string> = {};
  const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
  const preparation = () =>
    normalizePreparation({
      objectives: [],
      learningOutcomes: [],
      teachingStrategies: [],
      activities: [],
    });
  const weekly = () =>
    normalizeWeeklyPlan({
      weekStartDate: '2028-09-10',
      weekEndDate: '2028-09-16',
      objectives: [],
      topics: [],
      homeworkAssignmentIds: [],
      gradeAssessmentIds: [],
    });
  const note = () =>
    normalizeGuardianNote({
      body: 'A weekly note',
      priority: AcademicGuardianNotePriority.NORMAL,
      requiresAcknowledgement: false,
    });
  const resource = () =>
    normalizeSubjectResource({
      resourceCategory: AcademicSubjectResourceCategory.WORKSHEET,
    });
  const session = () =>
    normalizeOnlineSession({
      platform: AcademicOnlineSessionPlatform.ZOOM,
      joinUrl: 'https://example.test/meeting',
      startAt: '2028-09-10T10:00:00Z',
      endAt: '2028-09-10T11:00:00Z',
      timezone: 'Africa/Cairo',
    });
  const details = [preparation, weekly, note, resource, session] as const;
  const scope = (contentId: string, detail: NormalizedDetail) => ({
    contentId,
    detail,
    schoolId: ids.school,
    organizationId: ids.organization,
    actorId: ids.user,
    now: new Date('2026-09-26T10:00:00Z'),
  });
  function asViewer<T>(action: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), () => {
      setActor({ id: ids.user, userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: randomUUID(),
        schoolId: ids.school,
        organizationId: ids.organization,
        roleId: randomUUID(),
        permissions: ['academics.academic_content.view'],
      });
      return Promise.resolve().then(action);
    });
  }

  async function content(type: AcademicContentType) {
    const row = await prisma.academicContent.create({
      data: {
        schoolId: ids.school,
        academicYearId: ids.year,
        termId: ids.term,
        type,
        audience:
          type === AcademicContentType.TEACHER_PREPARATION
            ? 'INTERNAL_STAFF'
            : type === AcademicContentType.GUARDIAN_WEEKLY_NOTE
              ? 'GUARDIANS'
              : 'STUDENTS',
        title: `${type} ${randomUUID().slice(0, 8)}`,
        createdByUserId: ids.user,
      },
    });
    return row;
  }
  async function target(
    contentId: string,
    subjectId = ids.subject,
    scopeType = Scope.SCHOOL,
    gradeId?: string,
  ) {
    return prisma.academicContentTarget.create({
      data: {
        schoolId: ids.school,
        academicContentId: contentId,
        scopeType,
        subjectId,
        gradeId: gradeId ?? null,
        identityFingerprint: randomUUID().replace(/-/g, ''),
        createdByUserId: ids.user,
      },
    });
  }

  beforeAll(async () => {
    await prisma.$connect();
    ids.organization = (
      await prisma.organization.create({
        data: { name: `ACC5B ${suffix}`, slug: `acc5b-${suffix}` },
      })
    ).id;
    ids.user = (
      await prisma.user.create({
        data: {
          email: `acc5b-${suffix}@example.test`,
          firstName: 'ACC',
          lastName: 'Test',
          userType: UserType.SCHOOL_USER,
        },
      })
    ).id;
    ids.school = (
      await prisma.school.create({
        data: {
          organizationId: ids.organization,
          name: `ACC5B ${suffix}`,
          slug: `acc5b-${suffix}`,
        },
      })
    ).id;
    ids.year = (
      await prisma.academicYear.create({
        data: {
          schoolId: ids.school,
          nameAr: `سنة ${suffix}`,
          nameEn: `Year ${suffix}`,
          startDate: day('2028-01-01'),
          endDate: day('2028-12-31'),
        },
      })
    ).id;
    ids.term = (
      await prisma.term.create({
        data: {
          schoolId: ids.school,
          academicYearId: ids.year,
          nameAr: `فصل ${suffix}`,
          nameEn: `Term ${suffix}`,
          startDate: day('2028-09-01'),
          endDate: day('2028-12-31'),
        },
      })
    ).id;
    ids.otherYear = (
      await prisma.academicYear.create({
        data: {
          schoolId: ids.school,
          nameAr: `سنة أخرى ${suffix}`,
          nameEn: `Other Year ${suffix}`,
          startDate: day('2029-01-01'),
          endDate: day('2029-12-31'),
        },
      })
    ).id;
    ids.otherTerm = (
      await prisma.term.create({
        data: {
          schoolId: ids.school,
          academicYearId: ids.year,
          nameAr: `فصل آخر ${suffix}`,
          nameEn: `Other Term ${suffix}`,
          startDate: day('2028-01-01'),
          endDate: day('2028-08-31'),
        },
      })
    ).id;
    ids.stage = (
      await prisma.stage.create({
        data: {
          schoolId: ids.school,
          nameAr: `مرحلة ${suffix}`,
          nameEn: `Stage ${suffix}`,
        },
      })
    ).id;
    ids.grade = (
      await prisma.grade.create({
        data: {
          schoolId: ids.school,
          stageId: ids.stage,
          nameAr: `صف ${suffix}`,
          nameEn: `Grade ${suffix}`,
        },
      })
    ).id;
    ids.otherGrade = (
      await prisma.grade.create({
        data: {
          schoolId: ids.school,
          stageId: ids.stage,
          nameAr: `صف آخر ${suffix}`,
          nameEn: `Other Grade ${suffix}`,
        },
      })
    ).id;
    ids.section = (
      await prisma.section.create({
        data: {
          schoolId: ids.school,
          gradeId: ids.grade,
          nameAr: `شعبة ${suffix}`,
          nameEn: `Section ${suffix}`,
        },
      })
    ).id;
    ids.otherSection = (
      await prisma.section.create({
        data: {
          schoolId: ids.school,
          gradeId: ids.otherGrade,
          nameAr: `شعبة أخرى ${suffix}`,
          nameEn: `Other Section ${suffix}`,
        },
      })
    ).id;
    ids.classroom = (
      await prisma.classroom.create({
        data: {
          schoolId: ids.school,
          sectionId: ids.section,
          nameAr: `فصل ${suffix}`,
          nameEn: `Class ${suffix}`,
        },
      })
    ).id;
    ids.otherClassroom = (
      await prisma.classroom.create({
        data: {
          schoolId: ids.school,
          sectionId: ids.otherSection,
          nameAr: `فصل آخر ${suffix}`,
          nameEn: `Other Class ${suffix}`,
        },
      })
    ).id;
    ids.subject = (
      await prisma.subject.create({
        data: {
          schoolId: ids.school,
          nameAr: `مادة ${suffix}`,
          nameEn: `Subject ${suffix}`,
        },
      })
    ).id;
    ids.otherSubject = (
      await prisma.subject.create({
        data: {
          schoolId: ids.school,
          nameAr: `مادة أخرى ${suffix}`,
          nameEn: `Other ${suffix}`,
        },
      })
    ).id;
    ids.allocation = (
      await prisma.teacherSubjectAllocation.create({
        data: {
          schoolId: ids.school,
          teacherUserId: ids.user,
          subjectId: ids.subject,
          classroomId: ids.classroom,
          termId: ids.term,
        },
      })
    ).id;
    ids.otherAllocation = (
      await prisma.teacherSubjectAllocation.create({
        data: {
          schoolId: ids.school,
          teacherUserId: ids.user,
          subjectId: ids.subject,
          classroomId: ids.otherClassroom,
          termId: ids.term,
        },
      })
    ).id;
    ids.otherSubjectAllocation = (
      await prisma.teacherSubjectAllocation.create({
        data: {
          schoolId: ids.school,
          teacherUserId: ids.user,
          subjectId: ids.otherSubject,
          classroomId: ids.classroom,
          termId: ids.term,
        },
      })
    ).id;
    ids.curriculum = (
      await prisma.curriculum.create({
        data: {
          schoolId: ids.school,
          academicYearId: ids.year,
          termId: ids.term,
          gradeId: ids.grade,
          subjectId: ids.subject,
          title: 'ACC5B curriculum',
          createdByUserId: ids.user,
        },
      })
    ).id;
    ids.otherYearCurriculum = (
      await prisma.curriculum.create({
        data: {
          schoolId: ids.school,
          academicYearId: ids.otherYear,
          termId: ids.term,
          gradeId: ids.grade,
          subjectId: ids.subject,
          title: 'Wrong year',
          createdByUserId: ids.user,
        },
      })
    ).id;
    ids.otherTermCurriculum = (
      await prisma.curriculum.create({
        data: {
          schoolId: ids.school,
          academicYearId: ids.year,
          termId: ids.otherTerm,
          gradeId: ids.grade,
          subjectId: ids.subject,
          title: 'Wrong term',
          createdByUserId: ids.user,
        },
      })
    ).id;
    ids.otherGradeCurriculum = (
      await prisma.curriculum.create({
        data: {
          schoolId: ids.school,
          academicYearId: ids.year,
          termId: ids.term,
          gradeId: ids.otherGrade,
          subjectId: ids.subject,
          title: 'ACC5B other grade curriculum',
          createdByUserId: ids.user,
        },
      })
    ).id;
    ids.otherSubjectCurriculum = (
      await prisma.curriculum.create({
        data: {
          schoolId: ids.school,
          academicYearId: ids.year,
          termId: ids.term,
          gradeId: ids.grade,
          subjectId: ids.otherSubject,
          title: 'ACC5B other subject curriculum',
          createdByUserId: ids.user,
        },
      })
    ).id;
    ids.unit = (
      await prisma.curriculumUnit.create({
        data: {
          schoolId: ids.school,
          curriculumId: ids.curriculum,
          title: 'Unit',
        },
      })
    ).id;
    ids.otherUnit = (
      await prisma.curriculumUnit.create({
        data: {
          schoolId: ids.school,
          curriculumId: ids.otherGradeCurriculum,
          title: 'Other Unit',
        },
      })
    ).id;
    ids.lesson = (
      await prisma.curriculumLesson.create({
        data: {
          schoolId: ids.school,
          curriculumId: ids.curriculum,
          unitId: ids.unit,
          title: 'Lesson',
        },
      })
    ).id;
    ids.lessonPlan = (
      await prisma.lessonPlan.create({
        data: {
          schoolId: ids.school,
          academicYearId: ids.year,
          termId: ids.term,
          teacherSubjectAllocationId: ids.allocation,
          teacherUserId: ids.user,
          classroomId: ids.classroom,
          subjectId: ids.subject,
          curriculumId: ids.curriculum,
          title: 'Plan',
          weekStartDate: day('2028-09-10'),
          weekEndDate: day('2028-09-16'),
          createdByUserId: ids.user,
        },
      })
    ).id;
    ids.secondLessonPlan = (
      await prisma.lessonPlan.create({
        data: {
          schoolId: ids.school,
          academicYearId: ids.year,
          termId: ids.term,
          teacherSubjectAllocationId: ids.allocation,
          teacherUserId: ids.user,
          classroomId: ids.classroom,
          subjectId: ids.subject,
          curriculumId: ids.curriculum,
          title: 'Second Plan',
          weekStartDate: day('2028-09-17'),
          weekEndDate: day('2028-09-23'),
          createdByUserId: ids.user,
        },
      })
    ).id;
    ids.wrongSubjectLessonPlan = (
      await prisma.lessonPlan.create({
        data: {
          schoolId: ids.school,
          academicYearId: ids.year,
          termId: ids.term,
          teacherSubjectAllocationId: ids.otherSubjectAllocation,
          teacherUserId: ids.user,
          classroomId: ids.classroom,
          subjectId: ids.otherSubject,
          curriculumId: ids.otherSubjectCurriculum,
          title: 'Wrong Subject Plan',
          weekStartDate: day('2028-09-10'),
          weekEndDate: day('2028-09-16'),
          createdByUserId: ids.user,
        },
      })
    ).id;
    ids.lessonPlanItem = (
      await prisma.lessonPlanItem.create({
        data: {
          schoolId: ids.school,
          lessonPlanId: ids.lessonPlan,
          curriculumId: ids.curriculum,
          unitId: ids.unit,
          lessonId: ids.lesson,
          title: 'Item',
          createdByUserId: ids.user,
        },
      })
    ).id;
    ids.homework = (
      await prisma.homeworkAssignment.create({
        data: {
          schoolId: ids.school,
          academicYearId: ids.year,
          termId: ids.term,
          classroomId: ids.classroom,
          subjectId: ids.subject,
          teacherUserId: ids.user,
          teacherSubjectAllocationId: ids.allocation,
          title: 'ACC5B homework',
          dueAt: new Date('2028-09-20T12:00:00Z'),
          createdByUserId: ids.user,
        },
      })
    ).id;
    ids.otherClassHomework = (
      await prisma.homeworkAssignment.create({
        data: {
          schoolId: ids.school,
          academicYearId: ids.year,
          termId: ids.term,
          classroomId: ids.otherClassroom,
          subjectId: ids.subject,
          teacherUserId: ids.user,
          teacherSubjectAllocationId: ids.otherAllocation,
          title: 'Other class homework',
          dueAt: new Date('2028-09-20T12:00:00Z'),
          createdByUserId: ids.user,
        },
      })
    ).id;
    ids.otherSubjectHomework = (
      await prisma.homeworkAssignment.create({
        data: {
          schoolId: ids.school,
          academicYearId: ids.year,
          termId: ids.term,
          classroomId: ids.classroom,
          subjectId: ids.otherSubject,
          teacherUserId: ids.user,
          teacherSubjectAllocationId: ids.otherSubjectAllocation,
          title: 'Other subject homework',
          dueAt: new Date('2028-09-20T12:00:00Z'),
          createdByUserId: ids.user,
        },
      })
    ).id;
    ids.otherYearHomework = (
      await prisma.homeworkAssignment.create({
        data: {
          schoolId: ids.school,
          academicYearId: ids.otherYear,
          termId: ids.term,
          classroomId: ids.classroom,
          subjectId: ids.subject,
          teacherUserId: ids.user,
          teacherSubjectAllocationId: ids.allocation,
          title: 'Other year homework',
          dueAt: new Date('2028-09-20T12:00:00Z'),
          createdByUserId: ids.user,
        },
      })
    ).id;
    ids.otherTermHomework = (
      await prisma.homeworkAssignment.create({
        data: {
          schoolId: ids.school,
          academicYearId: ids.year,
          termId: ids.otherTerm,
          classroomId: ids.classroom,
          subjectId: ids.subject,
          teacherUserId: ids.user,
          teacherSubjectAllocationId: ids.allocation,
          title: 'Other term homework',
          dueAt: new Date('2028-07-20T12:00:00Z'),
          createdByUserId: ids.user,
        },
      })
    ).id;
    ids.assessment = (
      await prisma.gradeAssessment.create({
        data: {
          schoolId: ids.school,
          academicYearId: ids.year,
          termId: ids.term,
          subjectId: ids.subject,
          scopeType: GradeScopeType.GRADE,
          scopeKey: ids.grade,
          gradeId: ids.grade,
          type: GradeAssessmentType.QUIZ,
          date: day('2028-09-20'),
          weight: 1,
          maxScore: 10,
        },
      })
    ).id;
    ids.otherGradeAssessment = (
      await prisma.gradeAssessment.create({
        data: {
          schoolId: ids.school,
          academicYearId: ids.year,
          termId: ids.term,
          subjectId: ids.subject,
          scopeType: GradeScopeType.GRADE,
          scopeKey: ids.otherGrade,
          gradeId: ids.otherGrade,
          type: GradeAssessmentType.QUIZ,
          date: day('2028-09-20'),
          weight: 1,
          maxScore: 10,
        },
      })
    ).id;
    ids.otherSubjectAssessment = (
      await prisma.gradeAssessment.create({
        data: {
          schoolId: ids.school,
          academicYearId: ids.year,
          termId: ids.term,
          subjectId: ids.otherSubject,
          scopeType: GradeScopeType.GRADE,
          scopeKey: ids.grade,
          gradeId: ids.grade,
          type: GradeAssessmentType.QUIZ,
          date: day('2028-09-20'),
          weight: 1,
          maxScore: 10,
        },
      })
    ).id;
    ids.otherYearAssessment = (
      await prisma.gradeAssessment.create({
        data: {
          schoolId: ids.school,
          academicYearId: ids.otherYear,
          termId: ids.term,
          subjectId: ids.subject,
          scopeType: GradeScopeType.GRADE,
          scopeKey: ids.grade,
          gradeId: ids.grade,
          type: GradeAssessmentType.QUIZ,
          date: day('2028-09-20'),
          weight: 1,
          maxScore: 10,
        },
      })
    ).id;
    ids.otherTermAssessment = (
      await prisma.gradeAssessment.create({
        data: {
          schoolId: ids.school,
          academicYearId: ids.year,
          termId: ids.otherTerm,
          subjectId: ids.subject,
          scopeType: GradeScopeType.GRADE,
          scopeKey: ids.grade,
          gradeId: ids.grade,
          type: GradeAssessmentType.QUIZ,
          date: day('2028-07-20'),
          weight: 1,
          maxScore: 10,
        },
      })
    ).id;
    ids.timetableConfig = (
      await prisma.timetableConfig.create({
        data: {
          schoolId: ids.school,
          academicYearId: ids.year,
          termId: ids.term,
          name: 'ACC5B timetable',
          scopeType: TimetableScopeType.TERM,
          scopeKey: ids.term,
        },
      })
    ).id;
    ids.period = (
      await prisma.timetablePeriod.create({
        data: {
          schoolId: ids.school,
          timetableConfigId: ids.timetableConfig,
          periodIndex: 1,
          label: 'First',
          startTime: '10:00',
          endTime: '11:00',
        },
      })
    ).id;
    ids.timetableEntry = (
      await prisma.timetableEntry.create({
        data: {
          schoolId: ids.school,
          academicYearId: ids.year,
          termId: ids.term,
          timetableConfigId: ids.timetableConfig,
          periodId: ids.period,
          dayOfWeek: 1,
          gradeId: ids.grade,
          sectionId: ids.section,
          classroomId: ids.classroom,
          subjectId: ids.subject,
          teacherUserId: ids.user,
          teacherSubjectAllocationId: ids.allocation,
        },
      })
    ).id;
    ids.otherClassTimetableEntry = (
      await prisma.timetableEntry.create({
        data: {
          schoolId: ids.school,
          academicYearId: ids.year,
          termId: ids.term,
          timetableConfigId: ids.timetableConfig,
          periodId: ids.period,
          dayOfWeek: 1,
          gradeId: ids.otherGrade,
          sectionId: ids.otherSection,
          classroomId: ids.otherClassroom,
          subjectId: ids.subject,
          teacherUserId: ids.user,
          teacherSubjectAllocationId: ids.otherAllocation,
        },
      })
    ).id;
    ids.otherSubjectTimetableEntry = (
      await prisma.timetableEntry.create({
        data: {
          schoolId: ids.school,
          academicYearId: ids.year,
          termId: ids.term,
          timetableConfigId: ids.timetableConfig,
          periodId: ids.period,
          dayOfWeek: 2,
          gradeId: ids.grade,
          sectionId: ids.section,
          classroomId: ids.classroom,
          subjectId: ids.otherSubject,
          teacherUserId: ids.user,
          teacherSubjectAllocationId: ids.otherSubjectAllocation,
        },
      })
    ).id;
    ids.otherYearTimetableEntry = (
      await prisma.timetableEntry.create({
        data: {
          schoolId: ids.school,
          academicYearId: ids.otherYear,
          termId: ids.term,
          timetableConfigId: ids.timetableConfig,
          periodId: ids.period,
          dayOfWeek: 3,
          gradeId: ids.grade,
          sectionId: ids.section,
          classroomId: ids.classroom,
          subjectId: ids.subject,
          teacherUserId: ids.user,
          teacherSubjectAllocationId: ids.allocation,
        },
      })
    ).id;
    ids.otherTermTimetableEntry = (
      await prisma.timetableEntry.create({
        data: {
          schoolId: ids.school,
          academicYearId: ids.year,
          termId: ids.otherTerm,
          timetableConfigId: ids.timetableConfig,
          periodId: ids.period,
          dayOfWeek: 4,
          gradeId: ids.grade,
          sectionId: ids.section,
          classroomId: ids.classroom,
          subjectId: ids.subject,
          teacherUserId: ids.user,
          teacherSubjectAllocationId: ids.allocation,
        },
      })
    ).id;
    ids.foreignSchool = (
      await prisma.school.create({
        data: {
          organizationId: ids.organization,
          name: `Foreign ${suffix}`,
          slug: `acc5b-foreign-${suffix}`,
        },
      })
    ).id;
    ids.foreignYear = (
      await prisma.academicYear.create({
        data: {
          schoolId: ids.foreignSchool,
          nameAr: `سنة أجنبية ${suffix}`,
          nameEn: `Foreign Year ${suffix}`,
          startDate: day('2028-01-01'),
          endDate: day('2028-12-31'),
        },
      })
    ).id;
    ids.foreignTerm = (
      await prisma.term.create({
        data: {
          schoolId: ids.foreignSchool,
          academicYearId: ids.foreignYear,
          nameAr: `فصل أجنبي ${suffix}`,
          nameEn: `Foreign Term ${suffix}`,
          startDate: day('2028-09-01'),
          endDate: day('2028-12-31'),
        },
      })
    ).id;
    ids.foreignStage = (
      await prisma.stage.create({
        data: {
          schoolId: ids.foreignSchool,
          nameAr: `مرحلة أجنبية ${suffix}`,
          nameEn: `Foreign Stage ${suffix}`,
        },
      })
    ).id;
    ids.foreignGrade = (
      await prisma.grade.create({
        data: {
          schoolId: ids.foreignSchool,
          stageId: ids.foreignStage,
          nameAr: `صف أجنبي ${suffix}`,
          nameEn: `Foreign Grade ${suffix}`,
        },
      })
    ).id;
    ids.foreignSection = (
      await prisma.section.create({
        data: {
          schoolId: ids.foreignSchool,
          gradeId: ids.foreignGrade,
          nameAr: `شعبة أجنبية ${suffix}`,
          nameEn: `Foreign Section ${suffix}`,
        },
      })
    ).id;
    ids.foreignClassroom = (
      await prisma.classroom.create({
        data: {
          schoolId: ids.foreignSchool,
          sectionId: ids.foreignSection,
          nameAr: `فصل أجنبي ${suffix}`,
          nameEn: `Foreign Class ${suffix}`,
        },
      })
    ).id;
    ids.foreignSubject = (
      await prisma.subject.create({
        data: {
          schoolId: ids.foreignSchool,
          nameAr: `مادة أجنبية ${suffix}`,
          nameEn: `Foreign Subject ${suffix}`,
        },
      })
    ).id;
    ids.foreignAllocation = (
      await prisma.teacherSubjectAllocation.create({
        data: {
          schoolId: ids.foreignSchool,
          teacherUserId: ids.user,
          subjectId: ids.foreignSubject,
          classroomId: ids.foreignClassroom,
          termId: ids.foreignTerm,
        },
      })
    ).id;
    ids.foreignCurriculum = (
      await prisma.curriculum.create({
        data: {
          schoolId: ids.foreignSchool,
          academicYearId: ids.foreignYear,
          termId: ids.foreignTerm,
          gradeId: ids.foreignGrade,
          subjectId: ids.foreignSubject,
          title: 'Private foreign curriculum',
          createdByUserId: ids.user,
        },
      })
    ).id;
    ids.foreignHomework = (
      await prisma.homeworkAssignment.create({
        data: {
          schoolId: ids.foreignSchool,
          academicYearId: ids.foreignYear,
          termId: ids.foreignTerm,
          classroomId: ids.foreignClassroom,
          subjectId: ids.foreignSubject,
          teacherUserId: ids.user,
          teacherSubjectAllocationId: ids.foreignAllocation,
          title: 'Private foreign homework',
          dueAt: new Date('2028-09-20T12:00:00Z'),
          createdByUserId: ids.user,
        },
      })
    ).id;
    ids.foreignAssessment = (
      await prisma.gradeAssessment.create({
        data: {
          schoolId: ids.foreignSchool,
          academicYearId: ids.foreignYear,
          termId: ids.foreignTerm,
          subjectId: ids.foreignSubject,
          scopeType: GradeScopeType.GRADE,
          scopeKey: ids.foreignGrade,
          gradeId: ids.foreignGrade,
          type: GradeAssessmentType.QUIZ,
          date: day('2028-09-20'),
          weight: 1,
          maxScore: 10,
        },
      })
    ).id;
    ids.foreignTimetableConfig = (
      await prisma.timetableConfig.create({
        data: {
          schoolId: ids.foreignSchool,
          academicYearId: ids.foreignYear,
          termId: ids.foreignTerm,
          name: 'Foreign timetable',
          scopeType: TimetableScopeType.TERM,
          scopeKey: ids.foreignTerm,
        },
      })
    ).id;
    ids.foreignPeriod = (
      await prisma.timetablePeriod.create({
        data: {
          schoolId: ids.foreignSchool,
          timetableConfigId: ids.foreignTimetableConfig,
          periodIndex: 1,
          label: 'First',
          startTime: '10:00',
          endTime: '11:00',
        },
      })
    ).id;
    ids.foreignTimetableEntry = (
      await prisma.timetableEntry.create({
        data: {
          schoolId: ids.foreignSchool,
          academicYearId: ids.foreignYear,
          termId: ids.foreignTerm,
          timetableConfigId: ids.foreignTimetableConfig,
          periodId: ids.foreignPeriod,
          dayOfWeek: 1,
          gradeId: ids.foreignGrade,
          sectionId: ids.foreignSection,
          classroomId: ids.foreignClassroom,
          subjectId: ids.foreignSubject,
          teacherUserId: ids.user,
          teacherSubjectAllocationId: ids.foreignAllocation,
        },
      })
    ).id;
  });

  afterAll(async () => {
    try {
      if (!ids.school) return;
      const schools = [ids.school, ids.foreignSchool].filter(Boolean);
      const where = { schoolId: { in: schools } };
      await prisma.auditLog.deleteMany({ where });
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
      await prisma.academicContentTarget.deleteMany({ where });
      await prisma.academicContent.deleteMany({ where });
      await prisma.timetableEntry.deleteMany({ where });
      await prisma.timetablePeriod.deleteMany({ where });
      await prisma.timetableConfig.deleteMany({ where });
      await prisma.homeworkAssignment.deleteMany({ where });
      await prisma.gradeAssessment.deleteMany({ where });
      await prisma.lessonPlanItem.deleteMany({ where });
      await prisma.lessonPlan.deleteMany({ where });
      await prisma.curriculumLesson.deleteMany({ where });
      await prisma.curriculumUnit.deleteMany({ where });
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
      await prisma.user.delete({ where: { id: ids.user } });
      await prisma.organization.delete({ where: { id: ids.organization } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it.each(details.map((factory) => [factory().type, factory] as const))(
    '%s upserts, touches parent, audits once, and makes repeat a no-op',
    async (_type, factory) => {
      const detail = factory();
      const row = await content(detail.type);
      const first = await writer.mutate(scope(row.id, detail));
      expect(first.changed).toBe(true);
      const updated = await prisma.academicContent.findUniqueOrThrow({
        where: { id: row.id },
      });
      expect(updated.updatedByUserId).toBe(ids.user);
      expect(updated.updatedAt.getTime()).toBeGreaterThan(
        row.updatedAt.getTime(),
      );
      const auditCount = await prisma.auditLog.count({
        where: { schoolId: ids.school, resourceId: row.id },
      });
      expect(auditCount).toBe(1);
      const second = await writer.mutate(scope(row.id, detail));
      expect(second.changed).toBe(false);
      const unchanged = await prisma.academicContent.findUniqueOrThrow({
        where: { id: row.id },
      });
      expect(unchanged.updatedAt).toEqual(updated.updatedAt);
      expect(
        await prisma.auditLog.count({
          where: { schoolId: ids.school, resourceId: row.id },
        }),
      ).toBe(1);
    },
  );

  it.each(details.map((factory) => [factory().type, factory] as const))(
    '%s rejects wrong specialized type and GENERAL_RESOURCE before persistence',
    async (_type, factory) => {
      const detail = factory();
      const wrong = await content(
        detail.type === AcademicContentType.TEACHER_PREPARATION
          ? AcademicContentType.WEEKLY_PLAN
          : AcademicContentType.TEACHER_PREPARATION,
      );
      const general = await content(AcademicContentType.GENERAL_RESOURCE);
      for (const row of [wrong, general])
        await expect(
          writer.mutate(scope(row.id, detail)),
        ).rejects.toMatchObject({ code: 'validation.failed' });
      expect(
        await prisma.auditLog.count({
          where: {
            schoolId: ids.school,
            resourceId: { in: [wrong.id, general.id] },
          },
        }),
      ).toBe(0);
    },
  );

  it('validates curriculum, weekly foreign references, and final target compatibility', async () => {
    const prep = await content(AcademicContentType.TEACHER_PREPARATION);
    await target(prep.id);
    const detail = normalizePreparation({
      objectives: [],
      learningOutcomes: [],
      teachingStrategies: [],
      activities: [],
      curriculumId: ids.curriculum,
    });
    await expect(writer.mutate(scope(prep.id, detail))).resolves.toMatchObject({
      changed: true,
    });
    const replacement = [
      {
        scopeType: Scope.SCHOOL,
        subjectId: ids.otherSubject,
        stageId: null,
        gradeId: null,
        sectionId: null,
        classroomId: null,
        teacherSubjectAllocationId: null,
        identityFingerprint: randomUUID().replace(/-/g, ''),
      },
    ];
    await expect(
      targets.replace({
        content: prep,
        targets: replacement,
        actorId: ids.user,
      }),
    ).rejects.toMatchObject({ code: 'validation.failed' });
    expect(
      (
        await prisma.academicContentTarget.findFirstOrThrow({
          where: { academicContentId: prep.id },
        })
      ).subjectId,
    ).toBe(ids.subject);
    const week = await content(AcademicContentType.WEEKLY_PLAN);
    await target(week.id);
    const plan = normalizeWeeklyPlan({
      ...weekly().state,
      homeworkAssignmentIds: [ids.homework, ids.homework],
      gradeAssessmentIds: [ids.assessment],
    });
    await expect(writer.mutate(scope(week.id, plan))).resolves.toMatchObject({
      changed: true,
    });
    expect(
      await prisma.academicContentWeeklyPlanHomeworkReference.count({
        where: { schoolId: ids.school },
      }),
    ).toBe(1);
    await expect(
      targets.replace({
        content: week,
        targets: replacement,
        actorId: ids.user,
      }),
    ).rejects.toMatchObject({ code: 'validation.failed' });
    const online = await content(AcademicContentType.ONLINE_SESSION);
    await target(online.id);
    await writer.mutate(
      scope(
        online.id,
        normalizeOnlineSession({
          ...session().state,
          timetableEntryId: ids.timetableEntry,
        }),
      ),
    );
    await expect(
      targets.replace({
        content: online,
        targets: replacement,
        actorId: ids.user,
      }),
    ).rejects.toMatchObject({ code: 'validation.failed' });
  });

  it('enforces one subject and hierarchy context across the full preparation chain', async () => {
    const full = await content(AcademicContentType.TEACHER_PREPARATION);
    await target(full.id, ids.subject, Scope.GRADE, ids.grade);
    const all = normalizePreparation({
      topic: 'Fractions',
      objectives: ['Build a fraction'],
      learningOutcomes: [],
      teachingStrategies: [],
      activities: [],
      curriculumId: ids.curriculum,
      curriculumUnitId: ids.unit,
      curriculumLessonId: ids.lesson,
      lessonPlanId: ids.lessonPlan,
      lessonPlanItemId: ids.lessonPlanItem,
      timetableEntryId: ids.timetableEntry,
    });
    await expect(writer.mutate(scope(full.id, all))).resolves.toMatchObject({
      changed: true,
    });
    const bad = await content(AcademicContentType.TEACHER_PREPARATION);
    await target(bad.id, ids.subject, Scope.GRADE, ids.grade);
    const variants = [
      { curriculumId: ids.otherYearCurriculum },
      { curriculumId: ids.otherTermCurriculum },
      { curriculumId: ids.otherSubjectCurriculum },
      { curriculumId: ids.otherGradeCurriculum },
      { curriculumId: ids.curriculum, curriculumUnitId: ids.otherUnit },
      {
        curriculumId: ids.curriculum,
        curriculumUnitId: ids.unit,
        curriculumLessonId: ids.lesson,
        lessonPlanId: ids.lessonPlan,
        lessonPlanItemId: randomUUID(),
      },
      { lessonPlanId: randomUUID() },
      { lessonPlanId: ids.wrongSubjectLessonPlan },
      {
        lessonPlanId: ids.secondLessonPlan,
        lessonPlanItemId: ids.lessonPlanItem,
      },
      { timetableEntryId: randomUUID() },
    ];
    for (const references of variants) {
      const detail = normalizePreparation({
        objectives: [],
        learningOutcomes: [],
        teachingStrategies: [],
        activities: [],
        ...references,
      });
      await expect(writer.mutate(scope(bad.id, detail))).rejects.toMatchObject({
        code: 'validation.failed',
      });
    }
    expect(
      await prisma.academicContentPreparationDetail.count({
        where: { academicContentId: bad.id },
      }),
    ).toBe(0);
    const noTargets = await content(AcademicContentType.TEACHER_PREPARATION);
    await expect(
      writer.mutate(scope(noTargets.id, preparation())),
    ).resolves.toMatchObject({ changed: true });
    await expect(
      writer.mutate(
        scope(
          noTargets.id,
          normalizePreparation({
            objectives: [],
            learningOutcomes: [],
            teachingStrategies: [],
            activities: [],
            curriculumId: ids.curriculum,
          }),
        ),
      ),
    ).rejects.toMatchObject({ code: 'validation.failed' });
  });

  it('authors a subject resource with the canonical curriculum chain', async () => {
    const row = await content(AcademicContentType.SUBJECT_RESOURCE);
    await target(row.id, ids.subject, Scope.GRADE, ids.grade);
    const detail = normalizeSubjectResource({
      resourceCategory: AcademicSubjectResourceCategory.VIDEO,
      curriculumId: ids.curriculum,
      curriculumUnitId: ids.unit,
      curriculumLessonId: ids.lesson,
    });
    await expect(writer.mutate(scope(row.id, detail))).resolves.toMatchObject({
      changed: true,
    });
    const stored =
      await prisma.academicContentSubjectResourceDetail.findFirstOrThrow({
        where: { academicContentId: row.id },
      });
    expect(stored.resourceCategory).toBe(AcademicSubjectResourceCategory.VIDEO);
    expect(stored.curriculumLessonId).toBe(ids.lesson);
    await expect(
      writer.mutate(
        scope(
          row.id,
          normalizeSubjectResource({
            resourceCategory: AcademicSubjectResourceCategory.VIDEO,
            curriculumId: ids.curriculum,
            curriculumUnitId: ids.otherUnit,
          }),
        ),
      ),
    ).rejects.toMatchObject({ code: 'validation.failed' });
  });

  it('rejects cross-school references without disclosing foreign resource data', async () => {
    const cases: Array<[AcademicContentType, NormalizedDetail]> = [
      [
        AcademicContentType.TEACHER_PREPARATION,
        normalizePreparation({
          objectives: [],
          learningOutcomes: [],
          teachingStrategies: [],
          activities: [],
          curriculumId: ids.foreignCurriculum,
        }),
      ],
      [
        AcademicContentType.SUBJECT_RESOURCE,
        normalizeSubjectResource({
          resourceCategory: AcademicSubjectResourceCategory.REFERENCE,
          curriculumId: ids.foreignCurriculum,
        }),
      ],
      [
        AcademicContentType.WEEKLY_PLAN,
        normalizeWeeklyPlan({
          ...weekly().state,
          homeworkAssignmentIds: [ids.foreignHomework],
        }),
      ],
      [
        AcademicContentType.WEEKLY_PLAN,
        normalizeWeeklyPlan({
          ...weekly().state,
          gradeAssessmentIds: [ids.foreignAssessment],
        }),
      ],
      [
        AcademicContentType.ONLINE_SESSION,
        normalizeOnlineSession({
          ...session().state,
          timetableEntryId: ids.foreignTimetableEntry,
        }),
      ],
    ];
    for (const [type, detail] of cases) {
      const row = await content(type);
      await target(row.id);
      try {
        await writer.mutate(scope(row.id, detail));
        throw new Error('Expected foreign reference rejection');
      } catch (error) {
        expect(error).toMatchObject({ code: 'validation.failed' });
        const message = error instanceof Error ? error.message : String(error);
        expect(message).not.toContain('Private foreign');
        expect(message).not.toContain(ids.foreignSchool);
      }
      expect(
        await prisma.auditLog.count({
          where: { schoolId: ids.school, resourceId: row.id },
        }),
      ).toBe(0);
    }
  });

  it('rejects subject and classroom/scope mismatches on weekly and timetable references', async () => {
    const cases: Array<[AcademicContentType, NormalizedDetail]> = [
      [
        AcademicContentType.WEEKLY_PLAN,
        normalizeWeeklyPlan({
          ...weekly().state,
          homeworkAssignmentIds: [ids.otherYearHomework],
        }),
      ],
      [
        AcademicContentType.WEEKLY_PLAN,
        normalizeWeeklyPlan({
          ...weekly().state,
          homeworkAssignmentIds: [ids.otherTermHomework],
        }),
      ],
      [
        AcademicContentType.WEEKLY_PLAN,
        normalizeWeeklyPlan({
          ...weekly().state,
          homeworkAssignmentIds: [ids.otherSubjectHomework],
        }),
      ],
      [
        AcademicContentType.WEEKLY_PLAN,
        normalizeWeeklyPlan({
          ...weekly().state,
          homeworkAssignmentIds: [ids.otherClassHomework],
        }),
      ],
      [
        AcademicContentType.WEEKLY_PLAN,
        normalizeWeeklyPlan({
          ...weekly().state,
          gradeAssessmentIds: [ids.otherSubjectAssessment],
        }),
      ],
      [
        AcademicContentType.WEEKLY_PLAN,
        normalizeWeeklyPlan({
          ...weekly().state,
          gradeAssessmentIds: [ids.otherYearAssessment],
        }),
      ],
      [
        AcademicContentType.WEEKLY_PLAN,
        normalizeWeeklyPlan({
          ...weekly().state,
          gradeAssessmentIds: [ids.otherTermAssessment],
        }),
      ],
      [
        AcademicContentType.WEEKLY_PLAN,
        normalizeWeeklyPlan({
          ...weekly().state,
          gradeAssessmentIds: [ids.otherGradeAssessment],
        }),
      ],
      [
        AcademicContentType.TEACHER_PREPARATION,
        normalizePreparation({
          objectives: [],
          learningOutcomes: [],
          teachingStrategies: [],
          activities: [],
          timetableEntryId: ids.otherSubjectTimetableEntry,
        }),
      ],
      [
        AcademicContentType.TEACHER_PREPARATION,
        normalizePreparation({
          objectives: [],
          learningOutcomes: [],
          teachingStrategies: [],
          activities: [],
          timetableEntryId: ids.otherYearTimetableEntry,
        }),
      ],
      [
        AcademicContentType.TEACHER_PREPARATION,
        normalizePreparation({
          objectives: [],
          learningOutcomes: [],
          teachingStrategies: [],
          activities: [],
          timetableEntryId: ids.otherTermTimetableEntry,
        }),
      ],
      [
        AcademicContentType.TEACHER_PREPARATION,
        normalizePreparation({
          objectives: [],
          learningOutcomes: [],
          teachingStrategies: [],
          activities: [],
          timetableEntryId: ids.otherClassTimetableEntry,
        }),
      ],
      [
        AcademicContentType.ONLINE_SESSION,
        normalizeOnlineSession({
          ...session().state,
          timetableEntryId: ids.otherSubjectTimetableEntry,
        }),
      ],
      [
        AcademicContentType.ONLINE_SESSION,
        normalizeOnlineSession({
          ...session().state,
          timetableEntryId: ids.otherYearTimetableEntry,
        }),
      ],
      [
        AcademicContentType.ONLINE_SESSION,
        normalizeOnlineSession({
          ...session().state,
          timetableEntryId: ids.otherTermTimetableEntry,
        }),
      ],
      [
        AcademicContentType.ONLINE_SESSION,
        normalizeOnlineSession({
          ...session().state,
          timetableEntryId: ids.otherClassTimetableEntry,
        }),
      ],
    ];
    for (const [type, detail] of cases) {
      const row = await content(type);
      await target(row.id, ids.subject, Scope.GRADE, ids.grade);
      await expect(writer.mutate(scope(row.id, detail))).rejects.toMatchObject({
        code: 'validation.failed',
      });
      expect(
        await prisma.auditLog.count({
          where: { schoolId: ids.school, resourceId: row.id },
        }),
      ).toBe(0);
    }
  });

  it.each([
    [
      'preparation',
      AcademicContentType.TEACHER_PREPARATION,
      () =>
        normalizePreparation({
          objectives: [],
          learningOutcomes: [],
          teachingStrategies: [],
          activities: [],
          curriculumId: ids.curriculum,
        }),
    ],
    [
      'weekly',
      AcademicContentType.WEEKLY_PLAN,
      () =>
        normalizeWeeklyPlan({
          ...weekly().state,
          homeworkAssignmentIds: [ids.homework],
        }),
    ],
    [
      'session',
      AcademicContentType.ONLINE_SESSION,
      () =>
        normalizeOnlineSession({
          ...session().state,
          timetableEntryId: ids.timetableEntry,
        }),
    ],
  ] as const)(
    '%s reference mutation sees the target replacement committed ahead of its lock',
    async (_label, type, factory) => {
      const row = await content(type);
      await target(row.id);
      let release!: () => void;
      let acquired!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const entered = new Promise<void>((resolve) => {
        acquired = resolve;
      });
      const replacement = prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT "id" FROM "academic_contents" WHERE "id" = ${row.id}::uuid AND "school_id" = ${ids.school}::uuid FOR UPDATE`;
          acquired();
          await gate;
          await tx.academicContentTarget.deleteMany({
            where: { academicContentId: row.id, schoolId: ids.school },
          });
          await tx.academicContentTarget.create({
            data: {
              schoolId: ids.school,
              academicContentId: row.id,
              scopeType: Scope.SCHOOL,
              subjectId: ids.otherSubject,
              identityFingerprint: randomUUID().replace(/-/g, ''),
              createdByUserId: ids.user,
            },
          });
        },
        { timeout: 20_000 },
      );
      await entered;
      const pending = writer.mutate(scope(row.id, factory()));
      const state = await Promise.race([
        pending.then(
          () => 'settled',
          () => 'settled',
        ),
        new Promise<string>((resolve) =>
          setTimeout(() => resolve('blocked'), 100),
        ),
      ]);
      expect(state).toBe('blocked');
      release();
      await replacement;
      await expect(pending).rejects.toMatchObject({
        code: 'validation.failed',
      });
      expect(
        await prisma.auditLog.count({
          where: { schoolId: ids.school, resourceId: row.id },
        }),
      ).toBe(0);
    },
  );

  it('enforces term bounds and term write policy', async () => {
    const week = await content(AcademicContentType.WEEKLY_PLAN);
    const outOfTerm = normalizeWeeklyPlan({
      ...weekly().state,
      weekStartDate: '2028-08-31',
    });
    await expect(
      writer.mutate(scope(week.id, outOfTerm)),
    ).rejects.toMatchObject({ code: 'validation.failed' });
    const closed = {
      ...scope(week.id, weekly()),
      now: new Date('2029-01-01T00:00:00Z'),
    };
    await expect(writer.mutate(closed)).rejects.toMatchObject({
      code: 'academic_content.term.closed',
    });
    const inactive = {
      ...scope(week.id, weekly()),
      now: new Date('2028-09-10T00:00:00Z'),
    };
    await expect(writer.mutate(inactive)).rejects.toMatchObject({
      code: 'academic_content.term.closed',
    });
    await prisma.term.update({
      where: { id: ids.term },
      data: { isActive: true },
    });
    await expect(writer.mutate(inactive)).resolves.toMatchObject({
      changed: true,
    });
    const online = await content(AcademicContentType.ONLINE_SESSION);
    await expect(
      writer.mutate(
        scope(
          online.id,
          normalizeOnlineSession({
            ...session().state,
            startAt: '2028-08-31T23:59:59Z',
            endAt: '2028-09-01T00:01:00Z',
          }),
        ),
      ),
    ).rejects.toMatchObject({ code: 'validation.failed' });
    await expect(
      writer.mutate(
        scope(
          online.id,
          normalizeOnlineSession({
            ...session().state,
            startAt: '2028-12-31T23:00:00Z',
            endAt: '2029-01-01T00:00:00Z',
          }),
        ),
      ),
    ).rejects.toMatchObject({ code: 'validation.failed' });
  });

  it('keeps access codes and complete meeting URLs out of audit metadata', async () => {
    const row = await content(AcademicContentType.ONLINE_SESSION);
    const secret = 'private-access-acc5b';
    const url = 'https://example.test/meeting/private-token-acc5b';
    const first = normalizeOnlineSession({
      ...session().state,
      joinUrl: url,
      accessCode: secret,
    });
    await writer.mutate(scope(row.id, first));
    const second = normalizeOnlineSession({
      ...session().state,
      joinUrl: 'https://example.test/meeting/another-private-token',
      accessCode: 'second-private-access',
    });
    await writer.mutate(scope(row.id, second));
    const audits = await prisma.auditLog.findMany({
      where: { schoolId: ids.school, resourceId: row.id },
    });
    expect(audits).toHaveLength(2);
    const serialized = JSON.stringify(audits);
    for (const sensitive of [
      secret,
      url,
      'second-private-access',
      'another-private-token',
    ])
      expect(serialized).not.toContain(sensitive);
    expect(serialized).toContain('joinUrlChanged');
    expect(serialized).toContain('accessCodeChanged');
  });

  it.each(details.map((factory) => [factory().type, factory] as const))(
    '%s serializes against archive under the parent lock',
    async (_type, factory) => {
      const row = await content(factory().type);
      let release!: () => void;
      let acquired!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const entered = new Promise<void>((resolve) => {
        acquired = resolve;
      });
      const holder = prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT "id" FROM "academic_contents" WHERE "id" = ${row.id}::uuid AND "school_id" = ${ids.school}::uuid FOR UPDATE`;
          acquired();
          await gate;
          await tx.academicContent.update({
            where: { id: row.id },
            data: { status: 'ARCHIVED', archivedAt: new Date() },
          });
        },
        { timeout: 20_000 },
      );
      await entered;
      const pending = writer.mutate(scope(row.id, factory()));
      release();
      await holder;
      await expect(pending).rejects.toMatchObject({
        code: 'academic_content.status.read_only',
      });
      expect(
        await prisma.auditLog.count({
          where: { schoolId: ids.school, resourceId: row.id },
        }),
      ).toBe(0);
    },
  );

  it('rolls back detail and parent changes when the audit write fails', async () => {
    const row = await content(AcademicContentType.GUARDIAN_WEEKLY_NOTE);
    const sabotaged = {
      $transaction: (
        operation: (tx: Prisma.TransactionClient) => Promise<unknown>,
        options: object,
      ) =>
        prisma.$transaction(
          (tx) =>
            operation(
              new Proxy(tx, {
                get(target, property) {
                  if (property === 'auditLog')
                    return {
                      create: () =>
                        Promise.reject(new Error('audit unavailable')),
                    };
                  return Reflect.get(target, property) as unknown;
                },
              }) as Prisma.TransactionClient,
            ),
          options,
        ),
    } as unknown as PrismaService;
    const failingWriter = new AcademicContentTypeDetailRepository(sabotaged);
    await expect(failingWriter.mutate(scope(row.id, note()))).rejects.toThrow(
      'audit unavailable',
    );
    expect(
      await prisma.academicContentGuardianNoteDetail.count({
        where: { academicContentId: row.id },
      }),
    ).toBe(0);
    expect(
      (
        await prisma.academicContent.findUniqueOrThrow({
          where: { id: row.id },
        })
      ).updatedByUserId,
    ).toBeNull();
  });

  it('keeps an existing deleted reference on an exact no-op', async () => {
    const row = await content(AcademicContentType.SUBJECT_RESOURCE);
    await target(row.id);
    const detail = normalizeSubjectResource({
      resourceCategory: AcademicSubjectResourceCategory.DOCUMENT,
      curriculumId: ids.curriculum,
    });
    await writer.mutate(scope(row.id, detail));
    await prisma.curriculum.update({
      where: { id: ids.curriculum },
      data: { deletedAt: new Date() },
    });
    await expect(writer.mutate(scope(row.id, detail))).resolves.toMatchObject({
      changed: false,
    });
    const current =
      await prisma.academicContentSubjectResourceDetail.findFirstOrThrow({
        where: { academicContentId: row.id },
      });
    expect(current.curriculumId).toBe(ids.curriculum);
  });

  it('reads each current typed detail, ordered weekly references, and no General Resource detail', async () => {
    const weeklyWithReferences = normalizeWeeklyPlan({
      ...weekly().state,
      objectives: ['First', 'Second'],
      homeworkAssignmentIds: [ids.homework],
      gradeAssessmentIds: [ids.assessment],
    });
    const cases: NormalizedDetail[] = [
      preparation(),
      weeklyWithReferences,
      note(),
      resource(),
      session(),
    ];
    for (const detail of cases) {
      const row = await content(detail.type);
      await target(row.id);
      await writer.mutate(scope(row.id, detail));
      const projected = await asViewer(() => managementDetail.execute(row.id));
      const response = presentAcademicContentDetail(projected);
      expect(response.type).toBe(detail.type);
      expect(response.details).not.toBeNull();
      expect(JSON.stringify(response.details)).not.toMatch(
        /schoolId|contentType|createdBy|updatedBy|"id"/,
      );
      if (detail.type === AcademicContentType.WEEKLY_PLAN) {
        expect(response.details).toMatchObject({
          weekStartDate: '2028-09-10',
          weekEndDate: '2028-09-16',
          objectives: ['First', 'Second'],
          homeworkAssignmentIds: [ids.homework],
          gradeAssessmentIds: [ids.assessment],
        });
        expect(JSON.stringify(response.details)).not.toMatch(
          /homeworkReferences|assessmentReferences/,
        );
      }
      if (detail.type === AcademicContentType.ONLINE_SESSION)
        expect(response.details).toMatchObject({
          joinUrl: 'https://example.test/meeting',
          startAt: '2028-09-10T10:00:00.000Z',
          timezone: 'Africa/Cairo',
        });
    }
    const general = await content(AcademicContentType.GENERAL_RESOURCE);
    await target(general.id);
    expect(
      presentAcademicContentDetail(
        await asViewer(() => managementDetail.execute(general.id)),
      ).details,
    ).toBeNull();
    const missing = await content(AcademicContentType.TEACHER_PREPARATION);
    await target(missing.id);
    expect(
      presentAcademicContentDetail(
        await asViewer(() => managementDetail.execute(missing.id)),
      ).details,
    ).toBeNull();
  });

  it('evaluates readiness without mutating the aggregate or disclosing a foreign school', async () => {
    await prisma.term.update({
      where: { id: ids.term },
      data: { isActive: true },
    });
    const row = await content(AcademicContentType.TEACHER_PREPARATION);
    await target(row.id);
    await writer.mutate(scope(row.id, preparation()));
    const before = await prisma.academicContent.findUniqueOrThrow({
      where: { id: row.id },
    });
    const auditsBefore = await prisma.auditLog.count({
      where: { resourceId: row.id },
    });
    const revisionsBefore = await prisma.academicContentRevision.count({
      where: { academicContentId: row.id },
    });
    expect(
      await asViewer(() =>
        readiness.execute(row.id, new Date('2028-09-15T12:00:00Z')),
      ),
    ).toEqual({
      canAdvance: true,
      blockingReasons: [],
    });
    expect(
      await prisma.academicContent.findUniqueOrThrow({ where: { id: row.id } }),
    ).toEqual(before);
    expect(await prisma.auditLog.count({ where: { resourceId: row.id } })).toBe(
      auditsBefore,
    );
    expect(
      await prisma.academicContentRevision.count({
        where: { academicContentId: row.id },
      }),
    ).toBe(revisionsBefore);

    const foreign = await prisma.academicContent.create({
      data: {
        schoolId: ids.foreignSchool,
        academicYearId: ids.foreignYear,
        termId: ids.foreignTerm,
        type: AcademicContentType.TEACHER_PREPARATION,
        audience: 'INTERNAL_STAFF',
        title: 'Private foreign preparation',
        createdByUserId: ids.user,
      },
    });
    await expect(
      asViewer(() => managementDetail.execute(foreign.id)),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      asViewer(() => readiness.execute(foreign.id)),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      writer.mutate(scope(foreign.id, preparation())),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});
