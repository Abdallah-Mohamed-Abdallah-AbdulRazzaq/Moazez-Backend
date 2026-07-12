import { UserType } from '@prisma/client';
import { DashboardTimeContextService } from '../application/dashboard-time-context.service';
import {
  buildDashboardTimeContext,
  resolveDashboardTimezone,
  startOfDashboardCivilDate,
} from '../domain/dashboard-time-context';
import { DashboardTimeContextRepository } from '../infrastructure/dashboard-time-context.repository';

describe('Dashboard time context', () => {
  it('resolves a UTC school close to UTC midnight deterministically', () => {
    const context = buildDashboardTimeContext({
      generatedAt: new Date('2026-07-11T23:59:59.999Z'),
      schoolTimezone: 'UTC',
    });

    expect(context).toMatchObject({
      timezone: 'UTC',
      civilDate: '2026-07-11',
    });
    expect(context.generatedAt.toISOString()).toBe('2026-07-11T23:59:59.999Z');
    expect(context.todayStart.toISOString()).toBe('2026-07-11T00:00:00.000Z');
    expect(context.todayEndExclusive.toISOString()).toBe(
      '2026-07-12T00:00:00.000Z',
    );
  });

  it('uses the Cairo civil date when it differs from the UTC date', () => {
    const context = buildDashboardTimeContext({
      generatedAt: new Date('2026-07-11T22:30:00.000Z'),
      schoolTimezone: 'Africa/Cairo',
    });

    expect(context.civilDate).toBe('2026-07-12');
    expect(context.todayDate.toISOString()).toBe('2026-07-12T00:00:00.000Z');
    expect(context.todayStart.toISOString()).toBe('2026-07-11T21:00:00.000Z');
  });

  it('converts Africa/Cairo civil start of day to the correct instant', () => {
    expect(
      startOfDashboardCivilDate('2026-07-12', 'Africa/Cairo').toISOString(),
    ).toBe('2026-07-11T21:00:00.000Z');
  });

  it('builds timezone-aware seven-day, 30-day, and future boundaries', () => {
    const context = buildDashboardTimeContext({
      generatedAt: new Date('2026-07-11T22:30:00.000Z'),
      schoolTimezone: 'Africa/Cairo',
    });

    expect(context.last7DaysStart.toISOString()).toBe(
      '2026-07-04T21:00:00.000Z',
    );
    expect(context.last30DaysStart.toISOString()).toBe(
      '2026-06-11T21:00:00.000Z',
    );
    expect(context.next7DaysEndExclusive.toISOString()).toBe(
      '2026-07-18T22:30:00.000Z',
    );
  });

  it('uses explicit, school, then UTC timezone resolution order', () => {
    expect(resolveDashboardTimezone('Europe/London', 'Africa/Cairo')).toBe(
      'Europe/London',
    );
    expect(resolveDashboardTimezone('Invalid/Timezone', 'Africa/Cairo')).toBe(
      'Africa/Cairo',
    );
    expect(resolveDashboardTimezone(undefined, 'Invalid/Timezone')).toBe('UTC');
    expect(resolveDashboardTimezone(undefined, undefined)).toBe('UTC');
  });

  it('resolves school context with one caller-provided generated timestamp', async () => {
    const repository = {
      loadSchoolTimezone: jest.fn().mockResolvedValue('Africa/Cairo'),
    } as unknown as DashboardTimeContextRepository;
    const service = new DashboardTimeContextService(repository);
    const generatedAt = new Date('2026-07-11T22:30:00.000Z');

    const context = await service.resolveForSchool(
      {
        actorId: 'actor-1',
        userType: UserType.SCHOOL_USER,
        organizationId: 'organization-1',
        schoolId: 'school-1',
        roleId: 'role-1',
      },
      generatedAt,
    );

    expect(repository.loadSchoolTimezone).toHaveBeenCalledWith(
      expect.objectContaining({ schoolId: 'school-1' }),
    );
    expect(context.generatedAt.toISOString()).toBe(generatedAt.toISOString());
    expect(context.civilDate).toBe('2026-07-12');
  });
});
