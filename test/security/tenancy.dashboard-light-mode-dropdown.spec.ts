import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AcademicCalendarEventScopeType,
  AcademicCalendarEventType,
  AdmissionApplicationSource,
  AdmissionApplicationStatus,
  AttendanceMode,
  AttendanceScopeType,
  AttendanceSessionStatus,
  GradeAssessmentApprovalStatus,
  GradeAssessmentType,
  GradeScopeType,
  HomeworkAssignmentStatus,
  InterviewStatus,
  PlacementTestStatus,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../src/common/context/request-context';
import { REQUIRED_PERMISSIONS_METADATA } from '../../src/common/decorators/required-permissions.decorator';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { GetDashboardLightModeDropdownUseCase } from '../../src/modules/dashboard/application/get-dashboard-light-mode-dropdown.use-case';
import { DashboardController } from '../../src/modules/dashboard/controller/dashboard.controller';
import { DashboardLightModeDropdownRepository } from '../../src/modules/dashboard/infrastructure/dashboard-light-mode-dropdown.repository';
import { DashboardTodosRepository } from '../../src/modules/dashboard/infrastructure/dashboard-todos.repository';
import { DashboardPlannerCalendarRepository } from '../../src/modules/dashboard/infrastructure/dashboard-planner-calendar.repository';
import { DashboardPlannerItemsRepository } from '../../src/modules/dashboard/infrastructure/dashboard-planner-items.repository';
import { CalendarEventsController } from '../../src/modules/academics/calendar/controller/calendar-events.controller';
import { presentDashboardLightModeDropdown } from '../../src/modules/dashboard/presenters/dashboard-light-mode-dropdown.presenter';

jest.setTimeout(60000);

