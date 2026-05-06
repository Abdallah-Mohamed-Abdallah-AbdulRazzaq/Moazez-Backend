import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentAppRequiredStudentException } from '../../shared/student-app-errors';
import type {
  StudentAppContext,
  StudentAppCurrentStudentWithEnrollment,
} from '../../shared/student-app.types';
import { GetStudentExamSubmissionUseCase } from '../application/get-student-exam-submission.use-case';
import { GetStudentExamUseCase } from '../application/get-student-exam.use-case';
import { ListStudentExamsUseCase } from '../application/list-student-exams.use-case';
import {
  StudentExamsReadAdapter,
  type StudentExamDetailReadResult,
  type StudentExamSubmissionReadResult,
  type StudentExamsReadResult,
} from '../infrastructure/student-exams-read.adapter';

describe('Student Exams use-cases', () => {
  it('rejects non-student actors through StudentAppAccessService', async () => {
    const { listUseCase, accessService, readAdapter } = createUseCases();
    accessService.getCurrentStudentWithEnrollment.mockRejectedValue(
      new StudentAppRequiredStudentException({ reason: 'actor_not_student' }),
    );

    await expect(listUseCase.execute({})).rejects.toMatchObject({
      code: 'student_app.actor.required_student',
    });
    expect(readAdapter.listExams).not.toHaveBeenCalled();
  });

  it('lists only visible exam-like assessments returned by the adapter', async () => {
    const { listUseCase, readAdapter } = createUseCasesWithValidAccess();
    readAdapter.listExams.mockResolvedValue(examsReadResultFixture());

    const result = await listUseCase.execute({ type: 'quiz' });

    expect(readAdapter.listExams).toHaveBeenCalledWith({
      context: contextFixture(),
      query: { type: 'quiz' },
    });
    expect(result.mapping).toEqual({
      source: 'GradeAssessment.type',
      examTypes: ['QUIZ', 'MONTH_EXAM', 'MIDTERM', 'TERM_EXAM', 'FINAL'],
    });
    expect(result.subjects[0].exams[0]).toMatchObject({
      assessmentId: 'assessment-1',
      status: 'completed',
      type: 'quiz',
    });
  });

  it('rejects exam detail outside current ownership', async () => {
    const { detailUseCase, readAdapter } = createUseCasesWithValidAccess();
    readAdapter.findExam.mockResolvedValue(null);

    await expect(detailUseCase.execute('outside-assessment')).rejects.toMatchObject(
      { httpStatus: 404 },
    );
  });

  it('returns safe exam detail without answer keys or correct options', async () => {
    const { detailUseCase, readAdapter } = createUseCasesWithValidAccess();
    readAdapter.findExam.mockResolvedValue(examDetailReadResultFixture());

    const result = await detailUseCase.execute('assessment-1');
    const serialized = JSON.stringify(result);

    expect(result).toMatchObject({
      assessmentId: 'assessment-1',
      status: 'completed',
      question_count: 1,
    });
    expect(serialized).not.toContain('answerKey');
    expect(serialized).not.toContain('correctAnswer');
    expect(serialized).not.toContain('isCorrect');
  });

  it('returns safe empty submission state without creating submissions', async () => {
    const { submissionUseCase, readAdapter } = createUseCasesWithValidAccess();
    readAdapter.findExamSubmission.mockResolvedValue({
      exam: examDetailFixture(),
      submission: null,
    } as unknown as StudentExamSubmissionReadResult);

    await expect(submissionUseCase.execute('assessment-1')).resolves.toEqual({
      assessmentId: 'assessment-1',
      status: 'not_started',
      submission: null,
    });
    expect(readAdapter.findExamSubmission).toHaveBeenCalledTimes(1);
  });
});

function createUseCases(): {
  listUseCase: ListStudentExamsUseCase;
  detailUseCase: GetStudentExamUseCase;
  submissionUseCase: GetStudentExamSubmissionUseCase;
  accessService: jest.Mocked<StudentAppAccessService>;
  readAdapter: jest.Mocked<StudentExamsReadAdapter>;
} {
  const accessService = {
    getCurrentStudentWithEnrollment: jest.fn(),
  } as unknown as jest.Mocked<StudentAppAccessService>;
  const readAdapter = {
    listExams: jest.fn(),
    findExam: jest.fn(),
    findExamSubmission: jest.fn(),
  } as unknown as jest.Mocked<StudentExamsReadAdapter>;

  return {
    listUseCase: new ListStudentExamsUseCase(accessService, readAdapter),
    detailUseCase: new GetStudentExamUseCase(accessService, readAdapter),
    submissionUseCase: new GetStudentExamSubmissionUseCase(
      accessService,
      readAdapter,
    ),
    accessService,
    readAdapter,
  };
}

function createUseCasesWithValidAccess(): ReturnType<typeof createUseCases> {
  const created = createUseCases();
  created.accessService.getCurrentStudentWithEnrollment.mockResolvedValue(
    currentStudentFixture(),
  );
  return created;
}

function currentStudentFixture(): StudentAppCurrentStudentWithEnrollment {
  return {
    context: contextFixture(),
    student: {} as StudentAppCurrentStudentWithEnrollment['student'],
    enrollment: {} as StudentAppCurrentStudentWithEnrollment['enrollment'],
  };
}

function contextFixture(): StudentAppContext {
  return {
    studentUserId: 'student-user-1',
    studentId: 'student-1',
    schoolId: 'school-1',
    organizationId: 'org-1',
    membershipId: 'membership-1',
    roleId: 'role-1',
    permissions: ['students.records.view'],
    enrollmentId: 'enrollment-1',
    classroomId: 'classroom-1',
    academicYearId: 'year-1',
    requestedAcademicYearId: 'year-1',
    requestedTermId: 'term-1',
    termId: 'term-1',
  };
}

function examsReadResultFixture(): StudentExamsReadResult {
  return {
    exams: [examCardFixture()],
    submissionsByAssessmentId: new Map([
      [
        'assessment-1',
        {
          id: 'submission-1',
          assessmentId: 'assessment-1',
          status: 'SUBMITTED',
        },
      ],
    ]),
    page: 1,
    limit: 50,
    total: 1,
  } as unknown as StudentExamsReadResult;
}

function examDetailReadResultFixture(): StudentExamDetailReadResult {
  return {
    exam: examDetailFixture(),
    submission: {
      id: 'submission-1',
      assessmentId: 'assessment-1',
      status: 'SUBMITTED',
    },
  } as unknown as StudentExamDetailReadResult;
}

function examCardFixture() {
  return {
    id: 'assessment-1',
    subjectId: 'subject-1',
    titleEn: 'Quiz 1',
    titleAr: null,
    type: 'QUIZ',
    deliveryMode: 'QUESTION_BASED',
    date: new Date('2026-10-01T00:00:00.000Z'),
    maxScore: 10,
    expectedTimeMinutes: 30,
    approvalStatus: 'PUBLISHED',
    lockedAt: null,
    subject: {
      id: 'subject-1',
      nameAr: 'Math AR',
      nameEn: 'Math',
    },
    _count: { questions: 1 },
  };
}

function examDetailFixture() {
  return {
    ...examCardFixture(),
    questions: [
      {
        id: 'question-1',
        type: 'MCQ_SINGLE',
        prompt: 'Choose one.',
        promptAr: null,
        points: 10,
        sortOrder: 1,
        required: true,
        options: [
          {
            id: 'option-1',
            label: 'Visible option',
            labelAr: null,
            value: 'A',
            sortOrder: 1,
          },
        ],
      },
    ],
  };
}
