import { Injectable } from '@nestjs/common';
import {
  GradeAssessmentApprovalStatus,
  GradeAssessmentDeliveryMode,
  GradeAssessmentType,
  GradeScopeType,
  Prisma,
} from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import {
  assertRequiredQuestionsAnswered,
  assertSubmissionAssessmentAcceptsDrafts,
  assertSubmissionMutable,
  normalizeAnswerPayload,
  validateAnswerPayloadForQuestion,
  validateEnrollmentWithinAssessmentScope,
  validateSelectedOptionsForQuestion,
} from '../../../grades/assessments/domain/grade-submission-domain';
import {
  type GradeSubmissionAnswerRecord,
  type GradeSubmissionDetailRecord,
  type GradeSubmissionQuestionRecord,
  GradesSubmissionsRepository,
} from '../../../grades/assessments/infrastructure/grades-submissions.repository';
import {
  prepareBulkAnswerSaveInputs,
  prepareSingleAnswerSaveInput,
  resolveQuestionForAnswerOrThrow,
} from '../../../grades/assessments/application/grade-submission-use-case.helpers';
import type { StudentAppContext } from '../../shared/student-app.types';
import type {
  StudentExamBulkSaveAnswersDto,
  StudentExamSaveAnswerDto,
} from '../dto/student-exams.dto';

const EXAM_TYPES = [
  GradeAssessmentType.QUIZ,
  GradeAssessmentType.MONTH_EXAM,
  GradeAssessmentType.MIDTERM,
  GradeAssessmentType.TERM_EXAM,
  GradeAssessmentType.FINAL,
];

