import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import { TimetableAttendancePeriodReferenceService } from '../../../academics/timetable/application/timetable-attendance-period-reference.service';

export async function assertAttendancePolicySelectedPeriodsReferenceTimetable(
  timetablePeriodReferences: TimetableAttendancePeriodReferenceService,
  input: {
    academicYearId: string;
    termId: string;
    selectedPeriodIds: string[];
  },
): Promise<void> {
  if (input.selectedPeriodIds.length === 0) {
    return;
  }

  const validPeriodIds =
    await timetablePeriodReferences.findValidPeriodIdsForAttendanceContext({
      academicYearId: input.academicYearId,
      termId: input.termId,
      periodIds: input.selectedPeriodIds,
    });
  const invalidPeriodIds = input.selectedPeriodIds.filter(
    (periodId) => !validPeriodIds.has(periodId),
  );

  if (invalidPeriodIds.length > 0) {
    throw new ValidationDomainException(
      'Attendance policy selected periods must reference timetable periods in the policy academic context',
      {
        field: 'selectedPeriodIds',
        invalidPeriodIds,
        reason: 'not_found_or_outside_context',
      },
    );
  }
}
