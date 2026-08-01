import {
  ReinforcementProofType,
  ReinforcementSubmissionStatus,
  ReinforcementTaskStatus,
} from '@prisma/client';
import {
  assertAssignmentCanSubmit,
  assertDeclaredProofMimeAllowed,
  assertProofPayloadMatchesProofType,
  assertReviewNoteForRejection,
  assertStageBelongsToTask,
  assertSubmissionCanBeSubmitted,
  assertSubmissionReviewable,
  calculateAssignmentProgress,
  deriveAssignmentStatusAfterApprove,
  deriveAssignmentStatusAfterReject,
  deriveAssignmentStatusAfterSubmit,
  normalizeSubmissionStatus,
} from '../domain/reinforcement-review-domain';

describe('reinforcement review domain', () => {
  it('normalizes submission status from frontend strings', () => {
    expect(normalizeSubmissionStatus('submitted')).toBe(
      ReinforcementSubmissionStatus.SUBMITTED,
    );
    expect(normalizeSubmissionStatus('APPROVED')).toBe(
      ReinforcementSubmissionStatus.APPROVED,
    );
  });

  it('requires proofFileId when proof type requires a file', () => {
    expect(() =>
      assertProofPayloadMatchesProofType({
        proofType: ReinforcementProofType.IMAGE,
        proofFileId: null,
      }),
    ).toThrow(expect.objectContaining({ code: 'validation.failed' }));
  });

  it('accepts no proof when proof type is none', () => {
    expect(() =>
      assertProofPayloadMatchesProofType({
        proofType: ReinforcementProofType.NONE,
      }),
    ).not.toThrow();
  });

  it.each([
    [ReinforcementProofType.IMAGE, 'image/jpeg'],
    [ReinforcementProofType.IMAGE, 'image/png'],
    [ReinforcementProofType.VIDEO, 'video/mp4'],
    [ReinforcementProofType.VIDEO, 'video/webm'],
    [ReinforcementProofType.DOCUMENT, 'application/pdf'],
  ] as const)(
    'accepts declared MIME %s for proof type %s',
    (proofType, mimeType) => {
      expect(() =>
        assertDeclaredProofMimeAllowed({ proofType, mimeType }),
      ).not.toThrow();
    },
  );

  it.each([
    [ReinforcementProofType.IMAGE, 'video/mp4'],
    [ReinforcementProofType.VIDEO, 'image/png'],
    [ReinforcementProofType.DOCUMENT, 'text/plain'],
    [ReinforcementProofType.IMAGE, 'image/jpg'],
  ] as const)(
    'rejects declared MIME %s for proof type %s',
    (proofType, mimeType) => {
      expect(() =>
        assertDeclaredProofMimeAllowed({ proofType, mimeType }),
      ).toThrow(
        expect.objectContaining({
          code: 'reinforcement.proof.mime_not_allowed',
        }),
      );
    },
  );

  it('rejects cancelled assignments and tasks', () => {
    expect(() =>
      assertAssignmentCanSubmit({
        id: 'assignment-1',
        status: ReinforcementTaskStatus.CANCELLED,
        task: {
          id: 'task-1',
          status: ReinforcementTaskStatus.NOT_COMPLETED,
        },
      }),
    ).toThrow(
      expect.objectContaining({ code: 'reinforcement.task.cancelled' }),
    );

    expect(() =>
      assertAssignmentCanSubmit({
        id: 'assignment-1',
        status: ReinforcementTaskStatus.NOT_COMPLETED,
        task: {
          id: 'task-1',
          status: ReinforcementTaskStatus.CANCELLED,
        },
      }),
    ).toThrow(
      expect.objectContaining({ code: 'reinforcement.task.cancelled' }),
    );
  });

  it('rejects a stage that does not belong to the task', () => {
    expect(() =>
      assertStageBelongsToTask({
        stage: {
          id: 'stage-1',
          taskId: 'task-b',
          proofType: ReinforcementProofType.NONE,
        },
        taskId: 'task-a',
      }),
    ).toThrow(expect.objectContaining({ code: 'validation.failed' }));
  });

  it('rejects already submitted or approved submissions', () => {
    expect(() =>
      assertSubmissionCanBeSubmitted({
        id: 'submission-1',
        assignmentId: 'assignment-1',
        taskId: 'task-1',
        stageId: 'stage-1',
        status: ReinforcementSubmissionStatus.SUBMITTED,
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'reinforcement.submission.already_submitted',
      }),
    );
  });

  it('allows resubmitting rejected submissions', () => {
    expect(() =>
      assertSubmissionCanBeSubmitted({
        id: 'submission-1',
        assignmentId: 'assignment-1',
        taskId: 'task-1',
        stageId: 'stage-1',
        status: ReinforcementSubmissionStatus.REJECTED,
      }),
    ).not.toThrow();
  });

  it('allows review only for submitted submissions', () => {
    expect(() =>
      assertSubmissionReviewable({
        id: 'submission-1',
        assignmentId: 'assignment-1',
        taskId: 'task-1',
        stageId: 'stage-1',
        status: ReinforcementSubmissionStatus.PENDING,
      }),
    ).toThrow(
      expect.objectContaining({ code: 'reinforcement.review.not_submitted' }),
    );
  });

  it('requires a note or Arabic note for rejection', () => {
    expect(() => assertReviewNoteForRejection({ note: '  ' })).toThrow(
      expect.objectContaining({ code: 'validation.failed' }),
    );
    expect(() =>
      assertReviewNoteForRejection({ noteAr: 'Rejected AR' }),
    ).not.toThrow();
  });

  it('calculates progress using active stages only', () => {
    expect(
      calculateAssignmentProgress({
        activeStageIds: ['stage-1', 'stage-2'],
        approvedStageIds: ['stage-1', 'soft-deleted-stage'],
      }),
    ).toBe(50);
  });

  it('derives assignment status after submit, approve, and reject', () => {
    const assignment = {
      id: 'assignment-1',
      status: ReinforcementTaskStatus.NOT_COMPLETED,
    };

    expect(deriveAssignmentStatusAfterSubmit(assignment)).toBe(
      ReinforcementTaskStatus.UNDER_REVIEW,
    );
    expect(
      deriveAssignmentStatusAfterApprove({
        assignment,
        progress: 100,
        activeStageCount: 1,
      }),
    ).toBe(ReinforcementTaskStatus.COMPLETED);
    expect(deriveAssignmentStatusAfterReject(assignment)).toBe(
      ReinforcementTaskStatus.IN_PROGRESS,
    );
  });
});
