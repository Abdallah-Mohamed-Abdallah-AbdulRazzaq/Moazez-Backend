import { Prisma } from '@prisma/client';
import { requireGradesScope } from '../../grades-context';
import { isGradeEvaluationType } from '../domain/grade-question-evaluation';
import { canReadGradeAuthoring } from './grades-resource-access';

type QuestionRow = { id: string; type: string; answerKey: unknown };
const nullFacts = new WeakMap<object, boolean>();

/** Already resource-authorized questions only; never selects private key values. */
export async function projectGradeAuthorKeyNullFacts(
  client: Pick<Prisma.TransactionClient, '$queryRaw'>,
  assessmentId: string,
  questions: readonly QuestionRow[],
  verifiedTeacherAuthoring = false,
): Promise<void> {
  if (!canReadGradeAuthoring() && !verifiedTeacherAuthoring) return;
  const candidates = questions.filter(
    (question) =>
      isGradeEvaluationType(question.type) && question.answerKey === null,
  );
  if (!candidates.length) return;
  const { schoolId } = requireGradesScope();
  for (let offset = 0; offset < candidates.length; offset += 200) {
    const batch = candidates.slice(offset, offset + 200);
    const rows = await client.$queryRaw<
      Array<{ id: string; sqlNull: boolean }>
    >`
      SELECT q.id, q.answer_key IS NULL AS "sqlNull" FROM grade_assessment_questions q
      JOIN grade_assessments a ON a.id=q.assessment_id AND a.school_id=q.school_id
      WHERE q.school_id=${schoolId}::uuid AND q.assessment_id=${assessmentId}::uuid
        AND q.deleted_at IS NULL AND a.deleted_at IS NULL
        AND q.type IN ('ORDERING', 'NUMERIC', 'MATH_EXPRESSION')
        AND q.id IN (${Prisma.join(batch.map((question) => Prisma.sql`${question.id}::uuid`))})`;
    const facts = new Map(rows.map((row) => [row.id, row.sqlNull]));
    for (const question of batch)
      nullFacts.set(question, facts.get(question.id) === true);
  }
}

export function gradeAuthorKeyNullFact(question: object): boolean | undefined {
  return nullFacts.get(question);
}