describe('Dashboard LightModeDropdown tenancy/security contracts', () => {
  const OWNER_A_ID = '33333333-3333-4333-8333-333333333333';
  const suffix = randomUUID().split('-')[0];
  const marker = `light-mode-security-${suffix}`;

  let prisma: PrismaService;
  let organizationId = '';
  let schoolAId = '';
  let schoolBId = '';
  let academicYearAId = '';
  let academicYearBId = '';
  let termAId = '';
  let termBId = '';
  const sourceUserIds: string[] = [];
  const schoolAPlannerSourceIds: string[] = [];
  const schoolBPlannerSourceIds: string[] = [];
  const excludedPlannerSourceIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const organization = await prisma.organization.create({
      data: {
        slug: `${marker}-org`,
        name: `Dashboard LightMode Security Org ${suffix}`,
      },
      select: { id: true },
    });
    organizationId = organization.id;

    const [schoolA, schoolB] = await Promise.all([
      prisma.school.create({
        data: {
          organizationId,
          slug: `${marker}-school-a`,
          name: `Dashboard LightMode School A ${suffix}`,
        },
        select: { id: true },
      }),
      prisma.school.create({
        data: {
          organizationId,
          slug: `${marker}-school-b`,
          name: `Dashboard LightMode School B ${suffix}`,
        },
        select: { id: true },
      }),
    ]);
    schoolAId = schoolA.id;
    schoolBId = schoolB.id;

    await prisma.schoolProfile.createMany({
      data: [
        {
          schoolId: schoolAId,
          schoolName: `Dashboard LightMode School A ${suffix}`,
          timezone: 'Africa/Cairo',
          formattedAddress: 'School A Address',
          city: 'Cairo',
          country: 'Egypt',
          latitude: '30.044400',
          longitude: '31.235700',
        },
        {
          schoolId: schoolBId,
          schoolName: `Dashboard LightMode School B ${suffix}`,
          timezone: 'Europe/Berlin',
          formattedAddress: 'School B Address',
          city: 'Berlin',
          country: 'Germany',
          latitude: '52.520000',
          longitude: '13.405000',
        },
      ],
    });

    const [yearA, yearB] = await Promise.all(
      [schoolAId, schoolBId].map((schoolId, index) =>
        prisma.academicYear.create({
          data: {
            schoolId,
            nameAr: `${marker}-year-${index}-ar`,
            nameEn: `${marker}-year-${index}-en`,
            startDate: new Date('2026-01-01T00:00:00.000Z'),
            endDate: new Date('2026-12-31T00:00:00.000Z'),
          },
          select: { id: true },
        }),
      ),
    );
    academicYearAId = yearA.id;
    academicYearBId = yearB.id;
    const [termA, termB] = await Promise.all([
      prisma.term.create({
        data: {
          schoolId: schoolAId,
          academicYearId: academicYearAId,
          nameAr: `${marker}-term-a-ar`,
          nameEn: `${marker}-term-a-en`,
          startDate: new Date('2026-01-01T00:00:00.000Z'),
          endDate: new Date('2026-12-31T00:00:00.000Z'),
        },
        select: { id: true },
      }),
      prisma.term.create({
        data: {
          schoolId: schoolBId,
          academicYearId: academicYearBId,
          nameAr: `${marker}-term-b-ar`,
          nameEn: `${marker}-term-b-en`,
          startDate: new Date('2026-01-01T00:00:00.000Z'),
          endDate: new Date('2026-12-31T00:00:00.000Z'),
        },
        select: { id: true },
      }),
    ]);
    termAId = termA.id;
    termBId = termB.id;
    const [sourceUserA, sourceUserB] = await Promise.all([
      prisma.user.create({
        data: {
          email: `${marker}-private-interviewer-a@example.test`,
          firstName: 'Private',
          lastName: 'Interviewer A',
          userType: UserType.SCHOOL_USER,
        },
        select: { id: true },
      }),
      prisma.user.create({
        data: {
          email: `${marker}-private-interviewer-b@example.test`,
          firstName: 'Private',
          lastName: 'Interviewer B',
          userType: UserType.SCHOOL_USER,
        },
        select: { id: true },
      }),
    ]);
    sourceUserIds.push(sourceUserA.id, sourceUserB.id);
    await prisma.student.createMany({
      data: [
        {
          organizationId,
          schoolId: schoolAId,
          firstName: `${marker} private student A`,
          lastName: 'Planner',
        },
        {
          organizationId,
          schoolId: schoolBId,
          firstName: `${marker} private student B`,
          lastName: 'Planner',
        },
      ],
    });
    const [plannerA, plannerB] = await Promise.all([
      createPlannerSecurityFixtures(prisma, {
        organizationId,
        schoolId: schoolAId,
        academicYearId: academicYearAId,
        termId: termAId,
        sourceUserId: sourceUserA.id,
        marker: `${marker} School A`,
        includeExcluded: true,
      }),
      createPlannerSecurityFixtures(prisma, {
        organizationId,
        schoolId: schoolBId,
        academicYearId: academicYearBId,
        termId: termBId,
        sourceUserId: sourceUserB.id,
        marker: `${marker} School B`,
        includeExcluded: false,
      }),
    ]);
    schoolAPlannerSourceIds.push(...plannerA.visibleIds);
    schoolBPlannerSourceIds.push(...plannerB.visibleIds);
    excludedPlannerSourceIds.push(...plannerA.excludedIds);
    await prisma.academicCalendarEvent.createMany({
      data: [
        calendarEvent(
          schoolAId,
          academicYearAId,
          termAId,
          `${marker} School A event`,
        ),
        calendarEvent(
          schoolBId,
          academicYearBId,
          termBId,
          `${marker} School B event`,
        ),
        {
          ...calendarEvent(
            schoolAId,
            academicYearAId,
            termAId,
            `${marker} deleted event`,
          ),
          deletedAt: new Date('2026-07-01T00:00:00.000Z'),
        },
      ],
    });
    await prisma.attendanceSession.createMany({
      data: [
        attendanceSession(
          schoolAId,
          academicYearAId,
          termAId,
          `${marker} School A attendance`,
        ),
        attendanceSession(
          schoolBId,
          academicYearBId,
          termBId,
          `${marker} School B attendance`,
        ),
        {
          ...attendanceSession(
            schoolAId,
            academicYearAId,
            termAId,
            `${marker} deleted attendance`,
            'DELETED',
          ),
          deletedAt: new Date('2026-07-01T00:00:00.000Z'),
        },
      ],
    });
  });

  afterAll(async () => {
    if (!prisma) return;

    await prisma.homeworkAssignment.deleteMany({
      where: { schoolId: { in: [schoolAId, schoolBId].filter(Boolean) } },
    });
    await prisma.gradeAssessment.deleteMany({
      where: { schoolId: { in: [schoolAId, schoolBId].filter(Boolean) } },
    });
    await prisma.teacherSubjectAllocation.deleteMany({
      where: { schoolId: { in: [schoolAId, schoolBId].filter(Boolean) } },
    });
    await prisma.attendanceSession.deleteMany({
      where: { schoolId: { in: [schoolAId, schoolBId].filter(Boolean) } },
    });
    await prisma.placementTest.deleteMany({
      where: { schoolId: { in: [schoolAId, schoolBId].filter(Boolean) } },
    });
    await prisma.interview.deleteMany({
      where: { schoolId: { in: [schoolAId, schoolBId].filter(Boolean) } },
    });
    await prisma.application.deleteMany({
      where: { schoolId: { in: [schoolAId, schoolBId].filter(Boolean) } },
    });
    await prisma.academicCalendarEvent.deleteMany({
      where: { schoolId: { in: [schoolAId, schoolBId].filter(Boolean) } },
    });
    await prisma.student.deleteMany({
      where: { schoolId: { in: [schoolAId, schoolBId].filter(Boolean) } },
    });
    await prisma.classroom.deleteMany({
      where: { schoolId: { in: [schoolAId, schoolBId].filter(Boolean) } },
    });
    await prisma.section.deleteMany({
      where: { schoolId: { in: [schoolAId, schoolBId].filter(Boolean) } },
    });
    await prisma.grade.deleteMany({
      where: { schoolId: { in: [schoolAId, schoolBId].filter(Boolean) } },
    });
    await prisma.stage.deleteMany({
      where: { schoolId: { in: [schoolAId, schoolBId].filter(Boolean) } },
    });
    await prisma.subject.deleteMany({
      where: { schoolId: { in: [schoolAId, schoolBId].filter(Boolean) } },
    });
    await prisma.term.deleteMany({
      where: { id: { in: [termAId, termBId].filter(Boolean) } },
    });
    await prisma.academicYear.deleteMany({
      where: { id: { in: [academicYearAId, academicYearBId].filter(Boolean) } },
    });
    await prisma.schoolProfile.deleteMany({
      where: { schoolId: { in: [schoolAId, schoolBId].filter(Boolean) } },
    });
    await prisma.school.deleteMany({
      where: { id: { in: [schoolAId, schoolBId].filter(Boolean) } },
    });
    await prisma.organization.deleteMany({
      where: { id: organizationId },
    });
    await prisma.user.deleteMany({
      where: { id: { in: sourceUserIds } },
    });
    await prisma.$disconnect();
  });

  it('registers the LightModeDropdown read route on the read-only Dashboard controller', () => {
    expect(controllerMethods(DashboardController)).toEqual([
      'getCommandCenter',
      'getLightModeDropdown',
      'getAnalyticsCatalog',
      'listAnalyticsCharts',
      'getAnalyticsChart',
      'getAnalyticsChartData',
      'listModules',
      'getModulePage',
      'listWidgets',
      'getWidget',
      'getSummary',
      'listAlerts',
      'listActivityFeed',
    ]);
    expect(readPermissions('getLightModeDropdown')).toEqual([
      'dashboard.light_mode_dropdown.view',
    ]);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_METADATA,
        // eslint-disable-next-line @typescript-eslint/unbound-method
        CalendarEventsController.prototype.listEvents,
      ),
    ).toEqual(['academics.calendar.view']);
    expect(controllerMethods(DashboardController)).not.toEqual(
      expect.arrayContaining([
        'refreshWeatherProvider',
        'syncPlannerCalendar',
        'acknowledgeAlert',
        'dismissAlert',
        'snoozeAlert',
        'subscribeRealtime',
        'exportDashboard',
        'createDashboardReport',
      ]),
    );
  });

  it('adds dashboard LightModeDropdown and todo permissions to admin-like seed inheritance only', () => {
    const permissionsSeed = readFileSync(
      join(process.cwd(), 'prisma/seeds/01-permissions.seed.ts'),
      'utf8',
    );
    const rolesSeed = readFileSync(
      join(process.cwd(), 'prisma/seeds/02-system-roles.seed.ts'),
      'utf8',
    );

    expect(permissionsSeed).toContain("'dashboard.light_mode_dropdown.view'");
    expect(permissionsSeed).toContain("resource: 'light_mode_dropdown'");
    expect(permissionsSeed).toContain("'dashboard.todos.view'");
    expect(permissionsSeed).toContain("'dashboard.todos.manage'");
    expect(permissionsSeed).toContain("resource: 'todos'");
    expect(rolesSeed).toContain('const ALL = PERMISSION_CODES;');
    expect(rolesSeed).toContain('const NON_PLATFORM = ALL.filter');
    expect(rolesSeed).toContain('const SCHOOL_LEVEL = NON_PLATFORM;');
    expect(extractArrayLiteral(rolesSeed, 'TEACHER_PERMISSIONS')).not.toContain(
      'dashboard.light_mode_dropdown.view',
    );
    expect(extractArrayLiteral(rolesSeed, 'TEACHER_PERMISSIONS')).not.toContain(
      'dashboard.todos.view',
    );
    expect(extractArrayLiteral(rolesSeed, 'TEACHER_PERMISSIONS')).not.toContain(
      'dashboard.todos.manage',
    );
    expect(extractArrayLiteral(rolesSeed, 'PARENT_PERMISSIONS')).not.toContain(
      'dashboard.light_mode_dropdown.view',
    );
    expect(extractArrayLiteral(rolesSeed, 'PARENT_PERMISSIONS')).not.toContain(
      'dashboard.todos.view',
    );
    expect(extractArrayLiteral(rolesSeed, 'PARENT_PERMISSIONS')).not.toContain(
      'dashboard.todos.manage',
    );
    expect(extractArrayLiteral(rolesSeed, 'STUDENT_PERMISSIONS')).not.toContain(
      'dashboard.light_mode_dropdown.view',
    );
    expect(extractArrayLiteral(rolesSeed, 'STUDENT_PERMISSIONS')).not.toContain(
      'dashboard.todos.view',
    );
    expect(extractArrayLiteral(rolesSeed, 'STUDENT_PERMISSIONS')).not.toContain(
      'dashboard.todos.manage',
    );
  });

  it('keeps school A from observing school B Calendar/location data, hides soft deletes, and ignores tenant overrides', async () => {
    const useCase = new GetDashboardLightModeDropdownUseCase(
      new DashboardLightModeDropdownRepository(prisma),
      new DashboardTodosRepository(prisma),
      new DashboardPlannerCalendarRepository(prisma),
      new DashboardPlannerItemsRepository(prisma),
    );

    const response = await withSchoolScope(schoolAId, () =>
      (useCase.execute as unknown as (query: unknown) => Promise<unknown>).call(
        useCase,
        {
          schoolId: schoolBId,
          organizationId,
          ownerUserId: 'owner-b',
          date: '2026-07-09',
        },
      ),
    );
    const serialized = JSON.stringify(response);
    const body = response as {
      planner: {
        events: Array<{ eventId: string; source: string; title: string }>;
      };
    };

    expect(response).toMatchObject({
      location: {
        label: 'School A Address',
        city: 'Cairo',
        country: 'Egypt',
        timezone: 'Africa/Cairo',
        source: 'school_profile',
      },
      weather: {
        status: 'provider_not_configured',
        provider: null,
      },
      forecast: [],
      planner: {
        timezone: 'Africa/Cairo',
        todos: [],
      },
    });
    expect(
      body.planner.events.map((event) => [event.source, event.title]),
    ).toEqual([
      ['academic_calendar', `${marker} School A event`],
      ['attendance_session', `${marker} School A attendance`],
      ['grade_assessment', `${marker} School A grade assessment`],
      ['placement_test', `Placement test — ${marker} School A placement`],
      ['interview', 'Admissions interview'],
      ['homework_due', `${marker} School A homework due`],
    ]);
    for (const plannerEvent of body.planner.events.filter(
      (event) => event.source !== 'academic_calendar',
    )) {
      expect(plannerEvent.eventId).toMatch(
        new RegExp(`^${plannerEvent.source}:[0-9a-f-]+$`),
      );
    }
    for (const id of schoolAPlannerSourceIds) {
      expect(serialized).toContain(id);
    }
    for (const id of [
      ...schoolBPlannerSourceIds,
      ...excludedPlannerSourceIds,
    ]) {
      expect(serialized).not.toContain(id);
    }
    expect(serialized).not.toContain('School B Address');
    expect(serialized).not.toContain('Berlin');
    expect(serialized).not.toContain('Europe/Berlin');
    expect(serialized).not.toContain(schoolAId);
    expect(serialized).not.toContain(schoolBId);
    expect(serialized).not.toContain(organizationId);
    expect(serialized).not.toContain(OWNER_A_ID);
    expect(serialized).not.toContain('owner-b');
    expect(serialized).not.toContain(`${marker} School B event`);
    expect(serialized).not.toContain(`${marker} School B attendance`);
    expect(serialized).not.toContain(`${marker} deleted event`);
    expect(serialized).not.toContain(`${marker} deleted attendance`);
    for (const hiddenMarker of [
      `${marker} School B homework due`,
      `${marker} School B grade assessment`,
      `${marker} School A deleted homework due`,
      `${marker} School A draft homework due`,
      `${marker} School A scheduled homework due`,
      `${marker} School A cancelled homework due`,
      `${marker} School A deleted grade assessment`,
      `${marker} School A draft grade assessment`,
      `${marker} School A assignment grade assessment`,
      `${marker} School A cancelled placement`,
      `${marker} School A deleted application placement`,
      `${marker} School B placement`,
    ]) {
      expect(serialized).not.toContain(hiddenMarker);
    }
    expect(serialized).not.toContain(`${marker} private applicant A`);
    expect(serialized).not.toContain(`${marker} private student A`);
    expect(serialized).not.toContain('Private Interviewer A');
    expect(serialized).not.toContain(
      `${marker}-private-interviewer-a@example.test`,
    );
    expectNoInternalLeaks(response);
  });

  function attendanceSession(
    schoolId: string,
    academicYearId: string,
    termId: string,
    periodLabelEn: string,
    suffix = 'VISIBLE',
  ) {
    return {
      schoolId,
      academicYearId,
      termId,
      date: new Date('2026-07-09T00:00:00.000Z'),
      scopeType: AttendanceScopeType.SCHOOL,
      scopeKey: schoolId,
      mode: AttendanceMode.DAILY,
      periodKey: `${marker}-${suffix}`,
      periodLabelEn,
      status: AttendanceSessionStatus.DRAFT,
    };
  }

  it('does not expose tenant ids, latitude/longitude, provider secrets, or raw payloads in presenter output', () => {
    const response = presentDashboardLightModeDropdown({
      generatedAt: new Date('2026-07-09T12:00:00.000Z'),
      schoolLocation: {
        schoolName: 'School A',
        profile: {
          timezone: 'Africa/Cairo',
          formattedAddress: 'School A Address',
          city: 'Cairo',
          country: 'Egypt',
          schoolId: 'school-a',
          organizationId: 'org-a',
          latitude: '30.044400',
          longitude: '31.235700',
          raw: { providerPayload: 'secret' },
        } as any,
      },
      query: {
        locale: 'en',
        timezone: 'Africa/Cairo',
        units: 'metric',
        date: '2026-07-09',
        providerKey: 'provider-secret',
      } as any,
    });

    expect(response.weather.provider).toBeNull();
    expect(response.forecast).toEqual([]);
    expect(response.planner.todos).toEqual([]);
    expectNoInternalLeaks(response);
  });

  async function withSchoolScope<T>(
    schoolId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: OWNER_A_ID, userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: `membership-${schoolId}`,
        organizationId,
        schoolId,
        roleId: `role-${schoolId}`,
        permissions: ['dashboard.light_mode_dropdown.view'],
      });

      return fn();
    });
  }
});

