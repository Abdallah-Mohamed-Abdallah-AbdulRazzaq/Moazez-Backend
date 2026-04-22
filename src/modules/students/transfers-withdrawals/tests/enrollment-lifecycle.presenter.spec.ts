import { StudentEnrollmentStatus } from '@prisma/client';
import { presentEnrollmentMovement } from '../presenters/enrollment-lifecycle.presenter';

function buildEnrollmentRecord(overrides?: Partial<{
  id: string;
  studentId: string;
  academicYearId: string;
  academicYearName: string;
  classroomId: string;
  classroomName: string;
  sectionId: string;
  sectionName: string;
  gradeId: string;
  gradeName: string;
  status: StudentEnrollmentStatus;
  enrolledAt: Date;
  endedAt: Date | null;
}> ) {
  return {
    id: overrides?.id ?? 'enrollment-1',
    schoolId: 'school-1',
    studentId: overrides?.studentId ?? 'student-1',
    academicYearId: overrides?.academicYearId ?? 'year-1',
    termId: null,
    classroomId: overrides?.classroomId ?? 'classroom-1',
    status: overrides?.status ?? StudentEnrollmentStatus.ACTIVE,
    enrolledAt: overrides?.enrolledAt ?? new Date('2026-09-01T00:00:00.000Z'),
    endedAt: overrides?.endedAt ?? null,
    exitReason: null,
    createdAt: new Date('2026-09-01T08:00:00.000Z'),
    updatedAt: new Date('2026-09-01T08:00:00.000Z'),
    deletedAt: null,
    academicYear: {
      id: overrides?.academicYearId ?? 'year-1',
      nameAr: `${overrides?.academicYearName ?? 'Academic Year 2026/2027'} AR`,
      nameEn: overrides?.academicYearName ?? 'Academic Year 2026/2027',
      isActive: true,
    },
    classroom: {
      id: overrides?.classroomId ?? 'classroom-1',
      nameAr: `${overrides?.classroomName ?? 'Demo Classroom A'} AR`,
      nameEn: overrides?.classroomName ?? 'Demo Classroom A',
      section: {
        id: overrides?.sectionId ?? 'section-1',
        nameAr: `${overrides?.sectionName ?? 'Demo Section A'} AR`,
        nameEn: overrides?.sectionName ?? 'Demo Section A',
        grade: {
          id: overrides?.gradeId ?? 'grade-1',
          nameAr: `${overrides?.gradeName ?? 'Demo Grade 1'} AR`,
          nameEn: overrides?.gradeName ?? 'Demo Grade 1',
        },
      },
    },
  };
}

describe('enrollment lifecycle presenter', () => {
  it('presents a transfer movement with from/to placement details', () => {
    const fromEnrollment = buildEnrollmentRecord();
    const toEnrollment = buildEnrollmentRecord({
      id: 'enrollment-2',
      classroomId: 'classroom-2',
      classroomName: 'Demo Classroom B',
      sectionId: 'section-2',
      sectionName: 'Demo Section B',
      gradeId: 'grade-1',
      gradeName: 'Demo Grade 1',
      enrolledAt: new Date('2026-03-15T00:00:00.000Z'),
    });

    expect(
      presentEnrollmentMovement({
        id: 'enrollment-2',
        actionType: 'transferred_internal',
        fromEnrollment,
        toEnrollment,
        effectiveDate: new Date('2026-03-15T00:00:00.000Z'),
        reason: 'Capacity balancing',
        notes: '  moved mid-year  ',
        sourceRequestId: 'request-1',
        createdAt: new Date('2026-03-15T10:00:00.000Z'),
      }),
    ).toEqual({
      id: 'enrollment-2',
      studentId: 'student-1',
      academicYear: 'Academic Year 2026/2027',
      actionType: 'transferred_internal',
      fromGradeId: 'grade-1',
      fromSectionId: 'section-1',
      fromClassroomId: 'classroom-1',
      toGradeId: 'grade-1',
      toSectionId: 'section-2',
      toClassroomId: 'classroom-2',
      fromGrade: 'Demo Grade 1',
      fromSection: 'Demo Section A',
      fromClassroom: 'Demo Classroom A',
      toGrade: 'Demo Grade 1',
      toSection: 'Demo Section B',
      toClassroom: 'Demo Classroom B',
      effectiveDate: '2026-03-15',
      reason: 'Capacity balancing',
      notes: 'moved mid-year',
      sourceRequestId: 'request-1',
      createdAt: '2026-03-15T10:00:00.000Z',
    });
  });

  it('presents a withdrawal movement without destination placement details', () => {
    const fromEnrollment = buildEnrollmentRecord({
      status: StudentEnrollmentStatus.WITHDRAWN,
      endedAt: new Date('2026-03-20T00:00:00.000Z'),
    });

    expect(
      presentEnrollmentMovement({
        id: 'enrollment-1',
        actionType: 'withdrawn',
        fromEnrollment,
        effectiveDate: new Date('2026-03-20T00:00:00.000Z'),
        reason: 'Family relocation',
        notes: '',
        createdAt: new Date('2026-03-20T09:00:00.000Z'),
      }),
    ).toEqual({
      id: 'enrollment-1',
      studentId: 'student-1',
      academicYear: 'Academic Year 2026/2027',
      actionType: 'withdrawn',
      fromGradeId: 'grade-1',
      fromSectionId: 'section-1',
      fromClassroomId: 'classroom-1',
      toGradeId: null,
      toSectionId: null,
      toClassroomId: null,
      fromGrade: 'Demo Grade 1',
      fromSection: 'Demo Section A',
      fromClassroom: 'Demo Classroom A',
      toGrade: null,
      toSection: null,
      toClassroom: null,
      effectiveDate: '2026-03-20',
      reason: 'Family relocation',
      notes: null,
      sourceRequestId: null,
      createdAt: '2026-03-20T09:00:00.000Z',
    });
  });
});
