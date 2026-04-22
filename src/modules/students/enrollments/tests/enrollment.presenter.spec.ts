import { StudentEnrollmentStatus } from '@prisma/client';
import {
  presentEnrollment,
  presentEnrollmentAcademicYear,
} from '../presenters/enrollment.presenter';

describe('enrollment presenter', () => {
  const enrollment = {
    id: 'enrollment-1',
    schoolId: 'school-1',
    studentId: 'student-1',
    academicYearId: 'year-1',
    termId: null,
    classroomId: 'classroom-1',
    status: StudentEnrollmentStatus.ACTIVE,
    enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
    endedAt: null,
    exitReason: null,
    createdAt: new Date('2026-09-01T08:00:00.000Z'),
    updatedAt: new Date('2026-09-01T08:00:00.000Z'),
    deletedAt: null,
    academicYear: {
      id: 'year-1',
      nameAr: 'Academic Year 2026/2027 AR',
      nameEn: 'Academic Year 2026/2027',
      isActive: true,
    },
    classroom: {
      id: 'classroom-1',
      nameAr: 'Demo Classroom 1A AR',
      nameEn: 'Demo Classroom 1A',
      section: {
        id: 'section-1',
        nameAr: 'Demo Section A AR',
        nameEn: 'Demo Section A',
        grade: {
          id: 'grade-1',
          nameAr: 'Demo Grade 1 AR',
          nameEn: 'Demo Grade 1',
        },
      },
    },
  };

  it('presents an enrollment with contract-backed compatibility fields', () => {
    expect(presentEnrollment(enrollment)).toEqual({
      enrollmentId: 'enrollment-1',
      studentId: 'student-1',
      academicYear: 'Academic Year 2026/2027',
      academicYearId: 'year-1',
      grade: 'Demo Grade 1',
      section: 'Demo Section A',
      classroom: 'Demo Classroom 1A',
      gradeId: 'grade-1',
      sectionId: 'section-1',
      classroomId: 'classroom-1',
      enrollmentDate: '2026-09-01',
      status: 'active',
    });
  });

  it('presents enrollment academic year options', () => {
    expect(
      presentEnrollmentAcademicYear({
        id: 'year-1',
        nameAr: 'Academic Year 2026/2027 AR',
        nameEn: 'Academic Year 2026/2027',
        isActive: true,
      }),
    ).toEqual({
      id: 'year-1',
      name: 'Academic Year 2026/2027',
      nameAr: 'Academic Year 2026/2027 AR',
      nameEn: 'Academic Year 2026/2027',
      isActive: true,
    });
  });
});