function calendarEvent(
  schoolId: string,
  academicYearId: string,
  termId: string,
  title: string,
) {
  return {
    schoolId,
    academicYearId,
    termId,
    title,
    type: AcademicCalendarEventType.ACTIVITY,
    scopeType: AcademicCalendarEventScopeType.SCHOOL,
    allDay: true,
    startDate: new Date('2026-07-09T00:00:00.000Z'),
    endDate: new Date('2026-07-09T00:00:00.000Z'),
  };
}

async function createPlannerSecurityFixtures(
  prisma: PrismaService,
  input: {
    organizationId: string;
    schoolId: string;
    academicYearId: string;
    termId: string;
    sourceUserId: string;
    marker: string;
    includeExcluded: boolean;
  },
): Promise<{ visibleIds: string[]; excludedIds: string[] }> {
  const subject = await prisma.subject.create({
    data: {
      schoolId: input.schoolId,
      nameAr: `${input.marker}-subject-ar`,
      nameEn: `${input.marker}-subject-en`,
      code: `${input.marker}-${randomUUID()}`,
    },
    select: { id: true },
  });
  const stage = await prisma.stage.create({
    data: {
      schoolId: input.schoolId,
      nameAr: `${input.marker}-stage-ar`,
      nameEn: `${input.marker}-stage-en`,
    },
    select: { id: true },
  });
  const grade = await prisma.grade.create({
    data: {
      schoolId: input.schoolId,
      stageId: stage.id,
      nameAr: `${input.marker}-grade-ar`,
      nameEn: `${input.marker}-grade-en`,
    },
    select: { id: true },
  });
  const section = await prisma.section.create({
    data: {
      schoolId: input.schoolId,
      gradeId: grade.id,
      nameAr: `${input.marker}-section-ar`,
      nameEn: `${input.marker}-section-en`,
    },
    select: { id: true },
  });
  const classroom = await prisma.classroom.create({
    data: {
      schoolId: input.schoolId,
      sectionId: section.id,
      nameAr: `${input.marker}-classroom-ar`,
      nameEn: `${input.marker}-classroom-en`,
    },
    select: { id: true },
  });
  const allocation = await prisma.teacherSubjectAllocation.create({
    data: {
      schoolId: input.schoolId,
      teacherUserId: input.sourceUserId,
      subjectId: subject.id,
      classroomId: classroom.id,
      termId: input.termId,
    },
    select: { id: true },
  });
  const application = await prisma.application.create({
    data: {
      schoolId: input.schoolId,
      organizationId: input.organizationId,
      studentName: `${input.marker} private applicant`,
      source: AdmissionApplicationSource.IN_APP,
      status: AdmissionApplicationStatus.SUBMITTED,
      submittedAt: new Date('2026-07-01T08:00:00.000Z'),
    },
    select: { id: true },
  });
  const [placement, interview, homework, assessment] = await Promise.all([
    prisma.placementTest.create({
      data: {
        schoolId: input.schoolId,
        applicationId: application.id,
        type: `${input.marker} placement`,
        scheduledAt: new Date('2026-07-09T09:00:00.000Z'),
        status: PlacementTestStatus.SCHEDULED,
      },
      select: { id: true },
    }),
    prisma.interview.create({
      data: {
        schoolId: input.schoolId,
        applicationId: application.id,
        interviewerUserId: input.sourceUserId,
        scheduledAt: new Date('2026-07-09T10:00:00.000Z'),
        status: InterviewStatus.SCHEDULED,
      },
      select: { id: true },
    }),
    prisma.homeworkAssignment.create({
      data: homeworkData(input, {
        classroomId: classroom.id,
        subjectId: subject.id,
        allocationId: allocation.id,
        title: `${input.marker} homework due`,
        status: HomeworkAssignmentStatus.PUBLISHED,
      }),
      select: { id: true },
    }),
    prisma.gradeAssessment.create({
      data: assessmentData(input, {
        subjectId: subject.id,
        title: `${input.marker} grade assessment`,
        type: GradeAssessmentType.QUIZ,
        status: GradeAssessmentApprovalStatus.PUBLISHED,
      }),
      select: { id: true },
    }),
  ]);

  if (!input.includeExcluded) {
    return {
      visibleIds: [placement.id, interview.id, homework.id, assessment.id],
      excludedIds: [],
    };
  }

  const deletedApplication = await prisma.application.create({
    data: {
      schoolId: input.schoolId,
      organizationId: input.organizationId,
      studentName: `${input.marker} deleted private applicant`,
      source: AdmissionApplicationSource.IN_APP,
      status: AdmissionApplicationStatus.SUBMITTED,
      submittedAt: new Date('2026-07-01T08:00:00.000Z'),
      deletedAt: new Date('2026-07-02T08:00:00.000Z'),
    },
    select: { id: true },
  });
  const excluded = await Promise.all([
    prisma.placementTest.create({
      data: {
        schoolId: input.schoolId,
        applicationId: deletedApplication.id,
        type: `${input.marker} deleted application placement`,
        scheduledAt: new Date('2026-07-09T09:15:00.000Z'),
        status: PlacementTestStatus.SCHEDULED,
      },
      select: { id: true },
    }),
    prisma.interview.create({
      data: {
        schoolId: input.schoolId,
        applicationId: deletedApplication.id,
        interviewerUserId: input.sourceUserId,
        scheduledAt: new Date('2026-07-09T10:15:00.000Z'),
        status: InterviewStatus.SCHEDULED,
      },
      select: { id: true },
    }),
    prisma.placementTest.create({
      data: {
        schoolId: input.schoolId,
        applicationId: application.id,
        type: `${input.marker} cancelled placement`,
        scheduledAt: new Date('2026-07-09T09:30:00.000Z'),
        status: PlacementTestStatus.CANCELLED,
      },
      select: { id: true },
    }),
    prisma.interview.create({
      data: {
        schoolId: input.schoolId,
        applicationId: application.id,
        interviewerUserId: input.sourceUserId,
        scheduledAt: new Date('2026-07-09T10:30:00.000Z'),
        status: InterviewStatus.CANCELLED,
      },
      select: { id: true },
    }),
    prisma.homeworkAssignment.create({
      data: {
        ...homeworkData(input, {
          classroomId: classroom.id,
          subjectId: subject.id,
          allocationId: allocation.id,
          title: `${input.marker} deleted homework due`,
          status: HomeworkAssignmentStatus.PUBLISHED,
        }),
        deletedAt: new Date('2026-07-02T08:00:00.000Z'),
      },
      select: { id: true },
    }),
    ...[
      { label: 'draft', status: HomeworkAssignmentStatus.DRAFT },
      {
        label: 'scheduled',
        status: HomeworkAssignmentStatus.DRAFT,
        publishAt: new Date('2026-07-09T08:00:00.000Z'),
      },
      { label: 'cancelled', status: HomeworkAssignmentStatus.CANCELLED },
    ].map(({ label, status, publishAt }) =>
      prisma.homeworkAssignment.create({
        data: {
          ...homeworkData(input, {
            classroomId: classroom.id,
            subjectId: subject.id,
            allocationId: allocation.id,
            title: `${input.marker} ${label} homework due`,
            status,
          }),
          publishAt,
        },
        select: { id: true },
      }),
    ),
    prisma.gradeAssessment.create({
      data: {
        ...assessmentData(input, {
          subjectId: subject.id,
          title: `${input.marker} deleted grade assessment`,
          type: GradeAssessmentType.QUIZ,
          status: GradeAssessmentApprovalStatus.PUBLISHED,
        }),
        deletedAt: new Date('2026-07-02T08:00:00.000Z'),
      },
      select: { id: true },
    }),
    prisma.gradeAssessment.create({
      data: assessmentData(input, {
        subjectId: subject.id,
        title: `${input.marker} draft grade assessment`,
        type: GradeAssessmentType.QUIZ,
        status: GradeAssessmentApprovalStatus.DRAFT,
      }),
      select: { id: true },
    }),
    prisma.gradeAssessment.create({
      data: assessmentData(input, {
        subjectId: subject.id,
        title: `${input.marker} assignment grade assessment`,
        type: GradeAssessmentType.ASSIGNMENT,
        status: GradeAssessmentApprovalStatus.PUBLISHED,
      }),
      select: { id: true },
    }),
  ]);

  return {
    visibleIds: [placement.id, interview.id, homework.id, assessment.id],
    excludedIds: excluded.map((row) => row.id),
  };
}

