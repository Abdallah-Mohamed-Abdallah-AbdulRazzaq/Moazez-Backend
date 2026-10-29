import { Prisma, type HomeworkQuestionType } from '@prisma/client';
import { requireHomeworkScope } from '../homework-context';
import { isHomeworkTypedType } from '../application/homework-typed-runtime';
import type { HomeworkStoredAnswer } from '../domain/homework-answer-normalization';
import {
  classifyStoredHomeworkTypedAnswer,
  normalizeHomeworkDefinition,
  normalizeHomeworkTypedAnswer,
} from '../domain/homework-typed-foundation';
import {
  HomeworkTypedContentError,
  type HomeworkNormalizedTypedAnswer,
} from '../domain/homework-typed-contract';

export interface HomeworkTypedAnswerRow extends HomeworkStoredAnswer {
  id: string;
  questionId: string;
  type: HomeworkQuestionType;
  metadata: unknown;
  isDraft: boolean;
}
const projections = new WeakMap<object, HomeworkNormalizedTypedAnswer | null>();

/** Caller already resolved the owning submission/Student or linked child. No key column. */
export async function readHomeworkTypedAnswers(
  tx: Pick<Prisma.TransactionClient, '$queryRaw'>,
  homeworkId: string,
  submissionId: string,
  questionIds: readonly string[],
): Promise<HomeworkTypedAnswerRow[]> {
  const scope = requireHomeworkScope();
  const rows: HomeworkTypedAnswerRow[] = [];
  for (let offset = 0; offset < questionIds.length; offset += 200) {
    const chunk = questionIds.slice(offset, offset + 200);
    rows.push(
      ...(await tx.$queryRaw<HomeworkTypedAnswerRow[]>`
      SELECT a.id, a.homework_question_id AS "questionId", q.type, q.metadata, a.is_draft AS "isDraft",
        a.text_answer AS "textAnswer", a.selected_option_ids AS "selectedOptionIds",
        a.answer_json AS "answerJson", a.answer_json IS NULL AS "answerJsonSqlNull"
      FROM homework_submission_answers a
      JOIN homework_questions q ON q.id=a.homework_question_id AND q.school_id=a.school_id AND q.homework_assignment_id=a.homework_assignment_id
      JOIN homework_submissions s ON s.id=a.homework_submission_id AND s.school_id=a.school_id AND s.homework_assignment_id=a.homework_assignment_id AND s.homework_target_id=a.homework_target_id
      WHERE a.school_id=${scope.schoolId}::uuid AND a.homework_assignment_id=${homeworkId}::uuid
        AND a.homework_submission_id=${submissionId}::uuid AND a.deleted_at IS NULL AND q.deleted_at IS NULL
        AND q.id IN (${Prisma.join(chunk.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY a.id`),
    );
  }
  return rows;
}

export async function projectHomeworkTypedAnswers(
  tx: Pick<Prisma.TransactionClient, '$queryRaw'>,
  homeworkId: string,
  answers: Array<{
    id: string;
    homeworkSubmissionId: string;
    homeworkQuestionId: string;
    homeworkQuestion: { type: string };
  }>,
): Promise<void> {
  const typed = answers.filter(
    (a) => isHomeworkTypedType(a.homeworkQuestion.type) && !projections.has(a),
  );
  const submissions = [...new Set(typed.map((a) => a.homeworkSubmissionId))];
  for (const submissionId of submissions) {
    const group = typed.filter((a) => a.homeworkSubmissionId === submissionId);
    const rows = await readHomeworkTypedAnswers(
      tx,
      homeworkId,
      submissionId,
      group.map((a) => a.homeworkQuestionId),
    );
    for (const answer of group) {
      const row = rows.find(
        (item) =>
          item.id === answer.id &&
          item.questionId === answer.homeworkQuestionId &&
          item.type === answer.homeworkQuestion.type,
      );
      let value: HomeworkNormalizedTypedAnswer | null = null;
      if (row) {
        try {
          if (!isHomeworkTypedType(row.type))
            throw new HomeworkTypedContentError('association');
          const definition = normalizeHomeworkDefinition(
            row.type,
            row.metadata,
            'complete',
          );
          if (
            row.selectedOptionIds !== null &&
            (!Array.isArray(row.selectedOptionIds) ||
              row.selectedOptionIds.length)
          )
            throw new HomeworkTypedContentError('association');
          const classified = classifyStoredHomeworkTypedAnswer(
            definition,
            row.answerJson,
            row.answerJsonSqlNull,
            row.isDraft ? 'draft' : 'final',
          );
          if (classified.state === 'invalid')
            throw new HomeworkTypedContentError('shape');
          if (definition.kind === 'media')
            value = normalizeHomeworkTypedAnswer(
              definition,
              row.textAnswer == null
                ? undefined
                : { textAnswer: row.textAnswer },
              row.isDraft ? 'draft' : 'final',
              false,
            );
          else {
            if (row.textAnswer !== null)
              throw new HomeworkTypedContentError('association');
            value = classified.state === 'valid' ? classified.value : null;
          }
        } catch (error) {
          if (!(error instanceof HomeworkTypedContentError)) throw error;
        }
      }
      projections.set(answer, value);
    }
  }
}

export function presentHomeworkTypedAnswer(answer: {
  homeworkQuestion: { type: string };
}): { answerJson?: unknown; textAnswer?: string | null } {
  if (!isHomeworkTypedType(answer.homeworkQuestion.type)) return {};
  const value = projections.get(answer);
  return {
    answerJson: value?.answerJson ?? null,
    textAnswer: value?.textAnswer ?? null,
  };
}
