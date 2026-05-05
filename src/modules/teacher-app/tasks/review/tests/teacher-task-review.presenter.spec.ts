import {
  FileVisibility,
  Prisma,
  ReinforcementProofType,
  ReinforcementRewardType,
  ReinforcementReviewOutcome,
  ReinforcementSource,
  ReinforcementSubmissionStatus,
  ReinforcementTaskStatus,
  StudentEnrollmentStatus,
  StudentStatus,
} from '@prisma/client';
import type { TeacherAppAllocationRecord } from '../../../shared/teacher-app.types';
import type { TeacherTaskReviewSubmissionRecord } from '../infrastructure/teacher-task-review-read.adapter';
import { TeacherTaskReviewPresenter } from '../presenters/teacher-task-review.presenter';

describe('TeacherTaskReviewPresenter', () => {
  it('presents safe review queue cards and detail without tenant or storage internals', () => {
    const submission = submissionFixture();
    const allocation = allocationFixture();

    const queue = TeacherTaskReviewPresenter.presentQueue({
      submissions: [submission],
      allocations: [allocation],
      pagination: { page: 1, limit: 20, total: 1 },
    });
    const detail = TeacherTaskReviewPresenter.presentDetail({
      submission,
      allocations: [allocation],
    });
    const json = JSON.stringify({ queue, detail });

    expect(queue.items[0]).toMatchObject({
      submissionId: 'submission-1',
      taskId: 'task-1',
      taskTitle: 'Practice kindness',
      class: {
        classId: 'allocation-1',
        subjectName: 'Math',
      },
      student: {
        studentId: 'student-1',
        displayName: 'Mona Ahmed',
      },
      proof: {
        file: expect.objectContaining({
          id: 'file-1',
          downloadPath: '/api/v1/files/file-1/download',
        }),
      },
      review: {
        status: 'approved',
        comment: 'Great',
      },
    });
    expect(detail.submission.reviewHistory).toEqual([
      {
        id: 'review-1',
        outcome: 'approved',
        comment: 'Great',
        reviewedAt: '2026-09-16T10:30:00.000Z',
      },
    ]);
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('scheduleId');
    expect(json).not.toContain('bucket');
    expect(json).not.toContain('objectKey');
    expect(json).not.toContain('metadata');
    expect(json).not.toContain('BehaviorPointLedger');
    expect(json).not.toContain('behaviorPoint');
  });
});

function allocationFixture(): TeacherAppAllocationRecord {
  const schoolId = 'school-1';
  return {
    id: 'allocation-1',
    schoolId,
    teacherUserId: 'teacher-1',
    subjectId: 'subject-1',
    classroomId: 'classroom-1',
    termId: 'term-1',
    subject: {
      id: 'subject-1',
      schoolId,
      nameAr: 'Math AR',
      nameEn: 'Math',
      code: 'MATH',
    },
    classroom: {
      id: 'classroom-1',
      schoolId,
      sectionId: 'section-1',
      roomId: null,
      nameAr: 'Classroom AR',
      nameEn: 'Classroom',
      room: null,
      section: {
        id: 'section-1',
        schoolId,
        gradeId: 'grade-1',
        nameAr: 'Section AR',
        nameEn: 'Section',
        grade: {
          id: 'grade-1',
          schoolId,
          stageId: 'stage-1',
          nameAr: 'Grade AR',
          nameEn: 'Grade',
          stage: {
            id: 'stage-1',
            schoolId,
            nameAr: 'Stage AR',
            nameEn: 'Stage',
          },
        },
      },
    },
    term: {
      id: 'term-1',
      schoolId,
      academicYearId: 'year-1',
      nameAr: 'Term AR',
      nameEn: 'Term',
      isActive: true,
    },
  };
}

function submissionFixture(): TeacherTaskReviewSubmissionRecord {
  const submittedAt = new Date('2026-09-16T10:00:00.000Z');
  const reviewedAt = new Date('2026-09-16T10:30:00.000Z');
  const review = {
    id: 'review-1',
    outcome: ReinforcementReviewOutcome.APPROVED,
    note: 'Great',
    noteAr: null,
    reviewedAt,
  };

  return {
    id: 'submission-1',
    assignmentId: 'assignment-1',
    taskId: 'task-1',
    stageId: 'stage-1',
    studentId: 'student-1',
    enrollmentId: 'enrollment-1',
    status: ReinforcementSubmissionStatus.APPROVED,
    proofFileId: 'file-1',
    proofText: 'Proof text',
    submittedAt,
    reviewedAt,
    createdAt: submittedAt,
    updatedAt: reviewedAt,
    task: {
      id: 'task-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      subjectId: 'subject-1',
      titleEn: 'Practice kindness',
      titleAr: null,
      source: ReinforcementSource.TEACHER,
      status: ReinforcementTaskStatus.UNDER_REVIEW,
      rewardType: ReinforcementRewardType.MORAL,
      rewardValue: new Prisma.Decimal(10),
      rewardLabelEn: 'Certificate',
      rewardLabelAr: null,
      dueDate: null,
      subject: {
        id: 'subject-1',
        nameAr: 'Math AR',
        nameEn: 'Math',
        code: 'MATH',
      },
    },
    stage: {
      id: 'stage-1',
      taskId: 'task-1',
      sortOrder: 1,
      titleEn: 'Upload proof',
      titleAr: null,
      proofType: ReinforcementProofType.IMAGE,
      requiresApproval: true,
    },
    assignment: {
      id: 'assignment-1',
      status: ReinforcementTaskStatus.UNDER_REVIEW,
      progress: 50,
      assignedAt: submittedAt,
      completedAt: null,
    },
    student: {
      id: 'student-1',
      firstName: 'Mona',
      lastName: 'Ahmed',
      status: StudentStatus.ACTIVE,
    },
    enrollment: {
      id: 'enrollment-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      classroomId: 'classroom-1',
      status: StudentEnrollmentStatus.ACTIVE,
      classroom: {
        id: 'classroom-1',
        nameAr: 'Classroom AR',
        nameEn: 'Classroom',
        section: {
          id: 'section-1',
          nameAr: 'Section AR',
          nameEn: 'Section',
          grade: {
            id: 'grade-1',
            nameAr: 'Grade AR',
            nameEn: 'Grade',
            stage: {
              id: 'stage-1',
              nameAr: 'Stage AR',
              nameEn: 'Stage',
            },
          },
        },
      },
    },
    proofFile: {
      id: 'file-1',
      originalName: 'proof.png',
      mimeType: 'image/png',
      sizeBytes: BigInt(1234),
      visibility: FileVisibility.PRIVATE,
      createdAt: submittedAt,
    },
    currentReview: review,
    reviews: [review],
  } as TeacherTaskReviewSubmissionRecord;
}
