import {
  FileVisibility,
  Prisma,
  ReinforcementProofType,
  ReinforcementReviewOutcome,
  ReinforcementRewardType,
  ReinforcementSource,
  ReinforcementSubmissionStatus,
  ReinforcementTaskStatus,
  StudentEnrollmentStatus,
  StudentStatus,
} from '@prisma/client';
import {
  presentReinforcementReviewItem,
  presentReinforcementReviewItemDetail,
} from '../presenters/reinforcement-review.presenter';

describe('reinforcement review presenter', () => {
  it('maps statuses, outcomes, and proof fields to frontend-friendly strings', () => {
    const item = reviewItem();

    expect(presentReinforcementReviewItem(item)).toMatchObject({
      id: 'submission-1',
      status: 'submitted',
      task: {
        source: 'teacher',
        reward: { type: 'xp', value: 10 },
      },
      stage: {
        proofType: 'image',
      },
      assignment: {
        status: 'under_review',
        progress: 50,
      },
      proof: {
        proofText: 'Photo proof',
        proofFileId: 'file-1',
        file: {
          id: 'file-1',
          sizeBytes: '1234',
          visibility: 'private',
        },
      },
    });

    expect(presentReinforcementReviewItemDetail(item)).toMatchObject({
      currentReview: {
        id: 'review-1',
        outcome: 'approved',
      },
      reviewHistory: [{ id: 'review-1', outcome: 'approved' }],
    });
  });

  function reviewItem() {
    const now = new Date('2026-04-29T08:00:00.000Z');
    const review = {
      id: 'review-1',
      submissionId: 'submission-1',
      assignmentId: 'assignment-1',
      taskId: 'task-1',
      stageId: 'stage-1',
      studentId: 'student-1',
      reviewedById: 'reviewer-1',
      outcome: ReinforcementReviewOutcome.APPROVED,
      note: 'Good work',
      noteAr: null,
      reviewedAt: now,
      metadata: null,
      createdAt: now,
      updatedAt: now,
    };

    return {
      id: 'submission-1',
      schoolId: 'school-1',
      assignmentId: 'assignment-1',
      taskId: 'task-1',
      stageId: 'stage-1',
      studentId: 'student-1',
      enrollmentId: 'enrollment-1',
      status: ReinforcementSubmissionStatus.SUBMITTED,
      proofFileId: 'file-1',
      proofText: 'Photo proof',
      submittedById: 'submitter-1',
      submittedAt: now,
      currentReviewId: 'review-1',
      reviewedAt: now,
      metadata: null,
      createdAt: now,
      updatedAt: now,
      proofFile: {
        id: 'file-1',
        originalName: 'proof.png',
        mimeType: 'image/png',
        sizeBytes: BigInt(1234),
        visibility: FileVisibility.PRIVATE,
        createdAt: now,
      },
      task: {
        id: 'task-1',
        academicYearId: 'year-1',
        termId: 'term-1',
        subjectId: null,
        titleEn: 'Read daily',
        titleAr: null,
        source: ReinforcementSource.TEACHER,
        status: ReinforcementTaskStatus.IN_PROGRESS,
        rewardType: ReinforcementRewardType.XP,
        rewardValue: new Prisma.Decimal(10),
        rewardLabelEn: '10 XP',
        rewardLabelAr: null,
        dueDate: null,
        deletedAt: null,
      },
      stage: {
        id: 'stage-1',
        taskId: 'task-1',
        sortOrder: 1,
        titleEn: 'Upload proof',
        titleAr: null,
        descriptionEn: null,
        descriptionAr: null,
        proofType: ReinforcementProofType.IMAGE,
        requiresApproval: true,
        deletedAt: null,
      },
      assignment: {
        id: 'assignment-1',
        taskId: 'task-1',
        academicYearId: 'year-1',
        termId: 'term-1',
        studentId: 'student-1',
        enrollmentId: 'enrollment-1',
        status: ReinforcementTaskStatus.UNDER_REVIEW,
        progress: 50,
        assignedAt: now,
        startedAt: now,
        completedAt: null,
        cancelledAt: null,
        createdAt: now,
        updatedAt: now,
        task: {
          id: 'task-1',
          status: ReinforcementTaskStatus.IN_PROGRESS,
          deletedAt: null,
        },
      },
      student: {
        id: 'student-1',
        firstName: 'Student',
        lastName: 'One',
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
              stageId: 'stage-academic-1',
              stage: {
                id: 'stage-academic-1',
                nameAr: 'Stage AR',
                nameEn: 'Stage 1',
              },
            },
          },
        },
      },
      currentReview: review,
      reviews: [review],
    } as never;
  }
});
