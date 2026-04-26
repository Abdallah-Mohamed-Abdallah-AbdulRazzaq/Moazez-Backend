import {
  AttendanceMode,
  AttendanceScopeType,
  AttendanceSessionStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { AttendanceReportsRepository } from '../infrastructure/attendance-reports.repository';

describe('AttendanceReportsRepository', () => {
  function buildRepository() {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const scoped = {
      attendanceEntry: {
        findMany,
      },
      attendanceSession: {
        count,
      },
    };
    const prisma = { scoped } as unknown as PrismaService;
    const repository = new AttendanceReportsRepository(prisma);

    return { repository, findMany, count };
  }

  it('gets summary from submitted sessions only', async () => {
    const { repository, findMany, count } = buildRepository();

    await repository.getSummary({});

    expect(count.mock.calls[0][0].where).toMatchObject({
      status: AttendanceSessionStatus.SUBMITTED,
      deletedAt: null,
    });
    expect(findMany.mock.calls[0][0].where.session).toMatchObject({
      status: AttendanceSessionStatus.SUBMITTED,
      deletedAt: null,
    });
  });

  it('does not allow draft sessions to affect summary queries', async () => {
    const { repository, findMany, count } = buildRepository();

    await repository.getSummary({
      dateFrom: new Date('2026-09-01T00:00:00.000Z'),
      dateTo: new Date('2026-09-30T00:00:00.000Z'),
    });

    expect(count.mock.calls[0][0].where.status).toBe(
      AttendanceSessionStatus.SUBMITTED,
    );
    expect(findMany.mock.calls[0][0].where.session.status).toBe(
      AttendanceSessionStatus.SUBMITTED,
    );
  });

  it('applies report filters to submitted sessions', async () => {
    const { repository, findMany } = buildRepository();
    const date = new Date('2026-09-15T00:00:00.000Z');

    await repository.getDailyTrend({
      academicYearId: 'year-1',
      termId: 'term-1',
      date,
      scopeType: AttendanceScopeType.CLASSROOM,
      scopeKey: 'classroom:classroom-1',
      classroomId: 'classroom-1',
      mode: AttendanceMode.PERIOD,
      periodKey: 'period-1',
    });

    expect(findMany.mock.calls[0][0].where.session).toMatchObject({
      status: AttendanceSessionStatus.SUBMITTED,
      deletedAt: null,
      academicYearId: 'year-1',
      termId: 'term-1',
      date,
      scopeType: AttendanceScopeType.CLASSROOM,
      scopeKey: 'classroom:classroom-1',
      classroomId: 'classroom-1',
      mode: AttendanceMode.PERIOD,
      periodKey: 'period-1',
    });
  });

  it('gets scope breakdown from submitted sessions only', async () => {
    const { repository, findMany } = buildRepository();

    await repository.getScopeBreakdown({});

    expect(findMany.mock.calls[0][0].where.session).toMatchObject({
      status: AttendanceSessionStatus.SUBMITTED,
      deletedAt: null,
    });
  });
});