const STUDENT_EXAMS_WRITE_ENROLLMENT_ARGS =
  Prisma.validator<Prisma.EnrollmentDefaultArgs>()({
    select: {
      id: true,
      classroom: {
        select: {
          id: true,
          section: {
            select: {
              id: true,
              grade: {
                select: {
                  id: true,
                  stage: {
                    select: {
                      id: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

type StudentExamWriteEnrollmentRecord = Prisma.EnrollmentGetPayload<
  typeof STUDENT_EXAMS_WRITE_ENROLLMENT_ARGS
>;

export interface StudentExamStartMutationResult {
  submission: GradeSubmissionDetailRecord;
  created: boolean;
}

export interface StudentExamAnswerMutationResult {
  submission: GradeSubmissionDetailRecord;
  answer: GradeSubmissionAnswerRecord;
}

export interface StudentExamBulkAnswerMutationResult {
  submission: GradeSubmissionDetailRecord;
  answers: GradeSubmissionAnswerRecord[];
}

export interface StudentExamSubmitMutationResult {
  submission: GradeSubmissionDetailRecord;
  beforeStatus: string;
}

@Injectable()
export class StudentExamsSubmissionWriteAdapter {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gradesSubmissionsRepository: GradesSubmissionsRepository,
  ) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async startSubmission(params: {
    context: StudentAppContext;
    assessmentId: string;
  }): Promise<StudentExamStartMutationResult> {
    const assessment =
      await this.findVisibleSubmissionAssessmentOrThrow(params);
    const existing =
      await this.gradesSubmissionsRepository.findExistingSubmission({
        assessmentId: assessment.id,
        studentId: params.context.studentId,
      });

    if (existing) {
      this.assertSubmissionBelongsToCurrentEnrollment({
        context: params.context,
        assessmentId: assessment.id,
        submission: existing,
      });

      return { submission: existing, created: false };
    }

    await this.findCurrentEnrollmentForSubmissionOrThrow({
      context: params.context,
      assessment,
    });

    const submission = await this.gradesSubmissionsRepository.createSubmission({
      schoolId: params.context.schoolId,
      assessmentId: assessment.id,
      termId: assessment.termId,
      studentId: params.context.studentId,
      enrollmentId: params.context.enrollmentId,
      maxScore: new Prisma.Decimal(assessment.maxScore),
    });

    return { submission, created: true };
  }

  async saveAnswer(params: {
    context: StudentAppContext;
    assessmentId: string;
    questionId: string;
    command: StudentExamSaveAnswerDto;
  }): Promise<StudentExamAnswerMutationResult> {
    const submission = await this.findMutableOwnSubmissionOrThrow(params);
    const question = await resolveQuestionForAnswerOrThrow({
      repository: this.gradesSubmissionsRepository,
      submission,
      questionId: params.questionId,
    });
    const input = await prepareSingleAnswerSaveInput({
      repository: this.gradesSubmissionsRepository,
      submission,
      question,
      command: params.command,
    });
    const answer =
      await this.gradesSubmissionsRepository.upsertAnswerWithSelectedOptions(
        input,
      );

    return { submission, answer };
  }

  async bulkSaveAnswers(params: {
    context: StudentAppContext;
    assessmentId: string;
    command: StudentExamBulkSaveAnswersDto;
  }): Promise<StudentExamBulkAnswerMutationResult> {
    const submission = await this.findMutableOwnSubmissionOrThrow(params);
    const inputs = await prepareBulkAnswerSaveInputs({
      repository: this.gradesSubmissionsRepository,
      submission,
      commands: params.command.answers,
    });
    const answers =
      await this.gradesSubmissionsRepository.bulkUpsertAnswersWithSelectedOptions(
        inputs,
      );

    return { submission, answers };
  }

  async submitSubmission(params: {
    context: StudentAppContext;
    assessmentId: string;
  }): Promise<StudentExamSubmitMutationResult> {
    const submission = await this.findMutableOwnSubmissionOrThrow(params);
    const questions =
      await this.gradesSubmissionsRepository.findQuestionsForSubmission(
        submission.assessmentId,
      );

    validateSavedAnswersBeforeSubmit({
      questions,
      answers: submission.answers,
    });
    assertRequiredQuestionsAnswered({
      questions,
      answers: submission.answers,
    });

    const beforeStatus = submission.status;
    const submitted = await this.gradesSubmissionsRepository.submitSubmission(
      submission.id,
    );

    return { submission: submitted, beforeStatus };
  }

  private async findMutableOwnSubmissionOrThrow(params: {
    context: StudentAppContext;
    assessmentId: string;
  }): Promise<GradeSubmissionDetailRecord> {
    const assessment =
      await this.findVisibleSubmissionAssessmentOrThrow(params);
    const submission =
      await this.gradesSubmissionsRepository.findExistingSubmissionForEnrollment(
        {
          assessmentId: assessment.id,
          studentId: params.context.studentId,
          enrollmentId: params.context.enrollmentId,
        },
      );

    if (!submission) {
      throw new NotFoundDomainException('Student exam submission not found', {
        assessmentId: assessment.id,
      });
    }

    this.assertSubmissionBelongsToCurrentEnrollment({
      context: params.context,
      assessmentId: assessment.id,
      submission,
    });
    assertSubmissionMutable(submission);
    assertSubmissionAssessmentAcceptsDrafts(
      submission.assessment,
      submission.assessment.term,
    );

    return submission;
  }

  private async findVisibleSubmissionAssessmentOrThrow(params: {
    context: StudentAppContext;
    assessmentId: string;
  }) {
    const enrollment = await this.findEnrollmentContext(params.context);
    const subjectIds = await this.listAllocatedSubjectIds(params.context);
    if (!params.context.termId || subjectIds.length === 0) {
      throw new NotFoundDomainException('Student App exam not found', {
        assessmentId: params.assessmentId,
      });
    }

    const visible = await this.scopedPrisma.gradeAssessment.findFirst({
      where: {
        ...buildVisibleExamAssessmentWhere({
          context: params.context,
          enrollment,
          subjectIds,
        }),
        id: params.assessmentId,
      },
      select: { id: true },
    });

    if (!visible) {
      throw new NotFoundDomainException('Student App exam not found', {
        assessmentId: params.assessmentId,
      });
    }

    const assessment =
      await this.gradesSubmissionsRepository.findAssessmentForSubmission(
        visible.id,
      );
    if (!assessment) {
      throw new NotFoundDomainException('Student App exam not found', {
        assessmentId: params.assessmentId,
      });
    }

    assertSubmissionAssessmentAcceptsDrafts(assessment, assessment.term);

    return assessment;
  }

  private async findCurrentEnrollmentForSubmissionOrThrow(params: {
    context: StudentAppContext;
    assessment: Awaited<
      ReturnType<GradesSubmissionsRepository['findAssessmentForSubmission']>
    >;
  }) {
    if (!params.assessment) {
      throw new NotFoundDomainException('Student App exam not found');
    }

    const enrollment =
      await this.gradesSubmissionsRepository.findEnrollmentForSubmission({
        assessment: params.assessment,
        studentId: params.context.studentId,
        enrollmentId: params.context.enrollmentId,
      });

    if (!enrollment || enrollment.id !== params.context.enrollmentId) {
      throw new NotFoundDomainException('Student exam enrollment not found', {
        assessmentId: params.assessment.id,
      });
    }

    validateEnrollmentWithinAssessmentScope({
      assessment: params.assessment,
      enrollment,
    });

    return enrollment;
  }

  private assertSubmissionBelongsToCurrentEnrollment(params: {
    context: StudentAppContext;
    assessmentId: string;
    submission: GradeSubmissionDetailRecord;
  }): void {
    if (
      params.submission.assessmentId !== params.assessmentId ||
      params.submission.studentId !== params.context.studentId ||
      params.submission.enrollmentId !== params.context.enrollmentId
    ) {
      throw new NotFoundDomainException('Student exam submission not found', {
        assessmentId: params.assessmentId,
      });
    }
  }

  private findEnrollmentContext(
    context: StudentAppContext,
  ): Promise<StudentExamWriteEnrollmentRecord> {
    return this.scopedPrisma.enrollment.findFirstOrThrow({
      where: {
        id: context.enrollmentId,
        studentId: context.studentId,
        academicYearId: context.academicYearId,
      },
      ...STUDENT_EXAMS_WRITE_ENROLLMENT_ARGS,
    });
  }

  private async listAllocatedSubjectIds(
    context: StudentAppContext,
  ): Promise<string[]> {
    if (!context.termId) return [];

    const rows = await this.scopedPrisma.teacherSubjectAllocation.findMany({
      where: {
        classroomId: context.classroomId,
        termId: context.termId,
        subject: {
          is: {
            isActive: true,
            deletedAt: null,
          },
        },
      },
      distinct: ['subjectId'],
      select: { subjectId: true },
    });

    return rows.map((row) => row.subjectId);
  }
}

function buildVisibleExamAssessmentWhere(params: {
  context: StudentAppContext;
  enrollment: StudentExamWriteEnrollmentRecord;
  subjectIds: string[];
}): Prisma.GradeAssessmentWhereInput {
  const section = params.enrollment.classroom.section;
  const grade = section.grade;
  const stage = grade.stage;

  return {
    academicYearId: params.context.academicYearId,
    termId: params.context.termId ?? undefined,
    subjectId: { in: params.subjectIds },
    type: { in: EXAM_TYPES },
    deliveryMode: {
      in: [
        GradeAssessmentDeliveryMode.SCORE_ONLY,
        GradeAssessmentDeliveryMode.QUESTION_BASED,
      ],
    },
    approvalStatus: {
      in: [
        GradeAssessmentApprovalStatus.PUBLISHED,
        GradeAssessmentApprovalStatus.APPROVED,
      ],
    },
    OR: [
      { scopeType: GradeScopeType.SCHOOL, scopeKey: params.context.schoolId },
      { scopeType: GradeScopeType.STAGE, scopeKey: stage.id },
      { scopeType: GradeScopeType.GRADE, scopeKey: grade.id },
      { scopeType: GradeScopeType.SECTION, scopeKey: section.id },
      {
        scopeType: GradeScopeType.CLASSROOM,
        scopeKey: params.context.classroomId,
      },
    ],
  };
}

function validateSavedAnswersBeforeSubmit(params: {
  questions: GradeSubmissionQuestionRecord[];
  answers: GradeSubmissionAnswerRecord[];
}): void {
  const questionById = new Map(
    params.questions.map((question) => [question.id, question]),
  );

  for (const answer of params.answers) {
    const question = questionById.get(answer.questionId);
    if (!question) continue;

    const payload = normalizeAnswerPayload({
      answerText: answer.answerText,
      answerJson: answer.answerJson ?? null,
      selectedOptionIds: answer.selectedOptions.map(
        (selected) => selected.optionId,
      ),
    });

    validateAnswerPayloadForQuestion({ question, payload });
    validateSelectedOptionsForQuestion({
      question,
      selectedOptionIds: payload.selectedOptionIds,
      options: question.options,
    });
  }
}