function homeworkData(
  input: {
    schoolId: string;
    academicYearId: string;
    termId: string;
    sourceUserId: string;
  },
  source: {
    classroomId: string;
    subjectId: string;
    allocationId: string;
    title: string;
    status: HomeworkAssignmentStatus;
  },
) {
  return {
    schoolId: input.schoolId,
    academicYearId: input.academicYearId,
    termId: input.termId,
    classroomId: source.classroomId,
    subjectId: source.subjectId,
    teacherUserId: input.sourceUserId,
    teacherSubjectAllocationId: source.allocationId,
    title: source.title,
    status: source.status,
    dueAt: new Date('2026-07-09T12:00:00.000Z'),
    createdByUserId: input.sourceUserId,
  };
}

function assessmentData(
  input: { schoolId: string; academicYearId: string; termId: string },
  source: {
    subjectId: string;
    title: string;
    type: GradeAssessmentType;
    status: GradeAssessmentApprovalStatus;
  },
) {
  return {
    schoolId: input.schoolId,
    academicYearId: input.academicYearId,
    termId: input.termId,
    subjectId: source.subjectId,
    scopeType: GradeScopeType.SCHOOL,
    scopeKey: input.schoolId,
    titleEn: source.title,
    type: source.type,
    date: new Date('2026-07-09T00:00:00.000Z'),
    weight: 10,
    maxScore: 20,
    approvalStatus: source.status,
  };
}

function readPermissions(methodName: string): string[] | undefined {
  return Reflect.getMetadata(
    REQUIRED_PERMISSIONS_METADATA,
    DashboardController.prototype[methodName],
  );
}

function controllerMethods(controller: Function): string[] {
  return Object.getOwnPropertyNames(controller.prototype).filter(
    (method) => method !== 'constructor',
  );
}

function extractArrayLiteral(source: string, arrayName: string): string {
  const match = source.match(
    new RegExp(`const ${arrayName} = \\[([\\s\\S]*?)\\];`),
  );
  return match?.[1] ?? '';
}

function expectNoInternalLeaks(body: unknown): void {
  const serialized = JSON.stringify(body);
  for (const forbidden of [
    'schoolId',
    'organizationId',
    'membershipId',
    'roleId',
    'ownerUserId',
    'userId',
    'passwordHash',
    'deletedAt',
    'actorId',
    'resourceId',
    'bucket',
    'objectKey',
    'latitude',
    'longitude',
    'provider-secret',
    'providerPayload',
    'providerKey',
    'smtp',
    'raw',
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
  expect(serialized).not.toMatch(/[<](svg|div|span)/i);
}
