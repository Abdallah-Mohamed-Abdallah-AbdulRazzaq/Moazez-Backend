import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AdmissionApplicationSource,
  AdmissionApplicationStatus,
  AdmissionDecisionType,
  AttendanceExcuseStatus,
  AttendanceExcuseType,
  AttendanceMode,
  AttendanceScopeType,
  AttendanceSessionStatus,
  AttendanceStatus,
  BehaviorRecordStatus,
  BehaviorRecordType,
  CurriculumStatus,
  GradeAssessmentApprovalStatus,
  GradeAssessmentDeliveryMode,
  GradeAssessmentType,
  GradeItemStatus,
  GradeScopeType,
  HomeworkAssignmentStatus,
  HomeworkSubmissionStatus,
  LessonPlanStatus,
  MembershipStatus,
  PrismaClient,
  ReinforcementSource,
  ReinforcementTaskStatus,
  RewardCatalogItemStatus,
  RewardRedemptionStatus,
  StudentEnrollmentStatus,
  TimetableConfigStatus,
  TimetableScopeType,
  UserStatus,
  UserType,
  XpSourceType,
} from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { BullmqService } from '../../src/infrastructure/queue/bullmq.service';

const GLOBAL_PREFIX = '/api/v1';
const DEMO_ADMIN_EMAIL = 'admin@academy.moazez.dev';
const DEMO_ADMIN_PASSWORD = 'School123!';
const DEMO_SCHOOL_SLUG = 'moazez-academy';
const PASSWORD = 'DashboardAnalyticsData123!';

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

type ExpressLayer = {
  route?: {
    path?: string | string[];
    methods?: Record<string, boolean>;
  };
  handle?: {
    stack?: ExpressLayer[];
  };
};

type CreatedPrincipal = {
  email: string;
  userId: string;
  roleId: string;
  organizationId: string;
  schoolId: string;
};

jest.setTimeout(90000);

