import { DashboardTimeContextService } from '../application/dashboard-time-context.service';
import {
  DashboardTimeContext,
  buildDashboardTimeContext,
} from '../domain/dashboard-time-context';

export const DASHBOARD_TEST_GENERATED_AT = new Date('2026-07-11T22:30:00.000Z');

export function dashboardTimeContextServiceMock(
  options: {
    generatedAt?: Date;
    schoolTimezone?: string | null;
  } = {},
): jest.Mocked<Pick<DashboardTimeContextService, 'resolveForSchool'>> {
  const context = buildDashboardTimeContext({
    generatedAt: options.generatedAt ?? DASHBOARD_TEST_GENERATED_AT,
    schoolTimezone:
      options.schoolTimezone === undefined
        ? 'Africa/Cairo'
        : options.schoolTimezone,
  });

  return {
    resolveForSchool: jest.fn().mockResolvedValue(context),
  };
}

export function dashboardTestTimeContext(
  options: {
    generatedAt?: Date;
    schoolTimezone?: string | null;
  } = {},
): DashboardTimeContext {
  return buildDashboardTimeContext({
    generatedAt: options.generatedAt ?? DASHBOARD_TEST_GENERATED_AT,
    schoolTimezone:
      options.schoolTimezone === undefined
        ? 'Africa/Cairo'
        : options.schoolTimezone,
  });
}
