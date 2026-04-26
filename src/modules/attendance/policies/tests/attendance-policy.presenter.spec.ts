import {
  AttendanceMode,
  AttendanceScopeType,
  DailyComputationStrategy,
} from '@prisma/client';
import { presentAttendancePolicy } from '../presenters/attendance-policy.presenter';

describe('attendance policy presenter', () => {
  it('presents foundation policy fields with handoff aliases', () => {
    const policy = {
      id: 'policy-1',
      schoolId: 'school-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      scopeType: AttendanceScopeType.GRADE,
      scopeKey: 'grade:grade-1',
      stageId: 'stage-1',
      gradeId: 'grade-1',
      sectionId: null,
      classroomId: null,
      nameAr: 'Policy AR',
      nameEn: 'Policy EN',
      descriptionAr: null,
      descriptionEn: 'Description',
      notes: 'Internal note',
      mode: AttendanceMode.PERIOD,
      dailyComputationStrategy: DailyComputationStrategy.MANUAL,
      requireExcuseAttachment: true,
      allowParentExcuseRequests: false,
      notifyGuardiansOnAbsence: true,
      effectiveFrom: new Date('2026-09-01T00:00:00.000Z'),
      effectiveTo: new Date('2026-12-31T00:00:00.000Z'),
      isActive: true,
      createdAt: new Date('2026-04-26T09:00:00.000Z'),
      updatedAt: new Date('2026-04-26T10:00:00.000Z'),
      deletedAt: null,
    };

    expect(presentAttendancePolicy(policy)).toEqual(
      expect.objectContaining({
        id: 'policy-1',
        academicYearId: 'year-1',
        yearId: 'year-1',
        termId: 'term-1',
        scopeType: AttendanceScopeType.GRADE,
        scopeKey: 'grade:grade-1',
        scopeIds: {
          stageId: 'stage-1',
          gradeId: 'grade-1',
          sectionId: null,
          classroomId: null,
        },
        requireExcuseAttachment: true,
        requireAttachmentForExcuse: true,
        allowParentExcuseRequests: false,
        allowExcuses: false,
        notifyGuardiansOnAbsence: true,
        notifyGuardians: true,
        notifyOnAbsent: true,
        effectiveFrom: '2026-09-01',
        effectiveStartDate: '2026-09-01',
        effectiveTo: '2026-12-31',
        effectiveEndDate: '2026-12-31',
      }),
    );
  });
});
