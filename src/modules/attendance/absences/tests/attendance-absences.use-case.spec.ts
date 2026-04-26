import {
  AttendanceMode,
  AttendanceScopeType,
  AttendanceSessionStatus,
  AttendanceStatus,
  StudentStatus,
} from '@prisma/client';
import { ListAttendanceAbsencesUseCase } from '../application/list-attendance-absences.use-case';
import { AttendanceAbsencesRepository } from '../infrastructure/attendance-absences.repository';

describe('ListAttendanceAbsencesUseCase', () => {
  function incidentRecord(status: AttendanceStatus, id = status.toLowerCase()) {
    const timestamp = new Date('2026-09-15T07:00:00.000Z');

    return {
      id,
      schoolId: 'school-1',
      sessionId: 'session-1',
      studentId: `student-${id}`,
      enrollmentId: `enrollment-${id}`,
      status,
      lateMinutes: status === AttendanceStatus.LATE ? 8 : null,
      earlyLeaveMinutes: status === AttendanceStatus.EARLY_LEAVE ? 12 : null,
      excuseReason: status === AttendanceStatus.EXCUSED ? 'Medical' : null,
      note: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      student: {
        id: `student-${id}`,
        firstName: 'Layla',
        lastName: id,
        status: StudentStatus.ACTIVE,
      },
      enrollment: {
        id: `enrollment-${id}`,
        classroomId: 'classroom-1',
        classroom: {
          id: 'classroom-1',
          nameAr: 'Classroom AR',
          nameEn: 'Classroom 1A',
          section: {
            id: 'section-1',
            nameAr: 'Section AR',
            nameEn: 'Section A',
            grade: {
              id: 'grade-1',
              nameAr: 'Grade AR',
              nameEn: 'Grade 1',
              stage: {
                id: 'stage-1',
                nameAr: 'Stage AR',
                nameEn: 'Primary',
              },
            },
          },
        },
      },
      session: {
        id: 'session-1',
        schoolId: 'school-1',
        academicYearId: 'year-1',
        termId: 'term-1',
        date: new Date('2026-09-15T00:00:00.000Z'),
        scopeType: AttendanceScopeType.CLASSROOM,
        scopeKey: 'classroom:classroom-1',
        stageId: 'stage-1',
        gradeId: 'grade-1',
        sectionId: 'section-1',
        classroomId: 'classroom-1',
        mode: AttendanceMode.DAILY,
        periodId: null,
        periodKey: 'daily',
        periodLabelAr: null,
        periodLabelEn: null,
        policyId: null,
        status: AttendanceSessionStatus.SUBMITTED,
        submittedAt: timestamp,
        submittedById: 'user-1',
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: null,
        stage: {
          id: 'stage-1',
          nameAr: 'Stage AR',
          nameEn: 'Primary',
        },
        grade: {
          id: 'grade-1',
          nameAr: 'Grade AR',
          nameEn: 'Grade 1',
          stage: {
            id: 'stage-1',
            nameAr: 'Stage AR',
            nameEn: 'Primary',
          },
        },
        section: {
          id: 'section-1',
          nameAr: 'Section AR',
          nameEn: 'Section A',
          grade: {
            id: 'grade-1',
            nameAr: 'Grade AR',
            nameEn: 'Grade 1',
            stage: {
              id: 'stage-1',
              nameAr: 'Stage AR',
              nameEn: 'Primary',
            },
          },
        },
        classroom: {
          id: 'classroom-1',
          nameAr: 'Classroom AR',
          nameEn: 'Classroom 1A',
          section: {
            id: 'section-1',
            nameAr: 'Section AR',
            nameEn: 'Section A',
            grade: {
              id: 'grade-1',
              nameAr: 'Grade AR',
              nameEn: 'Grade 1',
              stage: {
                id: 'stage-1',
                nameAr: 'Stage AR',
                nameEn: 'Primary',
              },
            },
          },
        },
      },
    };
  }

  function repositoryWithIncidents(
    incidents: ReturnType<typeof incidentRecord>[],
  ) {
    return {
      listIncidents: jest.fn().mockResolvedValue(incidents),
    } as unknown as AttendanceAbsencesRepository;
  }

  it('includes absent, late, early-leave, and excused incidents', async () => {
    const repository = repositoryWithIncidents([
      incidentRecord(AttendanceStatus.ABSENT),
      incidentRecord(AttendanceStatus.LATE),
      incidentRecord(AttendanceStatus.EARLY_LEAVE),
      incidentRecord(AttendanceStatus.EXCUSED),
    ]);
    const useCase = new ListAttendanceAbsencesUseCase(repository);

    const result = await useCase.execute({});

    expect(result.items.map((item) => item.status)).toEqual([
      AttendanceStatus.ABSENT,
      AttendanceStatus.LATE,
      AttendanceStatus.EARLY_LEAVE,
      AttendanceStatus.EXCUSED,
    ]);
  });

  it('defensively excludes present and unmarked entries from the response', async () => {
    const repository = repositoryWithIncidents([
      incidentRecord(AttendanceStatus.ABSENT),
      incidentRecord(AttendanceStatus.PRESENT),
      incidentRecord(AttendanceStatus.UNMARKED),
    ]);
    const useCase = new ListAttendanceAbsencesUseCase(repository);

    const result = await useCase.execute({});

    expect(result.items).toHaveLength(1);
    expect(result.items[0].status).toBe(AttendanceStatus.ABSENT);
  });
});
