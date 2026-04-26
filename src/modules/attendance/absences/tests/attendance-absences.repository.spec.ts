import {
  AttendanceScopeType,
  AttendanceSessionStatus,
  AttendanceStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { ATTENDANCE_INCIDENT_STATUSES } from '../domain/attendance-incident';
import { AttendanceAbsencesRepository } from '../infrastructure/attendance-absences.repository';

describe('AttendanceAbsencesRepository', () => {
  function buildRepository() {
    const findMany = jest.fn().mockResolvedValue([]);
    const scoped = {
      attendanceEntry: {
        findMany,
      },
    };
    const prisma = { scoped } as unknown as PrismaService;
    const repository = new AttendanceAbsencesRepository(prisma);

    return { repository, findMany };
  }

  it('lists only entries whose parent session is submitted', async () => {
    const { repository, findMany } = buildRepository();

    await repository.listIncidents({});

    const where = findMany.mock.calls[0][0].where;
    expect(where.session).toMatchObject({
      status: AttendanceSessionStatus.SUBMITTED,
      deletedAt: null,
    });
  });

  it('constrains the list to absence incident statuses only', async () => {
    const { repository, findMany } = buildRepository();

    await repository.listIncidents({});

    const where = findMany.mock.calls[0][0].where;
    expect(where.status.in).toEqual([...ATTENDANCE_INCIDENT_STATUSES]);
    expect(where.status.in).not.toContain(AttendanceStatus.PRESENT);
    expect(where.status.in).not.toContain(AttendanceStatus.UNMARKED);
  });

  it('does not query when a non-incident status is requested', async () => {
    const { repository, findMany } = buildRepository();

    const result = await repository.listIncidents({
      status: AttendanceStatus.PRESENT,
    });

    expect(result).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('applies date range filters to the submitted session', async () => {
    const { repository, findMany } = buildRepository();
    const dateFrom = new Date('2026-09-01T00:00:00.000Z');
    const dateTo = new Date('2026-09-30T00:00:00.000Z');

    await repository.listIncidents({ dateFrom, dateTo });

    const where = findMany.mock.calls[0][0].where;
    expect(where.session.date).toEqual({
      gte: dateFrom,
      lte: dateTo,
    });
  });

  it('applies classroom scope filters to the submitted session', async () => {
    const { repository, findMany } = buildRepository();

    await repository.listIncidents({
      scopeType: AttendanceScopeType.CLASSROOM,
      scopeKey: 'classroom:classroom-1',
      classroomId: 'classroom-1',
    });

    const where = findMany.mock.calls[0][0].where;
    expect(where.session).toMatchObject({
      scopeType: AttendanceScopeType.CLASSROOM,
      scopeKey: 'classroom:classroom-1',
      classroomId: 'classroom-1',
    });
  });

  it('summarizes only submitted-session incident entries', async () => {
    const { repository, findMany } = buildRepository();

    await repository.getIncidentSummary({});

    const where = findMany.mock.calls[0][0].where;
    expect(where.session.status).toBe(AttendanceSessionStatus.SUBMITTED);
    expect(where.status.in).toEqual([...ATTENDANCE_INCIDENT_STATUSES]);
  });
});
