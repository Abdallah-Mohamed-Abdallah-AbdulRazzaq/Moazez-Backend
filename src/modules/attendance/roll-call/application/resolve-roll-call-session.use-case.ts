import { Injectable } from '@nestjs/common';
import { AttendanceMode, Prisma } from '@prisma/client';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import { TimetableAttendancePeriodReferenceService } from '../../../academics/timetable/application/timetable-attendance-period-reference.service';
import { requireAttendanceScope } from '../../attendance-context';
import {
  buildEffectiveScopeCandidates,
  selectEffectivePolicy,
} from '../../policies/domain/policy-scope';
import { ResolveRollCallSessionDto } from '../dto/attendance-roll-call.dto';
import {
  normalizeAttendancePeriodKey,
  parseAttendanceDate,
} from '../domain/session-key';
import {
  assertPeriodAllowedByEffectivePolicyForNewSession,
  normalizeRollCallPeriodId,
} from '../domain/policy-period-selection';
import { AttendanceRollCallRepository } from '../infrastructure/attendance-roll-call.repository';
import { presentRollCallSession } from '../presenters/attendance-roll-call.presenter';
import {
  assertRollCallTermWritable,
  buildRollCallSessionCreateData,
  resolveRollCallAcademicYearId,
  resolveRollCallScope,
  validateRollCallAcademicContext,
} from './roll-call-use-case.helpers';

@Injectable()
export class ResolveRollCallSessionUseCase {
  constructor(
    private readonly attendanceRollCallRepository: AttendanceRollCallRepository,
    private readonly timetablePeriodReferences: TimetableAttendancePeriodReferenceService,
  ) {}

  async execute(command: ResolveRollCallSessionDto) {
    const attendanceScope = requireAttendanceScope();
    const academicYearId = resolveRollCallAcademicYearId(command);
    const { term } = await validateRollCallAcademicContext(
      this.attendanceRollCallRepository,
      academicYearId,
      command.termId,
    );

    const date = parseAttendanceDate(command.date, 'date');
    const scope = await resolveRollCallScope(
      this.attendanceRollCallRepository,
      command,
    );
    const periodKey = normalizeAttendancePeriodKey({
      mode: command.mode,
      periodKey: command.periodKey,
    });

    const existing = await this.attendanceRollCallRepository.findSessionByKey({
      academicYearId,
      termId: command.termId,
      date,
      scopeType: scope.scopeType,
      scopeKey: scope.scopeKey,
      mode: command.mode,
      periodKey,
    });
    if (existing) {
      return presentRollCallSession(existing);
    }

    assertRollCallTermWritable(term);

    const candidates = buildEffectiveScopeCandidates(scope);
    const policies =
      await this.attendanceRollCallRepository.findEffectivePolicyCandidates({
        academicYearId,
        termId: command.termId,
        candidates,
        date,
    });
    const policy = selectEffectivePolicy(policies, candidates, date);
    assertPeriodAllowedByEffectivePolicyForNewSession({
      mode: command.mode,
      periodId: command.periodId,
      effectivePolicy: policy,
    });
    await this.assertSuppliedPeriodIdReferencesTimetable({
      academicYearId,
      termId: command.termId,
      mode: command.mode,
      periodId: command.periodId,
    });

    try {
      const session = await this.attendanceRollCallRepository.createSession(
        buildRollCallSessionCreateData({
          schoolId: attendanceScope.schoolId,
          academicYearId,
          termId: command.termId,
          date,
          scope,
          command,
          periodKey,
          policyId: policy?.id ?? null,
        }),
      );

      return presentRollCallSession(session);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const session = await this.attendanceRollCallRepository.findSessionByKey(
          {
            academicYearId,
            termId: command.termId,
            date,
            scopeType: scope.scopeType,
            scopeKey: scope.scopeKey,
            mode: command.mode,
            periodKey,
          },
        );
        if (session) {
          return presentRollCallSession(session);
        }
      }

      throw error;
    }
  }

  private async assertSuppliedPeriodIdReferencesTimetable(input: {
    academicYearId: string;
    termId: string;
    mode: AttendanceMode;
    periodId?: string | null;
  }): Promise<void> {
    if (input.mode !== AttendanceMode.PERIOD) {
      return;
    }

    const periodId = normalizeRollCallPeriodId(input.periodId);
    if (!periodId) {
      return;
    }

    const isValid =
      await this.timetablePeriodReferences.isPeriodValidForAttendanceContext({
        academicYearId: input.academicYearId,
        termId: input.termId,
        periodId,
      });

    if (!isValid) {
      throw new ValidationDomainException(
        'Attendance roll-call periodId must reference a timetable period in the academic context',
        {
          field: 'periodId',
          mode: input.mode,
          periodId,
          reason: 'not_found_or_outside_context',
        },
      );
    }
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}
