import { UserType } from '@prisma/client';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../common/context/request-context';
import { ScopeMissingException } from '../../iam/auth/domain/auth.exceptions';
import { GetDashboardWidgetUseCase } from '../application/get-dashboard-widget.use-case';
import {
  ListDashboardWidgetsUseCase,
  normalizeDashboardWidgetsQuery,
} from '../application/list-dashboard-widgets.use-case';
import { DashboardWidgetDefinition } from '../domain/dashboard-widget-registry';
import { DashboardWidgetDto } from '../dto/dashboard-widgets.dto';
import { dashboardTimeContextServiceMock } from './dashboard-test-time-context';

describe('Dashboard widgets use cases', () => {
  it('returns all 19 definitions in stable order', async () => {
    const composition = compositionServiceMock();
    const useCase = listUseCase(composition);

    const response = await withSchoolScope(() => useCase.execute());

    expect(response.summary.total).toBe(19);
    expect(response.widgets.map((widget) => widget.widgetKey)).toEqual([
      'students.active',
      'admissions.open_applications',
      'attendance.pending_today',
      'attendance.absences_today',
      'homework.waiting_review',
      'grades.pending_review',
      'behavior.pending_review',
      'reinforcement.pending_reviews',
      'communication.moderation_queue',
      'settings.email_connection',
      'settings.login_identity',
      'activity.recent',
      'students.enrollment_growth',
      'attendance.daily_trend',
      'communication.message_volume',
      'academics.teacher_allocation_coverage',
      'grades.gradebook_completion',
      'todos.today',
      'calendar.today',
    ]);
  });

  it.each([
    ['settings', ['settings.email_connection', 'settings.login_identity']],
    ['todos', ['todos.today']],
    ['calendar', ['calendar.today']],
  ] as const)('filters source=%s before composition', async (source, keys) => {
    const composition = compositionServiceMock();
    const useCase = listUseCase(composition);

    await withSchoolScope(() => useCase.execute({ source } as any));

    expect(composedKeys(composition)).toEqual(keys);
  });

  it.each([
    [
      'mini-chart-card',
      [
        'students.enrollment_growth',
        'attendance.daily_trend',
        'communication.message_volume',
      ],
    ],
    [
      'progress-card',
      ['academics.teacher_allocation_coverage', 'grades.gradebook_completion'],
    ],
  ] as const)('filters type=%s before composition', async (type, keys) => {
    const composition = compositionServiceMock();
    const useCase = listUseCase(composition);

    await withSchoolScope(() => useCase.execute({ type } as any));

    expect(composedKeys(composition)).toEqual(keys);
  });

  it('applies limit before composition', async () => {
    const composition = compositionServiceMock();
    await withSchoolScope(() => listUseCase(composition).execute({ limit: 1 }));

    expect(composedKeys(composition)).toEqual(['students.active']);
  });

  it.each([
    ['students.enrollment_growth', 'students.enrollment_growth'],
    ['todos.today', 'todos.today'],
  ])('composes only the requested detail widget %s', async (widgetKey) => {
    const composition = compositionServiceMock();
    const useCase = detailUseCase(composition);

    const response = await withSchoolScope(() => useCase.execute(widgetKey));

    expect(response.widget.widgetKey).toBe(widgetKey);
    expect(composedKeys(composition)).toEqual([widgetKey]);
  });

  it('returns safe not-found before resolving time or loading data', async () => {
    const composition = compositionServiceMock();
    const timeContext = dashboardTimeContextServiceMock();
    const useCase = new GetDashboardWidgetUseCase(
      timeContext as any,
      composition as any,
    );

    await expect(useCase.execute('unknown.widget')).rejects.toBeInstanceOf(
      NotFoundDomainException,
    );
    expect(timeContext.resolveForSchool).not.toHaveBeenCalled();
    expect(composition.compose).not.toHaveBeenCalled();
  });

  it('rejects callers without an active school scope', async () => {
    const useCase = listUseCase(compositionServiceMock());

    await expect(
      runWithRequestContext(createRequestContext(), () => {
        setActor({ id: 'user-1', userType: UserType.SCHOOL_USER });
        return useCase.execute();
      }),
    ).rejects.toBeInstanceOf(ScopeMissingException);
  });

  it('normalizes invalid limits defensively', () => {
    expect(normalizeDashboardWidgetsQuery({ limit: 999 } as any).limit).toBe(
      50,
    );
    expect(normalizeDashboardWidgetsQuery({ limit: 0 } as any).limit).toBe(1);
    expect(
      normalizeDashboardWidgetsQuery({ limit: Number.NaN } as any).limit,
    ).toBe(20);
  });
});

function listUseCase(composition: ReturnType<typeof compositionServiceMock>) {
  return new ListDashboardWidgetsUseCase(
    dashboardTimeContextServiceMock() as any,
    composition as any,
  );
}

function detailUseCase(composition: ReturnType<typeof compositionServiceMock>) {
  return new GetDashboardWidgetUseCase(
    dashboardTimeContextServiceMock() as any,
    composition as any,
  );
}

function compositionServiceMock() {
  return {
    compose: jest
      .fn()
      .mockImplementation(
        async (input: { definitions: readonly DashboardWidgetDefinition[] }) =>
          input.definitions.map(widgetFromDefinition),
      ),
  };
}

function composedKeys(composition: ReturnType<typeof compositionServiceMock>) {
  const definitions = composition.compose.mock.calls[0][0]
    .definitions as DashboardWidgetDefinition[];
  return definitions.map((definition) => definition.widgetKey);
}

function widgetFromDefinition(
  definition: DashboardWidgetDefinition,
): DashboardWidgetDto {
  return {
    widgetKey: definition.widgetKey,
    type: definition.type,
    source: definition.source,
    title: definition.title,
    subtitle: definition.subtitle,
    iconKey: definition.iconKey,
    tone: 'neutral',
    data: {},
    action: definition.action,
    emptyState: null,
    meta: {
      freshness: 'live',
      freshnessDetails: {
        dataMode: 'request_time_snapshot',
        cacheStatus: 'not_used',
        realtimeStatus: 'not_used',
      },
      analytics: null,
    },
  };
}

async function withSchoolScope<T>(fn: () => Promise<T>): Promise<T> {
  return runWithRequestContext(createRequestContext(), async () => {
    setActor({ id: 'user-1', userType: UserType.SCHOOL_USER });
    setActiveMembership({
      membershipId: 'membership-1',
      organizationId: 'org-1',
      schoolId: 'school-1',
      roleId: 'role-1',
      permissions: ['dashboard.widgets.view'],
    });
    return fn();
  });
}