describe('DASHBOARD-ANALYTICS-PACKS-1A data pack foundation (e2e)', () => {
  const suffix = randomUUID().split('-')[0];
  const marker = `analytics-data-${suffix}`;

  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let demoSchoolId = '';
  let demoOrganizationId = '';
  let deniedPrincipal: CreatedPrincipal;
  let academicYearId = '';
  let termId = '';
  let gradeId = '';
  let sectionId = '';
  let otherSectionId = '';
  let classroomId = '';
  let secondClassroomId = '';
  let crossSchoolId = '';
  let crossSchoolAcademicYearId = '';
  const attendanceStudentIds: string[] = [];
  const attendanceSessionIds: string[] = [];
  const attendanceExcuseIds: string[] = [];
  const admissionsApplicationIds: string[] = [];
  const admissionsDecisionIds: string[] = [];
  const analyticsEnrollmentIds: string[] = [];
  const analyticsGuardianIds: string[] = [];
  const analyticsStudentGuardianIds: string[] = [];
  const academicsSubjectIds: string[] = [];
  const academicsSubjectAllocationIds: string[] = [];
  const academicsTeacherAllocationIds: string[] = [];
  const academicsTimetableConfigIds: string[] = [];
  const academicsCurriculumIds: string[] = [];
  const academicsLessonPlanIds: string[] = [];
  const gradesAssessmentIds: string[] = [];
  const gradesItemIds: string[] = [];
  const homeworkAssignmentIds: string[] = [];
  const homeworkTargetIds: string[] = [];
  const homeworkSubmissionIds: string[] = [];
  const behaviorCategoryIds: string[] = [];
  const behaviorRecordIds: string[] = [];
  const reinforcementTaskIds: string[] = [];
  const reinforcementAssignmentIds: string[] = [];
  const xpLedgerIds: string[] = [];
  const rewardCatalogItemIds: string[] = [];
  const rewardRedemptionIds: string[] = [];

  const createdUserIds: string[] = [];
  const createdRoleIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const demoSchool = await prisma.school.findFirst({
      where: { slug: DEMO_SCHOOL_SLUG },
      select: { id: true, organizationId: true },
    });
    if (!demoSchool) {
      throw new Error('Demo school not found - run `npm run seed` first.');
    }
    demoSchoolId = demoSchool.id;
    demoOrganizationId = demoSchool.organizationId;

    const hierarchy = await createAnalyticsHierarchyFixtures();
    academicYearId = hierarchy.academicYearId;
    termId = hierarchy.termId;
    gradeId = hierarchy.gradeId;
    sectionId = hierarchy.sectionId;
    otherSectionId = hierarchy.otherSectionId;
    classroomId = hierarchy.classroomId;
    secondClassroomId = hierarchy.secondClassroomId;
    crossSchoolId = hierarchy.crossSchoolId;
    crossSchoolAcademicYearId = hierarchy.crossSchoolAcademicYearId;
    await createAttendanceAnalyticsFixtures();
    await createAdmissionsStudentsAnalyticsFixtures();
    await createAcademicsAnalyticsFixtures();
    await createGradesHomeworkAnalyticsFixtures();
    await createBehaviorReinforcementAnalyticsFixtures();

    const permissionIds = await ensureDashboardPermissions();
    await ensureDemoAdminHasDashboardPermissions(Object.values(permissionIds));
    deniedPrincipal = await createPrincipal({
      label: 'denied',
      organizationId: demoOrganizationId,
      schoolId: demoSchoolId,
      permissionIds: [],
    });

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(BullmqService)
      .useValue(createNoopBullmqService())
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(GLOBAL_PREFIX.replace(/^\//, ''));
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (prisma) {
      await cleanupAnalyticsHierarchyFixtures();
      await cleanupE2eData();
      await prisma.$disconnect();
    }
  });

  it('registers only the analytics data route beyond the existing dashboard inventory', () => {
    const routes = listRegisteredRoutes();

    expect(routes).toEqual(
      expect.arrayContaining([
        'GET /api/v1/dashboard/summary',
        'GET /api/v1/dashboard/alerts',
        'GET /api/v1/dashboard/activity-feed',
        'GET /api/v1/dashboard/command-center',
        'GET /api/v1/dashboard/light-mode-dropdown',
        'GET /api/v1/dashboard/widgets',
        'GET /api/v1/dashboard/widgets/:widgetKey',
        'GET /api/v1/dashboard/modules',
        'GET /api/v1/dashboard/modules/:moduleKey',
        'GET /api/v1/dashboard/analytics/catalog',
        'GET /api/v1/dashboard/analytics/charts',
        'GET /api/v1/dashboard/analytics/charts/:chartKey',
        'GET /api/v1/dashboard/analytics/charts/:chartKey/data',
      ]),
    );
    for (const absentRoute of [
      'POST /api/v1/dashboard/alerts/:alertKey/acknowledge',
      'POST /api/v1/dashboard/alerts/:alertKey/dismiss',
      'POST /api/v1/dashboard/alerts/:alertKey/snooze',
      'GET /api/v1/dashboard/exports/:exportKey',
      'POST /api/v1/dashboard/reports/:reportKey',
      'GET /api/v1/dashboard/realtime',
    ]) {
      expect(routes).not.toContain(absentRoute);
    }
  });

  it('returns 401 without a token and 403 without dashboard.analytics.view', async () => {
    const deniedToken = await login(deniedPrincipal.email, PASSWORD);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/dashboard/analytics/charts/attendance.pending_sessions/data`,
      )
      .expect(401);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/dashboard/analytics/charts/attendance.pending_sessions/data`,
      )
      .set('Authorization', `Bearer ${deniedToken}`)
      .expect(403);
  });

  it('returns computed snapshot data for an authorized school admin and available chart', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    const summaryResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/summary`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const response = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/dashboard/analytics/charts/attendance.pending_sessions/data`,
      )
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const expectedPending =
      summaryResponse.body.cards.attendance.pendingSessionsToday;
    expect(response.body).toMatchObject({
      generatedAt: expect.any(String),
      chartKey: 'attendance.pending_sessions',
      source: 'attendance',
      title: 'Pending attendance sessions',
      type: 'bar',
      status: 'available',
      range: '30d',
      granularity: 'day',
      filters: {
        range: '30d',
        granularity: 'day',
        dateFrom: null,
        dateTo: null,
        academicYearId: null,
        termId: null,
        gradeId: null,
        sectionId: null,
        classroomId: null,
      },
      data: {
        series: [
          {
            key: 'pending',
            label: 'Pending',
            points: [
              {
                x: 'snapshot',
                y: expectedPending,
                coordinate: { kind: 'snapshot' },
              },
            ],
          },
        ],
        totals: { pending: expectedPending },
        summary: {
          value: expectedPending,
          label: 'Pending attendance sessions',
        },
        empty: expectedPending === 0,
      },
      meta: {
        source: 'dashboard_analytics_data_pack',
        pack: 'operational_snapshot_v1',
        dataAvailability: 'computed_snapshot',
        computation: 'dashboard_summary_snapshot',
        query: {
          effectiveTimezone: expect.any(String),
          requestedFilters: [],
          appliedFilters: expect.arrayContaining(['academicYearId', 'termId']),
          notApplicableFilters: ['range', 'granularity'],
          resolvedWindow: {
            startInclusive: expect.any(String),
            endExclusive: expect.any(String),
            startCivilDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
            endCivilDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
          },
        },
        deferred: {
          historicalSeries: 'deferred',
          drilldown: 'deferred',
          exports: 'deferred',
          realtime: 'deferred',
        },
      },
    });
    expect(response.body).toHaveProperty('emptyState');
    expectNoInternalLeaks(response.body);
    expect(JSON.stringify(response.body.data.series)).not.toContain(
      'YYYY-MM-DD',
    );
  });

  it('applies valid same-school hierarchy filters to an existing snapshot chart', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/dashboard/analytics/charts/attendance.pending_sessions/data`,
      )
      .query({
        academicYearId,
        termId,
        gradeId,
        sectionId,
        classroomId,
      })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body).toMatchObject({
      filters: {
        academicYearId,
        termId,
        gradeId,
        sectionId,
        classroomId,
      },
      data: {
        totals: { pending: 0 },
      },
      meta: {
        query: {
          requestedFilters: [
            'academicYearId',
            'termId',
            'gradeId',
            'sectionId',
            'classroomId',
          ],
          appliedFilters: expect.arrayContaining([
            'academicYearId',
            'termId',
            'gradeId',
            'sectionId',
            'classroomId',
          ]),
          notApplicableFilters: ['range', 'granularity'],
        },
      },
    });
    expectNoInternalLeaks(response.body);
  });

  it('returns a safe not_implemented envelope for known unrelated charts', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/analytics/charts/admissions.funnel/data`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body).toMatchObject({
      generatedAt: expect.any(String),
      chartKey: 'admissions.funnel',
      source: 'admissions',
      status: 'planned',
      range: '30d',
      granularity: 'day',
      data: {
        series: [],
        totals: {},
        summary: null,
        empty: true,
      },
      emptyState: {
        reason: 'not_implemented',
      },
      meta: {
        source: 'dashboard_analytics_data_pack',
        pack: null,
        dataAvailability: 'definition_only',
      },
    });
    expectNoInternalLeaks(response.body);
  });

  it('returns all six current Application status categories with compatibility-only time metadata', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    const path = `${GLOBAL_PREFIX}/dashboard/analytics/charts/admissions.applications_by_status/data`;
    const response = await request(app.getHttpServer())
      .get(path)
      .query({
        range: '30d',
        granularity: 'day',
        academicYearId,
        gradeId,
      })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body).toMatchObject({
      chartKey: 'admissions.applications_by_status',
      status: 'available',
      data: {
        totals: {
          documents_pending: 1,
          submitted: 1,
          under_review: 1,
          accepted: 1,
          rejected: 1,
          waitlisted: 1,
        },
        summary: { value: 6, label: 'Applications' },
        empty: false,
      },
      meta: {
        pack: 'admissions_students_v1',
        dataAvailability: 'computed_category',
        computation: 'admissions_current_application_status_distribution',
        query: {
          requestedFilters: [
            'range',
            'granularity',
            'academicYearId',
            'gradeId',
          ],
          appliedFilters: ['academicYearId', 'gradeId'],
          notApplicableFilters: ['range', 'granularity'],
        },
      },
    });
    expect(
      response.body.data.series.map((series: { key: string }) => series.key),
    ).toEqual([
      'documents_pending',
      'submitted',
      'under_review',
      'accepted',
      'rejected',
      'waitlisted',
    ]);
    for (const query of [
      { range: '7d' },
      { granularity: 'week' },
      { dateFrom: '2026-07-01' },
      { termId },
    ]) {
      await request(app.getHttpServer())
        .get(path)
        .query(query)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    }
    expectNoInternalLeaks(response.body);
  });

  it('returns timezone-aware Application submission and acceptance event series', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    const path = `${GLOBAL_PREFIX}/dashboard/analytics/charts/admissions.applications_over_time/data`;
    const response = await request(app.getHttpServer())
      .get(path)
      .query({
        range: 'custom',
        granularity: 'day',
        dateFrom: '2026-07-01',
        dateTo: '2026-07-10',
        academicYearId,
        gradeId,
      })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body).toMatchObject({
      chartKey: 'admissions.applications_over_time',
      data: {
        totals: { submitted: 5, accepted: 1 },
        summary: { value: 6, label: 'Application lifecycle events' },
        empty: false,
      },
      meta: {
        pack: 'admissions_students_v1',
        dataAvailability: 'computed_series',
        computation: 'admissions_application_submission_acceptance_events',
      },
    });
    const accepted = response.body.data.series.find(
      (series: { key: string }) => series.key === 'accepted',
    );
    expect(
      accepted.points.find((point: { y: number }) => point.y === 1),
    ).toMatchObject({
      x: '2026-07-09',
      coordinate: { kind: 'civil_date', date: '2026-07-09' },
    });
    for (const granularity of ['week', 'month']) {
      await request(app.getHttpServer())
        .get(path)
        .query({
          range: 'custom',
          granularity,
          dateFrom: '2026-06-01',
          dateTo: '2026-07-10',
          academicYearId,
          gradeId,
        })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    }
    expectNoInternalLeaks(response.body);
  });

  it('returns point-in-time Enrollment stock and withdrawal events through historical placement filters', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    const hierarchyQuery = {
      academicYearId,
      termId,
      gradeId,
      sectionId,
      classroomId,
    };
    const stockResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/dashboard/analytics/charts/students.enrollment_growth/data`,
      )
      .query({
        range: 'custom',
        granularity: 'day',
        dateFrom: '2026-07-01',
        dateTo: '2026-07-12',
        ...hierarchyQuery,
      })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(stockResponse.body).toMatchObject({
      data: {
        totals: { active_enrollments: 2 },
        summary: { value: 2, label: 'Active enrollments' },
        empty: false,
      },
      meta: {
        pack: 'admissions_students_v1',
        computation: 'students_point_in_time_active_enrollment_stock',
      },
    });
    expect(stockResponse.body.data.series[0].points.at(-1)).toMatchObject({
      x: '2026-07-12',
      y: 2,
    });

    const withdrawalResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/dashboard/analytics/charts/students.withdrawal_trend/data`,
      )
      .query({
        range: 'custom',
        granularity: 'day',
        dateFrom: '2026-07-01',
        dateTo: '2026-07-12',
        ...hierarchyQuery,
      })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(withdrawalResponse.body).toMatchObject({
      data: {
        totals: { withdrawals: 1 },
        summary: { value: 1, label: 'Withdrawals' },
      },
      meta: {
        pack: 'admissions_students_v1',
        computation: 'students_withdrawal_events',
      },
    });
    expectNoInternalLeaks(stockResponse.body);
    expectNoInternalLeaks(withdrawalResponse.body);
  });

  it('counts distinct active Students for current guardian coverage and preserves hierarchy metadata', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    const path = `${GLOBAL_PREFIX}/dashboard/analytics/charts/students.guardian_coverage/data`;
    const response = await request(app.getHttpServer())
      .get(path)
      .query({
        range: '30d',
        granularity: 'day',
        academicYearId,
        termId,
        gradeId,
        sectionId,
        classroomId,
      })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body).toMatchObject({
      data: {
        totals: { covered: 1, missing: 1 },
        summary: { value: 2, label: 'Active students' },
      },
      meta: {
        pack: 'admissions_students_v1',
        computation: 'students_current_guardian_coverage',
        query: {
          appliedFilters: [
            'academicYearId',
            'termId',
            'gradeId',
            'sectionId',
            'classroomId',
          ],
          notApplicableFilters: ['range', 'granularity'],
        },
      },
    });
    for (const query of [
      { range: '90d' },
      { granularity: 'month' },
      { dateTo: '2026-07-12' },
    ]) {
      await request(app.getHttpServer())
        .get(path)
        .query(query)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    }
    expectNoInternalLeaks(response.body);
  });

  it('returns teacher allocation coverage from the expected SubjectAllocation x Classroom matrix', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    const path = `${GLOBAL_PREFIX}/dashboard/analytics/charts/academics.teacher_allocation_coverage/data`;
    const response = await request(app.getHttpServer())
      .get(path)
      .query({
        range: '30d',
        granularity: 'day',
        academicYearId,
        termId,
        gradeId,
        sectionId,
      })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body).toMatchObject({
      chartKey: 'academics.teacher_allocation_coverage',
      data: {
        totals: { allocated: 1, missing: 1 },
        summary: { value: 2, label: 'Teacher allocation units' },
        empty: false,
      },
      meta: {
        pack: 'academics_v1',
        dataAvailability: 'computed_category',
        computation: 'academics_teacher_allocation_coverage',
        query: {
          appliedFilters: ['academicYearId', 'termId', 'gradeId', 'sectionId'],
          notApplicableFilters: ['range', 'granularity'],
        },
      },
    });
    expect(
      response.body.data.series.map((series: { key: string }) => series.key),
    ).toEqual(['allocated', 'missing']);

    const classroomResponse = await request(app.getHttpServer())
      .get(path)
      .query({ classroomId: secondClassroomId })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(classroomResponse.body.data.totals).toEqual({
      allocated: 0,
      missing: 1,
    });
    expectNoInternalLeaks(response.body);
    expectNoInternalLeaks(classroomResponse.body);
  });

  it.each([
    [
      'academics.timetable_publication_status',
      ['academicYearId', 'termId'],
      { published: 1, draft: 1 },
      'Current timetable configurations',
      'academics_current_timetable_publication_status',
    ],
    [
      'academics.curriculum_activation',
      ['academicYearId', 'termId', 'gradeId'],
      { active: 1, draft: 1 },
      'Current curricula',
      'academics_current_curriculum_activation_status',
    ],
    [
      'academics.lesson_plan_activation',
      ['academicYearId', 'termId', 'gradeId', 'sectionId', 'classroomId'],
      { active: 1, draft: 1 },
      'Current lesson plans',
      'academics_current_lesson_plan_activation_status',
    ],
  ] as const)(
    'returns current non-archived category data for %s',
    async (chartKey, hierarchyKeys, totals, summaryLabel, computation) => {
      const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
      const hierarchyValues = {
        academicYearId,
        termId,
        gradeId,
        sectionId,
        classroomId,
      };
      const hierarchyQuery = Object.fromEntries(
        hierarchyKeys.map((key) => [key, hierarchyValues[key]]),
      );
      const response = await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/dashboard/analytics/charts/${chartKey}/data`)
        .query({ range: '30d', granularity: 'day', ...hierarchyQuery })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        chartKey,
        data: {
          totals,
          summary: { value: 2, label: summaryLabel },
          empty: false,
        },
        meta: {
          pack: 'academics_v1',
          dataAvailability: 'computed_category',
          computation,
          query: {
            appliedFilters: hierarchyKeys,
            notApplicableFilters: ['range', 'granularity'],
          },
        },
      });
      expectNoInternalLeaks(response.body);
    },
  );

  it('enforces Academics compatibility defaults and exact unsupported hierarchy filters', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    const teacherPath = `${GLOBAL_PREFIX}/dashboard/analytics/charts/academics.teacher_allocation_coverage/data`;
    for (const query of [
      { range: '7d' },
      { granularity: 'week' },
      { dateFrom: '2026-07-01' },
    ]) {
      await request(app.getHttpServer())
        .get(teacherPath)
        .query(query)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    }
    for (const [chartKey, query] of [
      ['academics.timetable_publication_status', { gradeId }],
      ['academics.curriculum_activation', { sectionId }],
    ] as const) {
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/dashboard/analytics/charts/${chartKey}/data`)
        .query(query)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    }
  });

  it('returns exact current Grades and Homework category aggregates', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    const cases = [
      [
        'grades.assessment_status_distribution',
        { draft: 1, published: 1, approved: 1, locked: 1 },
        ['draft', 'published', 'approved', 'locked'],
        'Current assessments',
        'grades_current_assessment_status_distribution',
      ],
      [
        'homework.assignment_status_distribution',
        { draft: 1, published: 1, closed: 1, cancelled: 1 },
        ['draft', 'published', 'closed', 'cancelled'],
        'Current homework assignments',
        'homework_current_assignment_status_distribution',
      ],
      [
        'homework.grade_sync_coverage',
        { linked: 1, pending: 2 },
        ['linked', 'pending'],
        'Graded homework assignments',
        'homework_current_grade_sync_link_coverage',
      ],
    ] as const;

    for (const [chartKey, totals, seriesKeys, label, computation] of cases) {
      const response = await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/dashboard/analytics/charts/${chartKey}/data`)
        .query({
          range: '30d',
          granularity: 'day',
          academicYearId,
          termId,
          gradeId,
          sectionId,
          classroomId,
        })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.data.totals).toEqual(totals);
      expect(response.body.data.summary).toEqual({
        value: Object.values(totals).reduce((sum, value) => sum + value, 0),
        label,
      });
      expect(
        response.body.data.series.map((series: { key: string }) => series.key),
      ).toEqual(seriesKeys);
      expect(response.body.meta).toMatchObject({
        pack: 'grades_homework_v1',
        computation,
        query: {
          appliedFilters: [
            'academicYearId',
            'termId',
            'gradeId',
            'sectionId',
            'classroomId',
          ],
          notApplicableFilters: ['range', 'granularity'],
        },
      });
      expectNoInternalLeaks(response.body);
    }
  });

  it('requires explicit AcademicYear and Term and returns Enrollment x Assessment gradebook completion', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    const path = `${GLOBAL_PREFIX}/dashboard/analytics/charts/grades.gradebook_completion/data`;

    for (const query of [{}, { academicYearId }, { termId }]) {
      await request(app.getHttpServer())
        .get(path)
        .query(query)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    }

    const response = await request(app.getHttpServer())
      .get(path)
      .query({ academicYearId, termId, classroomId })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(response.body).toMatchObject({
      data: {
        totals: { complete: 2, missing: 4 },
        summary: { value: 6, label: 'Expected gradebook cells' },
      },
      meta: {
        pack: 'grades_homework_v1',
        computation: 'grades_current_gradebook_completion',
      },
    });
    expectNoInternalLeaks(response.body);
  });

  it('returns independently timestamped, timezone-aware Homework submission and review buckets', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    const response = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/dashboard/analytics/charts/homework.submission_review_trend/data`,
      )
      .query({
        range: 'custom',
        granularity: 'week',
        dateFrom: '2026-07-01',
        dateTo: '2026-07-14',
        academicYearId,
        termId,
        classroomId,
      })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body.data.totals).toEqual({ submitted: 2, reviewed: 1 });
    expect(
      response.body.data.series.map((series: { key: string }) => series.key),
    ).toEqual(['submitted', 'reviewed']);
    expect(
      response.body.data.series[0].points.map(
        (point: { y: number }) => point.y,
      ),
    ).toEqual([2, 0, 0]);
    expect(
      response.body.data.series[1].points.map(
        (point: { y: number }) => point.y,
      ),
    ).toEqual([0, 1, 0]);
    expect(response.body.meta).toMatchObject({
      pack: 'grades_homework_v1',
      computation: 'homework_submission_review_trend',
      dataAvailability: 'computed_series',
    });
    expectNoInternalLeaks(response.body);
  });

  it('returns approved Behavior records in deterministic timezone-aware day, week, and month buckets', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    const path = `${GLOBAL_PREFIX}/dashboard/analytics/charts/behavior.positive_negative_trend/data`;
    const baseQuery = {
      range: 'custom',
      dateFrom: '2026-07-01',
      dateTo: '2026-07-10',
      academicYearId,
      termId,
      gradeId,
      sectionId,
      classroomId,
    };

    const day = await request(app.getHttpServer())
      .get(path)
      .query({ ...baseQuery, granularity: 'day' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const week = await request(app.getHttpServer())
      .get(path)
      .query({ ...baseQuery, granularity: 'week' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const month = await request(app.getHttpServer())
      .get(path)
      .query({ ...baseQuery, dateTo: '2026-07-31', granularity: 'month' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(day.body).toMatchObject({
      chartKey: 'behavior.positive_negative_trend',
      data: {
        totals: { positive: 1, negative: 1 },
        summary: { value: 2, label: 'Approved behavior records' },
        empty: false,
      },
      meta: {
        pack: 'behavior_reinforcement_v1',
        dataAvailability: 'computed_series',
        computation: 'behavior_approved_positive_negative_trend',
      },
    });
    expect(
      day.body.data.series.map((series: { key: string }) => series.key),
    ).toEqual(['positive', 'negative']);
    expect(
      day.body.data.series[0].points.find(
        (point: { y: number }) => point.y === 1,
      ),
    ).toMatchObject({
      x: '2026-07-03',
      coordinate: { kind: 'civil_date', date: '2026-07-03' },
    });
    expect(
      week.body.data.series[0].points.map((point: { y: number }) => point.y),
    ).toEqual([1, 0]);
    expect(
      week.body.data.series[1].points.map((point: { y: number }) => point.y),
    ).toEqual([0, 1]);
    expect(month.body.data.series[0].points).toEqual([
      expect.objectContaining({
        x: '2026-07',
        y: 1,
        coordinate: { kind: 'calendar_month', month: '2026-07' },
      }),
    ]);
    for (const response of [day, week, month]) {
      expectNoInternalLeaks(response.body);
    }
  });

  it('returns submitted-only Behavior review snapshot and approved category counts', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    const hierarchyQuery = {
      academicYearId,
      termId,
      gradeId,
      sectionId,
      classroomId,
    };
    const pending = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/dashboard/analytics/charts/behavior.pending_review/data`,
      )
      .query({ range: '30d', granularity: 'day', ...hierarchyQuery })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const categories = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/dashboard/analytics/charts/behavior.records_by_category/data`,
      )
      .query({
        range: 'custom',
        granularity: 'day',
        dateFrom: '2026-07-01',
        dateTo: '2026-07-10',
        ...hierarchyQuery,
      })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const empty = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/dashboard/analytics/charts/behavior.records_by_category/data`,
      )
      .query({
        range: 'custom',
        granularity: 'day',
        dateFrom: '2026-07-01',
        dateTo: '2026-07-10',
        classroomId: secondClassroomId,
      })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(pending.body).toMatchObject({
      data: {
        totals: { pending_review: 1 },
        summary: { value: 1, label: 'Behavior records pending review' },
      },
      meta: {
        pack: 'behavior_reinforcement_v1',
        dataAvailability: 'computed_snapshot',
        computation: 'behavior_current_pending_review',
        query: {
          appliedFilters: expect.arrayContaining(Object.keys(hierarchyQuery)),
          notApplicableFilters: ['range', 'granularity'],
        },
      },
    });
    expect(categories.body).toMatchObject({
      data: {
        totals: { records: 2 },
        summary: { value: 2, label: 'Approved behavior records' },
      },
      meta: {
        pack: 'behavior_reinforcement_v1',
        dataAvailability: 'computed_category',
        computation: 'behavior_approved_records_by_category',
        query: { notApplicableFilters: ['granularity'] },
      },
    });
    expect(categories.body.data.series[0].points).toEqual([
      expect.objectContaining({ x: 'Respect', y: 1 }),
      expect.objectContaining({ x: 'Uncategorized', y: 1 }),
    ]);
    expect(empty.body).toMatchObject({
      data: { totals: { records: 0 }, empty: true },
      emptyState: { reason: 'no_data' },
    });
    for (const response of [pending, categories, empty]) {
      expectNoInternalLeaks(response.body);
    }
  });

  it('returns net XpLedger activity with negative values preserved across day, week, and month buckets', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    const path = `${GLOBAL_PREFIX}/dashboard/analytics/charts/reinforcement.xp_activity_trend/data`;
    const baseQuery = {
      range: 'custom',
      dateFrom: '2026-07-01',
      dateTo: '2026-07-10',
      academicYearId,
      termId,
      classroomId,
    };
    const responses = await Promise.all(
      ['day', 'week', 'month'].map((granularity) =>
        request(app.getHttpServer())
          .get(path)
          .query({
            ...baseQuery,
            dateTo: granularity === 'month' ? '2026-07-31' : baseQuery.dateTo,
            granularity,
          })
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200),
      ),
    );
    const [day, week, month] = responses;

    expect(day.body).toMatchObject({
      data: {
        totals: { xp: 6 },
        summary: { value: 6, label: 'Net XP activity' },
        empty: false,
      },
      meta: {
        pack: 'behavior_reinforcement_v1',
        dataAvailability: 'computed_series',
        computation: 'reinforcement_xp_activity_trend',
      },
    });
    expect(day.body.data.series[0].points).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ x: '2026-07-03', y: 10 }),
        expect.objectContaining({ x: '2026-07-08', y: -4 }),
      ]),
    );
    expect(
      week.body.data.series[0].points.map((point: { y: number }) => point.y),
    ).toEqual([10, -4]);
    expect(month.body.data.series[0].points).toEqual([
      expect.objectContaining({ x: '2026-07', y: 6 }),
    ]);
    for (const response of responses) {
      expectNoInternalLeaks(response.body);
    }
  });

  it('returns assignment-level completion and cumulative reward redemption funnel semantics', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    const hierarchyQuery = {
      academicYearId,
      termId,
      gradeId,
      sectionId,
      classroomId,
    };
    const completion = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/dashboard/analytics/charts/reinforcement.task_completion/data`,
      )
      .query({ range: '30d', granularity: 'day', ...hierarchyQuery })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const funnel = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/dashboard/analytics/charts/reinforcement.reward_redemption_status/data`,
      )
      .query({
        range: 'custom',
        granularity: 'day',
        dateFrom: '2026-07-01',
        dateTo: '2026-07-10',
        ...hierarchyQuery,
      })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(completion.body).toMatchObject({
      data: {
        totals: { completed: 1, pending: 1, overdue: 1 },
        summary: { value: 3, label: 'Current reinforcement assignments' },
      },
      meta: {
        pack: 'behavior_reinforcement_v1',
        dataAvailability: 'computed_category',
        computation: 'reinforcement_current_assignment_completion',
        query: {
          appliedFilters: expect.arrayContaining(Object.keys(hierarchyQuery)),
          notApplicableFilters: ['range', 'granularity'],
        },
      },
    });
    expect(
      completion.body.data.series.map((series: { key: string }) => series.key),
    ).toEqual(['completed', 'pending', 'overdue']);
    expect(funnel.body).toMatchObject({
      data: {
        totals: { requested: 5, approved: 2, fulfilled: 1 },
        summary: { value: 5, label: 'Reward redemption requests' },
      },
      meta: {
        pack: 'behavior_reinforcement_v1',
        dataAvailability: 'computed_category',
        computation: 'reinforcement_reward_redemption_funnel',
        query: { notApplicableFilters: ['granularity'] },
      },
    });
    expect(
      funnel.body.data.series.map((series: { key: string }) => series.key),
    ).toEqual(['requested', 'approved', 'fulfilled']);
    expect(
      funnel.body.data.series.map(
        (series: { points: [{ coordinate: unknown }] }) =>
          series.points[0].coordinate,
      ),
    ).toEqual([
      { kind: 'funnel_stage', stageKey: 'requested', order: 0 },
      { kind: 'funnel_stage', stageKey: 'approved', order: 1 },
      { kind: 'funnel_stage', stageKey: 'fulfilled', order: 2 },
    ]);
    for (const response of [completion, funnel]) {
      expectNoInternalLeaks(response.body);
    }
  });

  it('enforces Behavior and Reinforcement chart-specific time compatibility', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    for (const [chartKey, query] of [
      ['behavior.records_by_category', { granularity: 'week' }],
      ['reinforcement.reward_redemption_status', { granularity: 'month' }],
      ['reinforcement.task_completion', { range: '7d' }],
      ['reinforcement.task_completion', { dateFrom: '2026-07-01' }],
    ] as const) {
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/dashboard/analytics/charts/${chartKey}/data`)
        .query(query)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    }
  });

  it('returns day, week, and month Attendance observation buckets from submitted sessions only', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    const path = `${GLOBAL_PREFIX}/dashboard/analytics/charts/attendance.daily_trend/data`;

    const day = await request(app.getHttpServer())
      .get(path)
      .query({
        range: 'custom',
        granularity: 'day',
        dateFrom: '2026-07-01',
        dateTo: '2026-07-10',
      })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const week = await request(app.getHttpServer())
      .get(path)
      .query({
        range: 'custom',
        granularity: 'week',
        dateFrom: '2026-07-01',
        dateTo: '2026-07-10',
      })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const month = await request(app.getHttpServer())
      .get(path)
      .query({
        range: 'custom',
        granularity: 'month',
        dateFrom: '2026-07-01',
        dateTo: '2026-07-31',
      })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const fixed = await request(app.getHttpServer())
      .get(path)
      .query({ range: '90d', granularity: 'month' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(day.body).toMatchObject({
      chartKey: 'attendance.daily_trend',
      status: 'available',
      data: {
        totals: { present: 3, absent: 2, late: 2 },
        summary: { value: 7, label: 'Attendance observations' },
        empty: false,
      },
      meta: {
        pack: 'attendance_v1',
        dataAvailability: 'computed_series',
        computation: 'attendance_observation_daily_trend',
      },
    });
    expect(day.body.data.series[0].points).toHaveLength(10);
    expect(
      week.body.data.series[0].points.map((point: { x: string }) => point.x),
    ).toEqual(['2026-07-01/2026-07-05', '2026-07-06/2026-07-10']);
    expect(month.body.data.series[0].points).toEqual([
      expect.objectContaining({
        x: '2026-07',
        coordinate: { kind: 'calendar_month', month: '2026-07' },
      }),
    ]);
    expect(fixed.body).toMatchObject({
      range: '90d',
      granularity: 'month',
      meta: {
        pack: 'attendance_v1',
        query: {
          appliedFilters: expect.arrayContaining(['range', 'granularity']),
        },
      },
    });
    for (const response of [day, week, month, fixed]) {
      expectNoInternalLeaks(response.body);
    }
  });

  it('returns status distribution and exact absence/late rate semantics', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    const query = {
      range: 'custom',
      granularity: 'day',
      dateFrom: '2026-07-01',
      dateTo: '2026-07-10',
    };
    const responses = await Promise.all(
      [
        'attendance.status_distribution',
        'attendance.absence_rate',
        'attendance.late_rate',
      ].map((chartKey) =>
        request(app.getHttpServer())
          .get(`${GLOBAL_PREFIX}/dashboard/analytics/charts/${chartKey}/data`)
          .query(query)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200),
      ),
    );
    const [distribution, absence, late] = responses.map(
      (response) => response.body,
    );

    expect(distribution.data.totals).toEqual({
      present: 3,
      absent: 2,
      late: 2,
      excused: 1,
    });
    expect(absence.data.totals).toEqual({
      absent: 2,
      considered: 9,
      rate: 22.22,
    });
    expect(late.data.totals).toEqual({
      late: 2,
      considered: 9,
      rate: 22.22,
    });
    expect(absence.data.series[0].points[0].y).toBe(20);
    expect(late.data.series[0].points[0].y).toBe(20);
    for (const body of [distribution, absence, late]) {
      expectNoInternalLeaks(body);
    }
  });

  it('returns overlap-counted excuse categories and rejects unsupported hierarchy/granularity', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    const path = `${GLOBAL_PREFIX}/dashboard/analytics/charts/attendance.excuse_status/data`;
    const response = await request(app.getHttpServer())
      .get(path)
      .query({
        range: 'custom',
        granularity: 'day',
        dateFrom: '2026-07-01',
        dateTo: '2026-07-10',
        academicYearId,
        termId,
      })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body).toMatchObject({
      data: {
        totals: { pending: 1, approved: 1, rejected: 0 },
        summary: { value: 2 },
      },
      meta: {
        pack: 'attendance_v1',
        dataAvailability: 'computed_category',
        query: {
          appliedFilters: expect.arrayContaining([
            'range',
            'dateFrom',
            'dateTo',
            'academicYearId',
            'termId',
          ]),
          notApplicableFilters: ['granularity'],
        },
      },
    });
    expect(response.body.data.series[0].points[0]).toMatchObject({
      coordinate: { kind: 'category' },
    });
    expectNoInternalLeaks(response.body);

    for (const invalidQuery of [
      { gradeId },
      { sectionId },
      { classroomId },
      { granularity: 'week' },
      { granularity: 'month' },
    ]) {
      await request(app.getHttpServer())
        .get(path)
        .query(invalidQuery)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    }
  });

  it('applies the full same-school hierarchy chain and returns a no-data envelope safely', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    const path = `${GLOBAL_PREFIX}/dashboard/analytics/charts/attendance.daily_trend/data`;
    const filtered = await request(app.getHttpServer())
      .get(path)
      .query({
        range: 'custom',
        dateFrom: '2026-07-01',
        dateTo: '2026-07-10',
        academicYearId,
        termId,
        gradeId,
        sectionId,
        classroomId,
      })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const empty = await request(app.getHttpServer())
      .get(path)
      .query({
        range: 'custom',
        dateFrom: '2026-05-01',
        dateTo: '2026-05-07',
      })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(filtered.body.data.totals).toEqual({
      present: 3,
      absent: 2,
      late: 2,
    });
    expect(filtered.body.meta.query.appliedFilters).toEqual(
      expect.arrayContaining([
        'academicYearId',
        'termId',
        'gradeId',
        'sectionId',
        'classroomId',
      ]),
    );
    expect(empty.body).toMatchObject({
      data: { empty: true },
      emptyState: { reason: 'no_data' },
      meta: { pack: 'attendance_v1' },
    });
  });

  it('returns 404 for unknown chart keys and rejects invalid/unsupported query input', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/analytics/charts/unknown.chart/data`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/dashboard/analytics/charts/attendance.pending_sessions/data`,
      )
      .query({ range: 'wallet' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/dashboard/analytics/charts/attendance.pending_sessions/data`,
      )
      .query({ granularity: 'minute' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/dashboard/analytics/charts/attendance.pending_sessions/data`,
      )
      .query({ dateFrom: 'not-a-date' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/dashboard/analytics/charts/attendance.pending_sessions/data`,
      )
      .query({ schoolId: demoSchoolId })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/dashboard/analytics/charts/attendance.pending_sessions/data`,
      )
      .query({ range: '90d' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
  });

  it('rejects missing, reversed, invalid, and excessive custom ranges', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    const path = `${GLOBAL_PREFIX}/dashboard/analytics/charts/attendance.daily_trend/data`;

    for (const query of [
      { range: 'custom', dateFrom: '2026-07-01' },
      {
        range: 'custom',
        dateFrom: '2026-07-03',
        dateTo: '2026-07-01',
      },
      {
        range: 'custom',
        dateFrom: '2026-02-30',
        dateTo: '2026-03-01',
      },
      {
        range: 'custom',
        dateFrom: '2025-01-01',
        dateTo: '2026-01-02',
      },
      {
        range: 'custom',
        granularity: 'month',
        dateFrom: '2026-07-01',
        dateTo: '2026-07-03',
      },
      {
        range: '30d',
        dateFrom: '2026-07-01',
      },
    ]) {
      await request(app.getHttpServer())
        .get(path)
        .query(query)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    }
  });

  it('rejects malformed, cross-school, and inconsistent hierarchy filters safely', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    const path = `${GLOBAL_PREFIX}/dashboard/analytics/charts/attendance.pending_sessions/data`;

    await request(app.getHttpServer())
      .get(path)
      .query({ gradeId: 'not-a-uuid' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);

    const crossSchoolResponse = await request(app.getHttpServer())
      .get(path)
      .query({ academicYearId: crossSchoolAcademicYearId })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);

    const inconsistentResponse = await request(app.getHttpServer())
      .get(path)
      .query({ gradeId, sectionId: otherSectionId })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);

    for (const response of [crossSchoolResponse, inconsistentResponse]) {
      expect(response.body).toMatchObject({
        error: {
          code: 'not_found',
          message: 'Dashboard analytics hierarchy was not found',
          traceId: expect.any(String),
        },
      });
    }
    expect(JSON.stringify(crossSchoolResponse.body)).not.toContain(
      crossSchoolAcademicYearId,
    );
    expect(JSON.stringify(inconsistentResponse.body)).not.toContain(gradeId);
    expect(JSON.stringify(inconsistentResponse.body)).not.toContain(
      otherSectionId,
    );
  });

  it('rejects hierarchy filters for Communication and Settings snapshot charts', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    for (const chartKey of [
      'communication.moderation_queue',
      'settings.email_connection_readiness',
    ]) {
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/dashboard/analytics/charts/${chartKey}/data`)
        .query({ gradeId })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    }
  });

  it('keeps analytics catalog and existing dashboard routes working', async () => {
    const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/analytics/catalog`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.catalog.charts).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              chartKey: 'attendance.pending_sessions',
              status: 'available',
              meta: { dataAvailability: 'computed_snapshot' },
            }),
          ]),
        );
        expectNoInternalLeaks(response.body);
      });

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/analytics/charts`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/modules/academics`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.analytics.availableData).toEqual([]);
        expect(response.body.analytics.charts).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              chartKey: 'academics.teacher_allocation_coverage',
              status: 'available',
            }),
            expect.objectContaining({
              chartKey: 'academics.structure_readiness',
              status: 'planned',
            }),
          ]),
        );
      });

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/modules/grades`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .expect((response) => {
        expect(
          response.body.analytics.availableData.map(
            (item: { chartKey: string }) => item.chartKey,
          ),
        ).toEqual([
          'grades.pending_submission_reviews',
          'grades.pending_answer_reviews',
        ]);
        expect(response.body.analytics.charts).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              chartKey: 'grades.assessment_status_distribution',
              status: 'available',
            }),
            expect.objectContaining({
              chartKey: 'grades.gradebook_completion',
              status: 'available',
            }),
          ]),
        );
      });

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/modules/homework`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.analytics.availableData).toEqual([]);
        expect(response.body.analytics.charts).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              chartKey: 'homework.assignment_status_distribution',
              status: 'available',
            }),
            expect.objectContaining({
              chartKey: 'homework.submission_review_trend',
              status: 'available',
            }),
            expect.objectContaining({
              chartKey: 'homework.grade_sync_coverage',
              status: 'available',
            }),
          ]),
        );
      });

    for (const [moduleKey, chartKeys] of [
      [
        'behavior',
        [
          'behavior.positive_negative_trend',
          'behavior.pending_review',
          'behavior.records_by_category',
        ],
      ],
      [
        'reinforcement',
        [
          'reinforcement.xp_activity_trend',
          'reinforcement.task_completion',
          'reinforcement.reward_redemption_status',
        ],
      ],
    ] as const) {
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/dashboard/modules/${moduleKey}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((response) => {
          expect(response.body.analytics.availableData).toEqual([]);
          expect(response.body.analytics.charts).toEqual(
            expect.arrayContaining(
              chartKeys.map((chartKey) =>
                expect.objectContaining({ chartKey, status: 'available' }),
              ),
            ),
          );
        });
    }

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/alerts`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/activity-feed`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/command-center`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dashboard/widgets`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  });

  async function createAnalyticsHierarchyFixtures() {
    const academicYear = await prisma.academicYear.create({
      data: {
        schoolId: demoSchoolId,
        nameAr: `${marker}-year-ar`,
        nameEn: `${marker}-year-en`,
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        isActive: false,
      },
      select: { id: true },
    });
    const term = await prisma.term.create({
      data: {
        schoolId: demoSchoolId,
        academicYearId: academicYear.id,
        nameAr: `${marker}-term-ar`,
        nameEn: `${marker}-term-en`,
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        isActive: false,
      },
      select: { id: true },
    });
    const stage = await prisma.stage.create({
      data: {
        schoolId: demoSchoolId,
        nameAr: `${marker}-stage-ar`,
        nameEn: `${marker}-stage-en`,
      },
      select: { id: true },
    });
    const [grade, otherGrade] = await Promise.all([
      prisma.grade.create({
        data: {
          schoolId: demoSchoolId,
          stageId: stage.id,
          nameAr: `${marker}-grade-a-ar`,
          nameEn: `${marker}-grade-a-en`,
        },
        select: { id: true },
      }),
      prisma.grade.create({
        data: {
          schoolId: demoSchoolId,
          stageId: stage.id,
          nameAr: `${marker}-grade-b-ar`,
          nameEn: `${marker}-grade-b-en`,
        },
        select: { id: true },
      }),
    ]);
    const [section, otherSection] = await Promise.all([
      prisma.section.create({
        data: {
          schoolId: demoSchoolId,
          gradeId: grade.id,
          nameAr: `${marker}-section-a-ar`,
          nameEn: `${marker}-section-a-en`,
        },
        select: { id: true },
      }),
      prisma.section.create({
        data: {
          schoolId: demoSchoolId,
          gradeId: otherGrade.id,
          nameAr: `${marker}-section-b-ar`,
          nameEn: `${marker}-section-b-en`,
        },
        select: { id: true },
      }),
    ]);
    const [classroom, secondClassroom] = await Promise.all([
      prisma.classroom.create({
        data: {
          schoolId: demoSchoolId,
          sectionId: section.id,
          nameAr: `${marker}-classroom-ar`,
          nameEn: `${marker}-classroom-en`,
        },
        select: { id: true },
      }),
      prisma.classroom.create({
        data: {
          schoolId: demoSchoolId,
          sectionId: section.id,
          nameAr: `${marker}-classroom-2-ar`,
          nameEn: `${marker}-classroom-2-en`,
        },
        select: { id: true },
      }),
    ]);

    const crossSchool = await prisma.school.create({
      data: {
        organizationId: demoOrganizationId,
        slug: `${marker}-cross-school`,
        name: `${marker} cross school`,
      },
      select: { id: true },
    });
    const crossAcademicYear = await prisma.academicYear.create({
      data: {
        schoolId: crossSchool.id,
        nameAr: `${marker}-cross-year-ar`,
        nameEn: `${marker}-cross-year-en`,
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
      },
      select: { id: true },
    });

    return {
      academicYearId: academicYear.id,
      termId: term.id,
      gradeId: grade.id,
      otherGradeId: otherGrade.id,
      sectionId: section.id,
      otherSectionId: otherSection.id,
      classroomId: classroom.id,
      secondClassroomId: secondClassroom.id,
      crossSchoolId: crossSchool.id,
      crossSchoolAcademicYearId: crossAcademicYear.id,
    };
  }

  async function createAttendanceAnalyticsFixtures(): Promise<void> {
    const students = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        prisma.student.create({
          data: {
            schoolId: demoSchoolId,
            organizationId: demoOrganizationId,
            firstName: `Analytics ${index + 1}`,
            lastName: marker,
          },
          select: { id: true },
        }),
      ),
    );
    attendanceStudentIds.push(...students.map((student) => student.id));

    const sessionInput = (
      date: string,
      status: AttendanceSessionStatus,
      periodKey: string,
      deletedAt: Date | null = null,
    ) => ({
      schoolId: demoSchoolId,
      academicYearId,
      termId,
      date: new Date(`${date}T00:00:00.000Z`),
      scopeType: AttendanceScopeType.CLASSROOM,
      scopeKey: classroomId,
      gradeId,
      sectionId,
      classroomId,
      mode:
        periodKey === 'daily' ? AttendanceMode.DAILY : AttendanceMode.PERIOD,
      periodKey,
      status,
      deletedAt,
    });
    const sessions = await Promise.all([
      prisma.attendanceSession.create({
        data: sessionInput(
          '2026-07-01',
          AttendanceSessionStatus.SUBMITTED,
          'daily',
        ),
        select: { id: true },
      }),
      prisma.attendanceSession.create({
        data: sessionInput(
          '2026-07-02',
          AttendanceSessionStatus.SUBMITTED,
          'period-1',
        ),
        select: { id: true },
      }),
      prisma.attendanceSession.create({
        data: sessionInput(
          '2026-07-08',
          AttendanceSessionStatus.SUBMITTED,
          'daily',
        ),
        select: { id: true },
      }),
      prisma.attendanceSession.create({
        data: sessionInput(
          '2026-07-03',
          AttendanceSessionStatus.DRAFT,
          'daily',
        ),
        select: { id: true },
      }),
      prisma.attendanceSession.create({
        data: sessionInput(
          '2026-07-04',
          AttendanceSessionStatus.SUBMITTED,
          'daily',
          new Date('2026-07-05T00:00:00.000Z'),
        ),
        select: { id: true },
      }),
    ]);
    attendanceSessionIds.push(...sessions.map((session) => session.id));

    const statuses = [
      AttendanceStatus.PRESENT,
      AttendanceStatus.ABSENT,
      AttendanceStatus.LATE,
      AttendanceStatus.EXCUSED,
      AttendanceStatus.EARLY_LEAVE,
      AttendanceStatus.UNMARKED,
    ];
    await prisma.attendanceEntry.createMany({
      data: [
        ...statuses.map((status, index) => ({
          schoolId: demoSchoolId,
          sessionId: sessions[0].id,
          studentId: students[index].id,
          status,
        })),
        {
          schoolId: demoSchoolId,
          sessionId: sessions[1].id,
          studentId: students[0].id,
          status: AttendanceStatus.PRESENT,
        },
        {
          schoolId: demoSchoolId,
          sessionId: sessions[1].id,
          studentId: students[1].id,
          status: AttendanceStatus.PRESENT,
        },
        {
          schoolId: demoSchoolId,
          sessionId: sessions[1].id,
          studentId: students[2].id,
          status: AttendanceStatus.LATE,
        },
        {
          schoolId: demoSchoolId,
          sessionId: sessions[2].id,
          studentId: students[0].id,
          status: AttendanceStatus.ABSENT,
        },
        {
          schoolId: demoSchoolId,
          sessionId: sessions[3].id,
          studentId: students[0].id,
          status: AttendanceStatus.ABSENT,
        },
        {
          schoolId: demoSchoolId,
          sessionId: sessions[4].id,
          studentId: students[0].id,
          status: AttendanceStatus.ABSENT,
        },
      ],
    });

    const excuses = await Promise.all([
      prisma.attendanceExcuseRequest.create({
        data: {
          schoolId: demoSchoolId,
          academicYearId,
          termId,
          studentId: students[0].id,
          type: AttendanceExcuseType.ABSENCE,
          status: AttendanceExcuseStatus.PENDING,
          dateFrom: new Date('2026-06-30T00:00:00.000Z'),
          dateTo: new Date('2026-07-02T00:00:00.000Z'),
        },
        select: { id: true },
      }),
      prisma.attendanceExcuseRequest.create({
        data: {
          schoolId: demoSchoolId,
          academicYearId,
          termId,
          studentId: students[1].id,
          type: AttendanceExcuseType.LATE,
          status: AttendanceExcuseStatus.APPROVED,
          dateFrom: new Date('2026-07-08T00:00:00.000Z'),
          dateTo: new Date('2026-07-12T00:00:00.000Z'),
        },
        select: { id: true },
      }),
      prisma.attendanceExcuseRequest.create({
        data: {
          schoolId: demoSchoolId,
          academicYearId,
          termId,
          studentId: students[2].id,
          type: AttendanceExcuseType.ABSENCE,
          status: AttendanceExcuseStatus.REJECTED,
          dateFrom: new Date('2026-06-20T00:00:00.000Z'),
          dateTo: new Date('2026-06-30T00:00:00.000Z'),
        },
        select: { id: true },
      }),
      prisma.attendanceExcuseRequest.create({
        data: {
          schoolId: demoSchoolId,
          academicYearId,
          termId,
          studentId: students[3].id,
          type: AttendanceExcuseType.ABSENCE,
          status: AttendanceExcuseStatus.PENDING,
          dateFrom: new Date('2026-07-01T00:00:00.000Z'),
          dateTo: new Date('2026-07-01T00:00:00.000Z'),
          deletedAt: new Date('2026-07-02T00:00:00.000Z'),
        },
        select: { id: true },
      }),
    ]);
    attendanceExcuseIds.push(...excuses.map((excuse) => excuse.id));
  }

  async function createAdmissionsStudentsAnalyticsFixtures(): Promise<void> {
    const admin = await prisma.user.findUnique({
      where: { email: DEMO_ADMIN_EMAIL },
      select: { id: true },
    });
    if (!admin) throw new Error('Demo admin not found for analytics fixtures.');

    const applicationInputs = [
      {
        status: AdmissionApplicationStatus.DOCUMENTS_PENDING,
        submittedAt: null,
      },
      {
        status: AdmissionApplicationStatus.SUBMITTED,
        submittedAt: new Date('2026-07-01T20:30:00.000Z'),
      },
      {
        status: AdmissionApplicationStatus.UNDER_REVIEW,
        submittedAt: new Date('2026-07-02T20:30:00.000Z'),
      },
      {
        status: AdmissionApplicationStatus.ACCEPTED,
        submittedAt: new Date('2026-07-03T20:30:00.000Z'),
      },
      {
        status: AdmissionApplicationStatus.REJECTED,
        submittedAt: new Date('2026-07-04T20:30:00.000Z'),
      },
      {
        status: AdmissionApplicationStatus.WAITLISTED,
        submittedAt: new Date('2026-07-05T20:30:00.000Z'),
      },
    ];
    const applications = await Promise.all(
      applicationInputs.map((application, index) =>
        prisma.application.create({
          data: {
            schoolId: demoSchoolId,
            organizationId: demoOrganizationId,
            studentName: `${marker} Application ${index + 1}`,
            requestedAcademicYearId: academicYearId,
            requestedGradeId: gradeId,
            source: AdmissionApplicationSource.IN_APP,
            ...application,
          },
          select: { id: true },
        }),
      ),
    );
    admissionsApplicationIds.push(...applications.map(({ id }) => id));

    const decision = await prisma.admissionDecision.create({
      data: {
        schoolId: demoSchoolId,
        applicationId: applications[3].id,
        decision: AdmissionDecisionType.ACCEPT,
        decidedByUserId: admin.id,
        decidedAt: new Date('2026-07-08T22:30:00.000Z'),
      },
      select: { id: true },
    });
    admissionsDecisionIds.push(decision.id);

    const deletedApplication = await prisma.application.create({
      data: {
        schoolId: demoSchoolId,
        organizationId: demoOrganizationId,
        studentName: `${marker} Deleted Application`,
        requestedAcademicYearId: academicYearId,
        requestedGradeId: gradeId,
        source: AdmissionApplicationSource.IN_APP,
        status: AdmissionApplicationStatus.SUBMITTED,
        submittedAt: new Date('2026-07-06T12:00:00.000Z'),
        deletedAt: new Date('2026-07-07T00:00:00.000Z'),
      },
      select: { id: true },
    });
    admissionsApplicationIds.push(deletedApplication.id);

    const enrollments = await Promise.all([
      prisma.enrollment.create({
        data: enrollmentInput(
          attendanceStudentIds[0],
          StudentEnrollmentStatus.ACTIVE,
          '2026-07-01T00:00:00.000Z',
          null,
        ),
        select: { id: true },
      }),
      prisma.enrollment.create({
        data: enrollmentInput(
          attendanceStudentIds[1],
          StudentEnrollmentStatus.WITHDRAWN,
          '2026-06-01T00:00:00.000Z',
          '2026-07-05T00:00:00.000Z',
        ),
        select: { id: true },
      }),
      prisma.enrollment.create({
        data: enrollmentInput(
          attendanceStudentIds[2],
          StudentEnrollmentStatus.COMPLETED,
          '2026-06-01T00:00:00.000Z',
          '2026-07-07T00:00:00.000Z',
        ),
        select: { id: true },
      }),
      prisma.enrollment.create({
        data: enrollmentInput(
          attendanceStudentIds[3],
          StudentEnrollmentStatus.ACTIVE,
          '2026-07-10T00:00:00.000Z',
          null,
        ),
        select: { id: true },
      }),
      prisma.enrollment.create({
        data: {
          ...enrollmentInput(
            attendanceStudentIds[4],
            StudentEnrollmentStatus.ACTIVE,
            '2026-07-01T00:00:00.000Z',
            null,
          ),
          deletedAt: new Date('2026-07-02T00:00:00.000Z'),
        },
        select: { id: true },
      }),
    ]);
    analyticsEnrollmentIds.push(...enrollments.map(({ id }) => id));

    const guardians = await Promise.all([
      prisma.guardian.create({
        data: {
          schoolId: demoSchoolId,
          organizationId: demoOrganizationId,
          firstName: marker,
          lastName: 'Covered Guardian',
          phone: `+2010${suffix.padEnd(8, '0').slice(0, 8)}`,
          relation: 'guardian',
        },
        select: { id: true },
      }),
      prisma.guardian.create({
        data: {
          schoolId: demoSchoolId,
          organizationId: demoOrganizationId,
          firstName: marker,
          lastName: 'Deleted Guardian',
          phone: `+2011${suffix.padEnd(8, '1').slice(0, 8)}`,
          relation: 'guardian',
          deletedAt: new Date('2026-07-01T00:00:00.000Z'),
        },
        select: { id: true },
      }),
    ]);
    analyticsGuardianIds.push(...guardians.map(({ id }) => id));

    const links = await Promise.all([
      prisma.studentGuardian.create({
        data: {
          schoolId: demoSchoolId,
          studentId: attendanceStudentIds[0],
          guardianId: guardians[0].id,
        },
        select: { id: true },
      }),
      prisma.studentGuardian.create({
        data: {
          schoolId: demoSchoolId,
          studentId: attendanceStudentIds[3],
          guardianId: guardians[1].id,
        },
        select: { id: true },
      }),
    ]);
    analyticsStudentGuardianIds.push(...links.map(({ id }) => id));
  }

  async function createAcademicsAnalyticsFixtures(): Promise<void> {
    const admin = await prisma.user.findUnique({
      where: { email: DEMO_ADMIN_EMAIL },
      select: { id: true },
    });
    if (!admin) throw new Error('Demo admin not found for Academics fixtures.');

    const subjects = await Promise.all(
      Array.from({ length: 3 }, (_, index) =>
        prisma.subject.create({
          data: {
            schoolId: demoSchoolId,
            nameAr: `${marker}-subject-${index}-ar`,
            nameEn: `${marker}-subject-${index}-en`,
            code: `${marker}-subject-${index}`,
          },
          select: { id: true },
        }),
      ),
    );
    academicsSubjectIds.push(...subjects.map(({ id }) => id));

    const subjectAllocation = await prisma.subjectAllocation.create({
      data: {
        schoolId: demoSchoolId,
        academicYearId,
        termId,
        gradeId,
        subjectId: subjects[0].id,
        weeklyHours: 0,
      },
      select: { id: true },
    });
    academicsSubjectAllocationIds.push(subjectAllocation.id);

    const teacherAllocations = await Promise.all(
      subjects.map((subject) =>
        prisma.teacherSubjectAllocation.create({
          data: {
            schoolId: demoSchoolId,
            teacherUserId: admin.id,
            subjectId: subject.id,
            classroomId,
            termId,
          },
          select: { id: true },
        }),
      ),
    );
    academicsTeacherAllocationIds.push(
      ...teacherAllocations.map(({ id }) => id),
    );

    const timetableConfigs = await Promise.all(
      [
        TimetableConfigStatus.ACTIVE,
        TimetableConfigStatus.DRAFT,
        TimetableConfigStatus.ARCHIVED,
      ].map((status, index) =>
        prisma.timetableConfig.create({
          data: {
            schoolId: demoSchoolId,
            academicYearId,
            termId,
            name: `${marker}-timetable-${index}`,
            activeDays: [1, 2, 3, 4, 5],
            scopeType: TimetableScopeType.TERM,
            scopeKey: `${marker}-scope-${index}`,
            status,
          },
          select: { id: true },
        }),
      ),
    );
    academicsTimetableConfigIds.push(...timetableConfigs.map(({ id }) => id));

    const curricula = await Promise.all(
      [
        CurriculumStatus.ACTIVE,
        CurriculumStatus.DRAFT,
        CurriculumStatus.ARCHIVED,
      ].map((status, index) =>
        prisma.curriculum.create({
          data: {
            schoolId: demoSchoolId,
            academicYearId,
            termId,
            gradeId,
            subjectId: subjects[index].id,
            title: `${marker}-curriculum-${index}`,
            status,
            createdByUserId: admin.id,
          },
          select: { id: true },
        }),
      ),
    );
    academicsCurriculumIds.push(...curricula.map(({ id }) => id));

    const lessonPlans = await Promise.all(
      [
        LessonPlanStatus.ACTIVE,
        LessonPlanStatus.DRAFT,
        LessonPlanStatus.ARCHIVED,
      ].map((status, index) =>
        prisma.lessonPlan.create({
          data: {
            schoolId: demoSchoolId,
            academicYearId,
            termId,
            teacherSubjectAllocationId: teacherAllocations[index].id,
            teacherUserId: admin.id,
            classroomId,
            subjectId: subjects[index].id,
            curriculumId: curricula[index].id,
            title: `${marker}-lesson-plan-${index}`,
            status,
            weekStartDate: new Date(
              `2026-07-${String(6 + index * 7).padStart(2, '0')}T00:00:00.000Z`,
            ),
            weekEndDate: new Date(
              `2026-07-${String(12 + index * 7).padStart(2, '0')}T00:00:00.000Z`,
            ),
            createdByUserId: admin.id,
          },
          select: { id: true },
        }),
      ),
    );
    academicsLessonPlanIds.push(...lessonPlans.map(({ id }) => id));
  }

  async function createGradesHomeworkAnalyticsFixtures(): Promise<void> {
    const admin = await prisma.user.findUnique({
      where: { email: DEMO_ADMIN_EMAIL },
      select: { id: true },
    });
    if (!admin) throw new Error('Demo admin not found for Grades fixtures.');

    const assessmentInputs = [
      { approvalStatus: GradeAssessmentApprovalStatus.DRAFT, lockedAt: null },
      {
        approvalStatus: GradeAssessmentApprovalStatus.PUBLISHED,
        lockedAt: null,
      },
      {
        approvalStatus: GradeAssessmentApprovalStatus.APPROVED,
        lockedAt: null,
      },
      {
        approvalStatus: GradeAssessmentApprovalStatus.APPROVED,
        lockedAt: new Date('2026-07-05T12:00:00.000Z'),
      },
    ];
    const assessments = await Promise.all(
      assessmentInputs.map((assessment, index) =>
        prisma.gradeAssessment.create({
          data: {
            schoolId: demoSchoolId,
            academicYearId,
            termId,
            subjectId: academicsSubjectIds[0],
            scopeType: GradeScopeType.CLASSROOM,
            scopeKey: classroomId,
            classroomId,
            titleEn: `${marker}-assessment-${index}`,
            type: GradeAssessmentType.QUIZ,
            deliveryMode: GradeAssessmentDeliveryMode.SCORE_ONLY,
            date: new Date(`2026-07-0${index + 1}T00:00:00.000Z`),
            weight: 10,
            maxScore: 20,
            createdById: admin.id,
            ...assessment,
          },
          select: { id: true },
        }),
      ),
    );
    gradesAssessmentIds.push(...assessments.map(({ id }) => id));

    const items = await Promise.all([
      prisma.gradeItem.create({
        data: {
          schoolId: demoSchoolId,
          termId,
          assessmentId: assessments[1].id,
          studentId: attendanceStudentIds[0],
          enrollmentId: analyticsEnrollmentIds[0],
          score: 18,
          status: GradeItemStatus.ENTERED,
        },
        select: { id: true },
      }),
      prisma.gradeItem.create({
        data: {
          schoolId: demoSchoolId,
          termId,
          assessmentId: assessments[2].id,
          studentId: attendanceStudentIds[0],
          enrollmentId: analyticsEnrollmentIds[0],
          status: GradeItemStatus.ABSENT,
        },
        select: { id: true },
      }),
    ]);
    gradesItemIds.push(...items.map(({ id }) => id));

    const statuses = [
      HomeworkAssignmentStatus.DRAFT,
      HomeworkAssignmentStatus.PUBLISHED,
      HomeworkAssignmentStatus.CLOSED,
      HomeworkAssignmentStatus.CANCELLED,
      HomeworkAssignmentStatus.ARCHIVED,
    ];
    const assignments = await Promise.all(
      statuses.map((status, index) =>
        prisma.homeworkAssignment.create({
          data: {
            schoolId: demoSchoolId,
            academicYearId,
            termId,
            classroomId,
            subjectId: academicsSubjectIds[0],
            teacherUserId: admin.id,
            teacherSubjectAllocationId: academicsTeacherAllocationIds[0],
            title: `${marker}-homework-${index}`,
            status,
            dueAt: new Date('2026-07-20T12:00:00.000Z'),
            isGraded: index < 3,
            gradeAssessmentId: index === 1 ? assessments[2].id : null,
            createdByUserId: admin.id,
          },
          select: { id: true },
        }),
      ),
    );
    homeworkAssignmentIds.push(...assignments.map(({ id }) => id));

    const targets = await Promise.all(
      [attendanceStudentIds[0], attendanceStudentIds[3]].map(
        (studentId, index) =>
          prisma.homeworkTarget.create({
            data: {
              schoolId: demoSchoolId,
              homeworkAssignmentId: assignments[1].id,
              studentId,
              enrollmentId: analyticsEnrollmentIds[index === 0 ? 0 : 3],
            },
            select: { id: true },
          }),
      ),
    );
    homeworkTargetIds.push(...targets.map(({ id }) => id));

    const submissions = await Promise.all([
      prisma.homeworkSubmission.create({
        data: {
          schoolId: demoSchoolId,
          homeworkAssignmentId: assignments[1].id,
          homeworkTargetId: targets[0].id,
          studentId: attendanceStudentIds[0],
          enrollmentId: analyticsEnrollmentIds[0],
          status: HomeworkSubmissionStatus.REVIEWED,
          submittedAt: new Date('2026-07-02T12:00:00.000Z'),
          reviewedAt: new Date('2026-07-08T12:00:00.000Z'),
          reviewedByUserId: admin.id,
        },
        select: { id: true },
      }),
      prisma.homeworkSubmission.create({
        data: {
          schoolId: demoSchoolId,
          homeworkAssignmentId: assignments[1].id,
          homeworkTargetId: targets[1].id,
          studentId: attendanceStudentIds[3],
          enrollmentId: analyticsEnrollmentIds[3],
          status: HomeworkSubmissionStatus.SUBMITTED,
          submittedAt: new Date('2026-07-03T12:00:00.000Z'),
        },
        select: { id: true },
      }),
    ]);
    homeworkSubmissionIds.push(...submissions.map(({ id }) => id));
  }

  async function createBehaviorReinforcementAnalyticsFixtures(): Promise<void> {
    const category = await prisma.behaviorCategory.create({
      data: {
        schoolId: demoSchoolId,
        code: `${marker}-respect`,
        nameEn: 'Respect',
        type: BehaviorRecordType.POSITIVE,
      },
      select: { id: true },
    });
    behaviorCategoryIds.push(category.id);

    const behaviorRecords = await Promise.all(
      [
        {
          type: BehaviorRecordType.POSITIVE,
          status: BehaviorRecordStatus.APPROVED,
          categoryId: category.id,
          occurredAt: new Date('2026-07-02T22:30:00.000Z'),
          deletedAt: null,
        },
        {
          type: BehaviorRecordType.NEGATIVE,
          status: BehaviorRecordStatus.APPROVED,
          categoryId: null,
          occurredAt: new Date('2026-07-08T10:00:00.000Z'),
          deletedAt: null,
        },
        {
          type: BehaviorRecordType.NEGATIVE,
          status: BehaviorRecordStatus.SUBMITTED,
          categoryId: null,
          occurredAt: new Date('2026-07-04T10:00:00.000Z'),
          deletedAt: null,
        },
        {
          type: BehaviorRecordType.POSITIVE,
          status: BehaviorRecordStatus.REJECTED,
          categoryId: category.id,
          occurredAt: new Date('2026-07-05T10:00:00.000Z'),
          deletedAt: null,
        },
        {
          type: BehaviorRecordType.POSITIVE,
          status: BehaviorRecordStatus.APPROVED,
          categoryId: category.id,
          occurredAt: new Date('2026-07-06T10:00:00.000Z'),
          deletedAt: new Date('2026-07-07T00:00:00.000Z'),
        },
      ].map((record, index) =>
        prisma.behaviorRecord.create({
          data: {
            schoolId: demoSchoolId,
            academicYearId,
            termId,
            studentId: attendanceStudentIds[0],
            enrollmentId: analyticsEnrollmentIds[0],
            titleEn: `${marker}-behavior-${index}`,
            severity: 'LOW',
            points: record.type === BehaviorRecordType.POSITIVE ? 2 : -2,
            ...record,
          },
          select: { id: true },
        }),
      ),
    );
    behaviorRecordIds.push(...behaviorRecords.map(({ id }) => id));

    const now = Date.now();
    const taskInputs = [
      {
        taskStatus: ReinforcementTaskStatus.COMPLETED,
        assignmentStatus: ReinforcementTaskStatus.COMPLETED,
        dueDate: new Date(now - 24 * 60 * 60 * 1000),
      },
      {
        taskStatus: ReinforcementTaskStatus.IN_PROGRESS,
        assignmentStatus: ReinforcementTaskStatus.IN_PROGRESS,
        dueDate: new Date(now + 24 * 60 * 60 * 1000),
      },
      {
        taskStatus: ReinforcementTaskStatus.UNDER_REVIEW,
        assignmentStatus: ReinforcementTaskStatus.UNDER_REVIEW,
        dueDate: new Date(now - 24 * 60 * 60 * 1000),
      },
      {
        taskStatus: ReinforcementTaskStatus.CANCELLED,
        assignmentStatus: ReinforcementTaskStatus.NOT_COMPLETED,
        dueDate: new Date(now + 24 * 60 * 60 * 1000),
      },
      {
        taskStatus: ReinforcementTaskStatus.NOT_COMPLETED,
        assignmentStatus: ReinforcementTaskStatus.CANCELLED,
        dueDate: new Date(now + 24 * 60 * 60 * 1000),
      },
    ];
    for (const [index, input] of taskInputs.entries()) {
      const task = await prisma.reinforcementTask.create({
        data: {
          schoolId: demoSchoolId,
          academicYearId,
          termId,
          titleEn: `${marker}-task-${index}`,
          source: ReinforcementSource.TEACHER,
          status: input.taskStatus,
          dueDate: input.dueDate,
        },
        select: { id: true },
      });
      reinforcementTaskIds.push(task.id);
      const assignment = await prisma.reinforcementAssignment.create({
        data: {
          schoolId: demoSchoolId,
          taskId: task.id,
          academicYearId,
          termId,
          studentId: attendanceStudentIds[0],
          enrollmentId: analyticsEnrollmentIds[0],
          status: input.assignmentStatus,
          completedAt:
            input.assignmentStatus === ReinforcementTaskStatus.COMPLETED
              ? new Date(now - 12 * 60 * 60 * 1000)
              : null,
        },
        select: { id: true },
      });
      reinforcementAssignmentIds.push(assignment.id);
    }

    const xpEntries = await Promise.all(
      [
        {
          amount: 10,
          sourceType: XpSourceType.REINFORCEMENT_TASK,
          occurredAt: new Date('2026-07-02T22:30:00.000Z'),
        },
        {
          amount: -4,
          sourceType: XpSourceType.SYSTEM,
          occurredAt: new Date('2026-07-08T10:00:00.000Z'),
        },
      ].map((entry, index) =>
        prisma.xpLedger.create({
          data: {
            schoolId: demoSchoolId,
            academicYearId,
            termId,
            studentId: attendanceStudentIds[0],
            enrollmentId: analyticsEnrollmentIds[0],
            sourceId: `${marker}-xp-${index}`,
            ...entry,
          },
          select: { id: true },
        }),
      ),
    );
    xpLedgerIds.push(...xpEntries.map(({ id }) => id));

    const redemptionStatuses = [
      RewardRedemptionStatus.REQUESTED,
      RewardRedemptionStatus.APPROVED,
      RewardRedemptionStatus.REJECTED,
      RewardRedemptionStatus.FULFILLED,
      RewardRedemptionStatus.CANCELLED,
    ];
    for (const [index, status] of redemptionStatuses.entries()) {
      const reward = await prisma.rewardCatalogItem.create({
        data: {
          schoolId: demoSchoolId,
          academicYearId,
          termId,
          titleEn: `${marker}-archived-reward-${index}`,
          status: RewardCatalogItemStatus.ARCHIVED,
          archivedAt: new Date('2026-07-01T00:00:00.000Z'),
          deletedAt: new Date('2026-07-01T00:00:00.000Z'),
        },
        select: { id: true },
      });
      rewardCatalogItemIds.push(reward.id);
      const redemption = await prisma.rewardRedemption.create({
        data: {
          schoolId: demoSchoolId,
          catalogItemId: reward.id,
          studentId: attendanceStudentIds[0],
          enrollmentId: analyticsEnrollmentIds[0],
          academicYearId,
          termId,
          status,
          requestedAt: new Date(
            `2026-07-${String(index + 2).padStart(2, '0')}T12:00:00.000Z`,
          ),
          reviewedAt:
            status === RewardRedemptionStatus.APPROVED ||
            status === RewardRedemptionStatus.REJECTED ||
            status === RewardRedemptionStatus.FULFILLED
              ? new Date('2026-07-08T12:00:00.000Z')
              : null,
          fulfilledAt:
            status === RewardRedemptionStatus.FULFILLED
              ? new Date('2026-07-09T12:00:00.000Z')
              : null,
        },
        select: { id: true },
      });
      rewardRedemptionIds.push(redemption.id);
    }
  }

  function enrollmentInput(
    studentId: string,
    status: StudentEnrollmentStatus,
    enrolledAt: string,
    endedAt: string | null,
  ) {
    return {
      schoolId: demoSchoolId,
      studentId,
      academicYearId,
      termId,
      classroomId,
      status,
      enrolledAt: new Date(enrolledAt),
      endedAt: endedAt ? new Date(endedAt) : null,
    };
  }

  async function cleanupAnalyticsHierarchyFixtures(): Promise<void> {
    if (rewardRedemptionIds.length > 0) {
      await prisma.rewardRedemption.deleteMany({
        where: { id: { in: rewardRedemptionIds } },
      });
    }
    if (rewardCatalogItemIds.length > 0) {
      await prisma.rewardCatalogItem.deleteMany({
        where: { id: { in: rewardCatalogItemIds } },
      });
    }
    if (xpLedgerIds.length > 0) {
      await prisma.xpLedger.deleteMany({
        where: { id: { in: xpLedgerIds } },
      });
    }
    if (reinforcementAssignmentIds.length > 0) {
      await prisma.reinforcementAssignment.deleteMany({
        where: { id: { in: reinforcementAssignmentIds } },
      });
    }
    if (reinforcementTaskIds.length > 0) {
      await prisma.reinforcementTask.deleteMany({
        where: { id: { in: reinforcementTaskIds } },
      });
    }
    if (behaviorRecordIds.length > 0) {
      await prisma.behaviorRecord.deleteMany({
        where: { id: { in: behaviorRecordIds } },
      });
    }
    if (behaviorCategoryIds.length > 0) {
      await prisma.behaviorCategory.deleteMany({
        where: { id: { in: behaviorCategoryIds } },
      });
    }
    if (homeworkSubmissionIds.length > 0) {
      await prisma.homeworkSubmission.deleteMany({
        where: { id: { in: homeworkSubmissionIds } },
      });
    }
    if (homeworkTargetIds.length > 0) {
      await prisma.homeworkTarget.deleteMany({
        where: { id: { in: homeworkTargetIds } },
      });
    }
    if (homeworkAssignmentIds.length > 0) {
      await prisma.homeworkAssignment.deleteMany({
        where: { id: { in: homeworkAssignmentIds } },
      });
    }
    if (gradesItemIds.length > 0) {
      await prisma.gradeItem.deleteMany({
        where: { id: { in: gradesItemIds } },
      });
    }
    if (gradesAssessmentIds.length > 0) {
      await prisma.gradeAssessment.deleteMany({
        where: { id: { in: gradesAssessmentIds } },
      });
    }
    if (academicsLessonPlanIds.length > 0) {
      await prisma.lessonPlan.deleteMany({
        where: { id: { in: academicsLessonPlanIds } },
      });
    }
    if (academicsCurriculumIds.length > 0) {
      await prisma.curriculum.deleteMany({
        where: { id: { in: academicsCurriculumIds } },
      });
    }
    if (academicsTimetableConfigIds.length > 0) {
      await prisma.timetableConfig.deleteMany({
        where: { id: { in: academicsTimetableConfigIds } },
      });
    }
    if (academicsTeacherAllocationIds.length > 0) {
      await prisma.teacherSubjectAllocation.deleteMany({
        where: { id: { in: academicsTeacherAllocationIds } },
      });
    }
    if (academicsSubjectAllocationIds.length > 0) {
      await prisma.subjectAllocation.deleteMany({
        where: { id: { in: academicsSubjectAllocationIds } },
      });
    }
    if (academicsSubjectIds.length > 0) {
      await prisma.subject.deleteMany({
        where: { id: { in: academicsSubjectIds } },
      });
    }
    if (analyticsStudentGuardianIds.length > 0) {
      await prisma.studentGuardian.deleteMany({
        where: { id: { in: analyticsStudentGuardianIds } },
      });
    }
    if (analyticsGuardianIds.length > 0) {
      await prisma.guardian.deleteMany({
        where: { id: { in: analyticsGuardianIds } },
      });
    }
    if (analyticsEnrollmentIds.length > 0) {
      await prisma.enrollment.deleteMany({
        where: { id: { in: analyticsEnrollmentIds } },
      });
    }
    if (admissionsDecisionIds.length > 0) {
      await prisma.admissionDecision.deleteMany({
        where: { id: { in: admissionsDecisionIds } },
      });
    }
    if (admissionsApplicationIds.length > 0) {
      await prisma.application.deleteMany({
        where: { id: { in: admissionsApplicationIds } },
      });
    }
    if (attendanceExcuseIds.length > 0) {
      await prisma.attendanceExcuseRequest.deleteMany({
        where: { id: { in: attendanceExcuseIds } },
      });
    }
    if (attendanceSessionIds.length > 0) {
      await prisma.attendanceEntry.deleteMany({
        where: { sessionId: { in: attendanceSessionIds } },
      });
      await prisma.attendanceSession.deleteMany({
        where: { id: { in: attendanceSessionIds } },
      });
    }
    if (attendanceStudentIds.length > 0) {
      await prisma.student.deleteMany({
        where: { id: { in: attendanceStudentIds } },
      });
    }
    await prisma.classroom.deleteMany({
      where: {
        schoolId: { in: [demoSchoolId, crossSchoolId] },
        nameEn: { startsWith: marker },
      },
    });
    await prisma.section.deleteMany({
      where: {
        schoolId: { in: [demoSchoolId, crossSchoolId] },
        nameEn: { startsWith: marker },
      },
    });
    await prisma.grade.deleteMany({
      where: {
        schoolId: { in: [demoSchoolId, crossSchoolId] },
        nameEn: { startsWith: marker },
      },
    });
    await prisma.stage.deleteMany({
      where: {
        schoolId: { in: [demoSchoolId, crossSchoolId] },
        nameEn: { startsWith: marker },
      },
    });
    await prisma.term.deleteMany({
      where: {
        schoolId: { in: [demoSchoolId, crossSchoolId] },
        nameEn: { startsWith: marker },
      },
    });
    await prisma.academicYear.deleteMany({
      where: {
        schoolId: { in: [demoSchoolId, crossSchoolId] },
        nameEn: { startsWith: marker },
      },
    });
    if (crossSchoolId) {
      await prisma.school.deleteMany({ where: { id: crossSchoolId } });
    }
  }

  async function ensureDashboardPermissions(): Promise<Record<string, string>> {
    const definitions = [
      {
        key: 'analytics',
        code: 'dashboard.analytics.view',
        resource: 'analytics',
        description: 'View internal Dashboard Analytics catalog definitions',
      },
      {
        key: 'summary',
        code: 'dashboard.summary.view',
        resource: 'summary',
        description: 'View dashboard summary KPIs',
      },
      {
        key: 'alerts',
        code: 'dashboard.alerts.view',
        resource: 'alerts',
        description: 'View computed dashboard operational alerts',
      },
      {
        key: 'activityFeed',
        code: 'dashboard.activity_feed.view',
        resource: 'activity_feed',
        description: 'View read-only dashboard operational activity feed',
      },
      {
        key: 'commandCenter',
        code: 'dashboard.command_center.view',
        resource: 'command_center',
        description: 'View Dashboard Command Center V2 overview',
      },
      {
        key: 'widgets',
        code: 'dashboard.widgets.view',
        resource: 'widgets',
        description: 'View read-only dashboard widgets registry',
      },
    ] as const;
    const permissionIds: Record<string, string> = {};

    for (const definition of definitions) {
      const permission = await prisma.permission.upsert({
        where: { code: definition.code },
        update: {
          module: 'dashboard',
          resource: definition.resource,
          action: 'view',
          description: definition.description,
        },
        create: {
          code: definition.code,
          module: 'dashboard',
          resource: definition.resource,
          action: 'view',
          description: definition.description,
        },
        select: { id: true },
      });
      permissionIds[definition.key] = permission.id;
    }

    return permissionIds;
  }

  async function ensureDemoAdminHasDashboardPermissions(
    permissionIds: string[],
  ): Promise<void> {
    const admin = await prisma.user.findUnique({
      where: { email: DEMO_ADMIN_EMAIL },
      select: { id: true },
    });
    if (!admin) {
      throw new Error('Demo admin not found - run `npm run seed` first.');
    }

    const membership = await prisma.membership.findFirst({
      where: {
        userId: admin.id,
        schoolId: demoSchoolId,
        status: MembershipStatus.ACTIVE,
        deletedAt: null,
      },
      orderBy: { startedAt: 'desc' },
      select: { roleId: true },
    });
    if (!membership) {
      throw new Error('Demo admin school membership missing.');
    }

    await prisma.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({
        roleId: membership.roleId,
        permissionId,
      })),
      skipDuplicates: true,
    });
  }

  async function createPrincipal(input: {
    label: string;
    organizationId: string;
    schoolId: string;
    permissionIds: string[];
  }): Promise<CreatedPrincipal> {
    const role = await prisma.role.create({
      data: {
        schoolId: input.schoolId,
        key: `${marker}-${input.label}-role`,
        name: `Dashboard Analytics Data ${input.label} role`,
        description: `Dashboard analytics data ${input.label} role`,
        isSystem: false,
      },
      select: { id: true },
    });
    createdRoleIds.push(role.id);

    if (input.permissionIds.length > 0) {
      await prisma.rolePermission.createMany({
        data: input.permissionIds.map((permissionId) => ({
          roleId: role.id,
          permissionId,
        })),
        skipDuplicates: true,
      });
    }

    const email = `${marker}-${input.label}@example.test`;
    const user = await prisma.user.create({
      data: {
        email,
        firstName: 'Dashboard',
        lastName: input.label,
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
        passwordHash: await argon2.hash(PASSWORD, ARGON2_OPTIONS),
      },
      select: { id: true },
    });
    createdUserIds.push(user.id);

    await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId: input.organizationId,
        schoolId: input.schoolId,
        roleId: role.id,
        userType: UserType.SCHOOL_USER,
        status: MembershipStatus.ACTIVE,
      },
    });

    return {
      email,
      userId: user.id,
      roleId: role.id,
      organizationId: input.organizationId,
      schoolId: input.schoolId,
    };
  }

  async function login(email: string, password: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password })
      .expect(200);

    return response.body.accessToken;
  }

  function listRegisteredRoutes(): string[] {
    const expressApp = app.getHttpAdapter().getInstance() as {
      _router?: { stack?: ExpressLayer[] };
      router?: { stack?: ExpressLayer[] };
    };
    const stack = expressApp._router?.stack ?? expressApp.router?.stack ?? [];
    const routes: string[] = [];

    collectRoutes(stack, routes);

    return routes.sort();
  }

  function collectRoutes(layers: ExpressLayer[], routes: string[]): void {
    for (const layer of layers) {
      if (layer.route?.path && layer.route.methods) {
        const paths = Array.isArray(layer.route.path)
          ? layer.route.path
          : [layer.route.path];
        const methods = Object.entries(layer.route.methods)
          .filter(([, enabled]) => enabled)
          .map(([method]) => method.toUpperCase());

        for (const routePath of paths) {
          for (const method of methods) {
            routes.push(`${method} ${routePath}`);
          }
        }
      }

      if (layer.handle?.stack) {
        collectRoutes(layer.handle.stack, routes);
      }
    }
  }

  async function cleanupE2eData(): Promise<void> {
    if (createdUserIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { actorId: { in: createdUserIds } },
      });
      await prisma.session.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.membership.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
    }
    if (createdRoleIds.length > 0) {
      await prisma.rolePermission.deleteMany({
        where: { roleId: { in: createdRoleIds } },
      });
      await prisma.role.deleteMany({
        where: { id: { in: createdRoleIds } },
      });
    }
  }
});

function expectNoInternalLeaks(body: unknown): void {
  const serialized = JSON.stringify(body);
  for (const forbidden of [
    'schoolId',
    'organizationId',
    'membershipId',
    'roleId',
    'passwordHash',
    'deletedAt',
    'actorId',
    'userId',
    'resourceId',
    'bucket',
    'objectKey',
    'platform_admin',
    'platform-admin',
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
  expect(serialized).not.toMatch(/(^|[^A-Za-z0-9])raw([^A-Za-z0-9]|$)/i);
}

function createNoopBullmqService(): Pick<
  BullmqService,
  'addEmailJob' | 'addImportJob' | 'createWorker' | 'onModuleDestroy'
> {
  return {
    addEmailJob: jest.fn().mockResolvedValue(undefined),
    addImportJob: jest.fn().mockResolvedValue(undefined),
    createWorker: jest.fn().mockReturnValue({ close: jest.fn() }),
    onModuleDestroy: jest.fn().mockResolvedValue(undefined),
  };
}
