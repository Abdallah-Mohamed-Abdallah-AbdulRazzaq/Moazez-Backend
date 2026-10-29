import { Prisma } from '@prisma/client';
import { requireGradesScope } from '../../grades-context';
import { isGradeEvaluationType } from '../domain/grade-question-evaluation';

type AnswerRow = {
  id: string;
  questionId: string;
  answerJson: unknown;
  question?: { type: string };
};
const nullFacts = new WeakMap<object, boolean>();

/** Already audience-authorized records only. Never selects a private key or answer value. */
export async function projectGradeAnswerNullFacts(
  client: Pick<Prisma.TransactionClient, '$queryRaw'>,
  answers: readonly AnswerRow[],
  questionTypes?: ReadonlyMap<string, string>,
): Promise<void> {
  const candidates = answers.filter(
    (answer) =>
      answer.answerJson === null &&
      isGradeEvaluationType(
        answer.question?.type ?? questionTypes?.get(answer.questionId),
      ),
  );
  if (!candidates.length) return;
  const { schoolId } = requireGradesScope();
  for (let offset = 0; offset < candidates.length; offset += 200) {
    const batch = candidates.slice(offset, offset + 200);
    const rows = await client.$queryRaw<
      Array<{ id: string; sqlNull: boolean }>
    >`
      SELECT a.id, a.answer_json IS NULL AS "sqlNull" FROM grade_submission_answers a
      JOIN grade_assessment_questions q ON q.id=a.question_id AND q.school_id=a.school_id AND q.assessment_id=a.assessment_id
      JOIN grade_submissions s ON s.id=a.submission_id AND s.school_id=a.school_id AND s.assessment_id=a.assessment_id
      WHERE a.school_id=${schoolId}::uuid AND q.deleted_at IS NULL
        AND q.type IN ('ORDERING', 'NUMERIC', 'MATH_EXPRESSION')
        AND a.id IN (${Prisma.join(batch.map((answer) => Prisma.sql`${answer.id}::uuid`))})`;
    for (const answer of batch) {
      const row = rows.find((row) => row.id === answer.id);
      if (row) nullFacts.set(answer, row.sqlNull);
    }
  }
}

export function gradeAnswerNullFact(answer: object): boolean | undefined {
  return nullFacts.get(answer);
}
