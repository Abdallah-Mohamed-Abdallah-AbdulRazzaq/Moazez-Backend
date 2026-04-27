import { GradeItemStatus, Prisma } from '@prisma/client';
import {
  presentBulkGradeItems,
  presentGradeItem,
} from '../presenters/grade-item.presenter';

function gradeItemRecord() {
  return {
    id: 'item-1',
    schoolId: 'school-1',
    termId: 'term-1',
    assessmentId: 'assessment-1',
    studentId: 'student-1',
    enrollmentId: 'enrollment-1',
    score: new Prisma.Decimal(17.5),
    status: GradeItemStatus.ENTERED,
    comment: 'Good work',
    enteredById: 'user-1',
    enteredAt: new Date('2026-09-15T08:00:00.000Z'),
    createdAt: new Date('2026-09-15T08:00:00.000Z'),
    updatedAt: new Date('2026-09-15T09:00:00.000Z'),
    student: {
      id: 'student-1',
      firstName: 'Ahmed',
      lastName: 'Ali',
      status: 'ACTIVE',
    },
    enrollment: {
      id: 'enrollment-1',
      schoolId: 'school-1',
      studentId: 'student-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      classroomId: 'classroom-1',
      status: 'ACTIVE',
      enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
      endedAt: null,
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
      updatedAt: new Date('2026-09-01T00:00:00.000Z'),
      student: {
        id: 'student-1',
        firstName: 'Ahmed',
        lastName: 'Ali',
        status: 'ACTIVE',
      },
      classroom: {
        id: 'classroom-1',
        sectionId: 'section-1',
        nameAr: 'Class AR',
        nameEn: 'Class A',
        section: {
          id: 'section-1',
          gradeId: 'grade-1',
          nameAr: 'Section AR',
          nameEn: 'Section A',
          grade: {
            id: 'grade-1',
            stageId: 'stage-1',
            nameAr: 'Grade AR',
            nameEn: 'Grade A',
            stage: {
              id: 'stage-1',
              nameAr: 'Stage AR',
              nameEn: 'Stage A',
            },
          },
        },
      },
    },
  };
}

describe('grade item presenter', () => {
  it('maps a grade item into the frontend response shape', () => {
    expect(presentGradeItem(gradeItemRecord())).toEqual({
      id: 'item-1',
      assessmentId: 'assessment-1',
      studentId: 'student-1',
      enrollmentId: 'enrollment-1',
      student: {
        id: 'student-1',
        fullName: 'Ahmed Ali',
        nameEn: 'Ahmed Ali',
        nameAr: null,
        code: null,
        admissionNo: null,
      },
      score: 17.5,
      status: 'entered',
      comment: 'Good work',
      enteredById: 'user-1',
      enteredAt: '2026-09-15T08:00:00.000Z',
      createdAt: '2026-09-15T08:00:00.000Z',
      updatedAt: '2026-09-15T09:00:00.000Z',
      isVirtualMissing: false,
    });
  });

  it('maps a bulk response without exposing audit details', () => {
    expect(
      presentBulkGradeItems({
        assessmentId: 'assessment-1',
        items: [gradeItemRecord()],
      }),
    ).toMatchObject({
      assessmentId: 'assessment-1',
      updatedCount: 1,
      items: [
        {
          id: 'item-1',
          score: 17.5,
          status: 'entered',
        },
      ],
    });
  });
});
