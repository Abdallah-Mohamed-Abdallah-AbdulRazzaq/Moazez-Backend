import {
  BehaviorRecordStatus,
  BehaviorRecordType,
  BehaviorSeverity,
  StudentEnrollmentStatus,
  StudentStatus,
  UserType,
} from '@prisma/client';
import {
  presentBehaviorRecord,
  presentBehaviorRecordList,
} from '../presenters/behavior-records.presenter';

const NOW = new Date('2026-04-30T12:00:00.000Z');

describe('Behavior record presenter', () => {
  it('maps enums to lowercase and never exposes schoolId', () => {
    const result = presentBehaviorRecord(record());

    expect(result).toMatchObject({
      id: 'record-1',
      type: 'positive',
      severity: 'high',
      status: 'submitted',
      student: {
        id: 'student-1',
        displayName: 'Alya Hassan',
        status: 'active',
      },
      category: {
        id: 'category-1',
        type: 'positive',
        defaultSeverity: 'high',
      },
      createdBy: {
        id: 'user-1',
        userType: 'school_user',
      },
    });
    expect(JSON.stringify(result)).not.toContain('schoolId');
    expect(result).not.toHaveProperty('deletedAt');
  });

  it('returns null consistently for absent optional relations and dates', () => {
    const result = presentBehaviorRecord(
      record({
        termId: null,
        enrollmentId: null,
        categoryId: null,
        submittedById: null,
        submittedAt: null,
        term: null,
        enrollment: null,
        category: null,
        submittedBy: null,
      }),
    );

    expect(result).toMatchObject({
      termId: null,
      enrollmentId: null,
      categoryId: null,
      submittedById: null,
      submittedAt: null,
      term: null,
      enrollment: null,
      category: null,
      submittedBy: null,
    });
  });

  it('presents list summary and pagination metadata', () => {
    const result = presentBehaviorRecordList({
      items: [record()],
      total: 1,
      limit: 25,
      offset: 0,
      summary: {
        total: 1,
        draft: 0,
        submitted: 1,
        approved: 0,
        rejected: 0,
        cancelled: 0,
        positive: 1,
        negative: 0,
      },
    });

    expect(result).toMatchObject({
      total: 1,
      limit: 25,
      offset: 0,
      summary: {
        submitted: 1,
        positive: 1,
      },
      items: [{ id: 'record-1', status: 'submitted' }],
    });
  });

  function record(overrides?: Record<string, unknown>) {
    return {
      id: 'record-1',
      schoolId: 'school-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      studentId: 'student-1',
      enrollmentId: 'enrollment-1',
      categoryId: 'category-1',
      type: BehaviorRecordType.POSITIVE,
      severity: BehaviorSeverity.HIGH,
      status: BehaviorRecordStatus.SUBMITTED,
      titleEn: 'Helpful act',
      titleAr: null,
      noteEn: 'Helped a classmate',
      noteAr: null,
      points: 5,
      occurredAt: NOW,
      createdById: 'user-1',
      submittedById: 'user-1',
      submittedAt: NOW,
      reviewedById: null,
      reviewedAt: null,
      cancelledById: null,
      cancelledAt: null,
      reviewNoteEn: null,
      reviewNoteAr: null,
      cancellationReasonEn: null,
      cancellationReasonAr: null,
      metadata: { visible: true },
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
      academicYear: {
        id: 'year-1',
        nameEn: '2026/2027',
        nameAr: '2026/2027 AR',
        startDate: NOW,
        endDate: NOW,
        isActive: true,
      },
      term: {
        id: 'term-1',
        academicYearId: 'year-1',
        nameEn: 'Term 1',
        nameAr: 'Term 1 AR',
        startDate: NOW,
        endDate: NOW,
        isActive: true,
      },
      student: {
        id: 'student-1',
        firstName: 'Alya',
        lastName: 'Hassan',
        status: StudentStatus.ACTIVE,
      },
      enrollment: {
        id: 'enrollment-1',
        studentId: 'student-1',
        academicYearId: 'year-1',
        termId: 'term-1',
        classroomId: 'classroom-1',
        status: StudentEnrollmentStatus.ACTIVE,
        classroom: {
          id: 'classroom-1',
          nameEn: 'Classroom 1',
          nameAr: 'Classroom 1 AR',
          section: {
            id: 'section-1',
            nameEn: 'Section A',
            nameAr: 'Section A AR',
            grade: {
              id: 'grade-1',
              nameEn: 'Grade 1',
              nameAr: 'Grade 1 AR',
            },
          },
        },
      },
      category: {
        id: 'category-1',
        code: 'HELPFUL_ACT',
        nameEn: 'Helpful act',
        nameAr: null,
        type: BehaviorRecordType.POSITIVE,
        defaultSeverity: BehaviorSeverity.HIGH,
        defaultPoints: 5,
        isActive: true,
        deletedAt: null,
      },
      createdBy: user(),
      submittedBy: user(),
      reviewedBy: null,
      cancelledBy: null,
      ...overrides,
    } as never;
  }

  function user() {
    return {
      id: 'user-1',
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@example.com',
      userType: UserType.SCHOOL_USER,
    };
  }
});
