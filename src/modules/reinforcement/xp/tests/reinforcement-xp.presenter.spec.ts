import {
  ReinforcementTargetScope,
  XpSourceType,
} from '@prisma/client';
import {
  presentDefaultXpPolicy,
  presentXpLedgerEntry,
  presentXpPolicy,
  presentXpSummary,
} from '../presenters/reinforcement-xp.presenter';

describe('reinforcement XP presenters', () => {
  it('maps policy enums to frontend strings', () => {
    const response = presentXpPolicy(policyRecord());

    expect(response).toMatchObject({
      id: 'policy-1',
      scopeType: 'classroom',
      dailyCap: 100,
      isDefault: false,
    });
    expect(response.createdAt).toBe('2026-04-29T10:00:00.000Z');
  });

  it('maps default effective policy responses', () => {
    const response = presentDefaultXpPolicy({
      academicYearId: 'year-1',
      termId: 'term-1',
      scope: {
        scopeType: ReinforcementTargetScope.SCHOOL,
        scopeKey: 'school-1',
        stageId: null,
        gradeId: null,
        sectionId: null,
        classroomId: null,
        studentId: null,
      },
    });

    expect(response).toMatchObject({
      id: null,
      scopeType: 'school',
      dailyCap: null,
      isDefault: true,
    });
  });

  it('maps ledger source enums and student summaries', () => {
    const response = presentXpLedgerEntry(ledgerRecord());

    expect(response.sourceType).toBe('manual_bonus');
    expect(response.student).toMatchObject({
      id: 'student-1',
      name: 'Student One',
      classroomName: 'Classroom 1',
      stageName: 'Stage 1',
    });
  });

  it('maps summary responses', () => {
    const response = presentXpSummary({
      academicYearId: 'year-1',
      termId: 'term-1',
      scope: {
        scopeType: ReinforcementTargetScope.STUDENT,
        scopeKey: 'student-1',
        stageId: 'stage-1',
        gradeId: 'grade-1',
        sectionId: 'section-1',
        classroomId: 'classroom-1',
        studentId: 'student-1',
      },
      summary: {
        totalXp: 30,
        studentsCount: 2,
        averageXp: 15,
        bySourceType: [{ sourceType: 'manual_bonus', amount: 30 }],
        topStudents: [
          { studentId: 'student-1', studentName: 'Student One', totalXp: 20 },
        ],
      },
    });

    expect(response.scope.scopeType).toBe('student');
    expect(response.averageXp).toBe(15);
    expect(response.bySourceType[0]).toEqual({
      sourceType: 'manual_bonus',
      amount: 30,
    });
  });

  function policyRecord() {
    const now = new Date('2026-04-29T10:00:00.000Z');
    return {
      id: 'policy-1',
      schoolId: 'school-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      scopeType: ReinforcementTargetScope.CLASSROOM,
      scopeKey: 'classroom-1',
      dailyCap: 100,
      weeklyCap: 500,
      cooldownMinutes: 10,
      allowedReasons: ['manual_bonus'],
      startsAt: null,
      endsAt: null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    } as never;
  }

  function ledgerRecord() {
    const now = new Date('2026-04-29T10:00:00.000Z');
    return {
      id: 'ledger-1',
      schoolId: 'school-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      studentId: 'student-1',
      enrollmentId: 'enrollment-1',
      assignmentId: null,
      policyId: 'policy-1',
      sourceType: XpSourceType.MANUAL_BONUS,
      sourceId: 'manual-1',
      amount: 10,
      reason: 'Great work',
      reasonAr: null,
      actorUserId: 'actor-1',
      occurredAt: now,
      metadata: null,
      createdAt: now,
      updatedAt: now,
      student: {
        id: 'student-1',
        firstName: 'Student',
        lastName: 'One',
        status: 'ACTIVE',
        deletedAt: null,
      },
      enrollment: {
        id: 'enrollment-1',
        studentId: 'student-1',
        academicYearId: 'year-1',
        termId: 'term-1',
        classroomId: 'classroom-1',
        status: 'ACTIVE',
        deletedAt: null,
        classroom: {
          id: 'classroom-1',
          nameAr: 'Classroom AR',
          nameEn: 'Classroom 1',
          sectionId: 'section-1',
          section: {
            id: 'section-1',
            nameAr: 'Section AR',
            nameEn: 'Section 1',
            gradeId: 'grade-1',
            grade: {
              id: 'grade-1',
              nameAr: 'Grade AR',
              nameEn: 'Grade 1',
              stageId: 'stage-1',
              stage: {
                id: 'stage-1',
                nameAr: 'Stage AR',
                nameEn: 'Stage 1',
              },
            },
          },
        },
      },
    } as never;
  }
});
