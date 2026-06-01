import { DashboardAlertDto } from '../dto/dashboard-alerts.dto';
import { presentDashboardAlerts } from '../presenters/dashboard-alerts.presenter';

describe('Dashboard alerts presenter', () => {
  it('presents alerts with summary totals and deferred lifecycle fields', () => {
    const response = presentDashboardAlerts({
      generatedAt: new Date('2026-06-01T09:00:00.000Z'),
      alerts: [
        alert({
          key: 'attendance.absent_entries_today',
          source: 'attendance',
          severity: 'critical',
          count: 2,
        }),
        alert({
          key: 'admissions.applications_waiting_decision',
          source: 'admissions',
          severity: 'warning',
          count: 3,
        }),
      ],
    });

    expect(response).toEqual({
      generatedAt: '2026-06-01T09:00:00.000Z',
      alerts: [
        expect.objectContaining({
          key: 'attendance.absent_entries_today',
          source: 'attendance',
          severity: 'critical',
          count: 2,
          action: {
            label: 'Open',
            target: '/dashboard',
          },
        }),
        expect.objectContaining({
          key: 'admissions.applications_waiting_decision',
          source: 'admissions',
          severity: 'warning',
          count: 3,
        }),
      ],
      summary: {
        total: 5,
        critical: 2,
        warning: 3,
        info: 0,
        bySource: {
          attendance: 2,
          admissions: 3,
        },
      },
      deferred: {
        persistence: 'deferred',
        acknowledge: 'deferred',
        dismiss: 'deferred',
        activityFeed: 'deferred',
      },
    });
  });

  it('keeps the empty response shape stable', () => {
    expect(
      presentDashboardAlerts({
        generatedAt: new Date('2026-06-01T09:00:00.000Z'),
        alerts: [],
      }),
    ).toEqual({
      generatedAt: '2026-06-01T09:00:00.000Z',
      alerts: [],
      summary: {
        total: 0,
        critical: 0,
        warning: 0,
        info: 0,
        bySource: {},
      },
      deferred: {
        persistence: 'deferred',
        acknowledge: 'deferred',
        dismiss: 'deferred',
        activityFeed: 'deferred',
      },
    });
  });

  it('does not expose tenant identifiers or raw backing payloads', () => {
    const response = presentDashboardAlerts({
      generatedAt: new Date('2026-06-01T09:00:00.000Z'),
      alerts: [
        {
          ...alert({
            key: 'settings.login_identity_missing',
            source: 'settings',
            severity: 'critical',
            count: 1,
          }),
          schoolId: 'school-1',
          organizationId: 'org-1',
          raw: { schoolId: 'school-1' },
        } as DashboardAlertDto,
      ],
    });

    const serialized = JSON.stringify(response);
    expect(serialized).not.toContain('schoolId');
    expect(serialized).not.toContain('organizationId');
    expect(serialized).not.toContain('raw');
  });
});

function alert(
  overrides: Pick<DashboardAlertDto, 'key' | 'source' | 'severity' | 'count'>,
): DashboardAlertDto {
  return {
    title: 'Alert title',
    description: 'Alert description',
    action: {
      label: 'Open',
      target: '/dashboard',
    },
    ...overrides,
  };
}
