import type { GradeAssetsRepository } from './grade-assets.repository';
import { Prisma } from '@prisma/client';
import { getRequestContext } from '../../../../common/context/request-context';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import {
  readStoredRichContent,
  richContentFallback,
  type StoredRichContent,
} from '../../../../common/rich-content/rich-content.compatibility';
import type {
  RichAssetReference,
  RichContent,
} from '../../../../common/rich-content/rich-content.types';
import { RichContentError } from '../../../../common/rich-content/rich-content.validation';
import { requireGradesScope } from '../../grades-context';
import {
  assertGradeAssessmentAccess,
  assertGradeLiveMutationPermission,
} from './grades-resource-access';

// Only a repository-validated object can contribute a Rich field to a presenter.
// Raw Prisma JSON is never treated as a public display projection.
const projections = new WeakMap<object, StoredRichContent>();
export function gradeRichState(
  record: object,
): StoredRichContent['state'] | undefined {
  return projections.get(record)?.state;
}
export function presentGradeRichContent(record: object): {
  richContent?: RichContent;
} {
  const result = projections.get(record);
  return result?.state === 'valid' ? { richContent: result.content } : {};
}
export function gradeRichReferences(
  content: RichContent,
): RichAssetReference[] {
  const refs: RichAssetReference[] = [];
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const object = value as Record<string, unknown>;
    if (object.type === 'assetReference')
      refs.push(object as RichAssetReference);
    else Object.values(object).forEach(visit);
  };
  // Caller has already passed the bounded strict validator.
  visit(content);
  return refs;
}
type Display = {
  id: string;
  richContent?: unknown;
  prompt?: string;
  promptAr?: string | null;
  label?: string;
  labelAr?: string | null;
};
type Question = Display & { options?: Display[] };
export function hasGradeRichSelection(
  questions: Question[] | undefined,
): boolean {
  return !!questions?.some(
    (q) =>
      q.richContent !== undefined ||
      q.options?.some((o) => o.richContent !== undefined),
  );
}

export async function authorizeGradeRichReview(
  tx: Prisma.TransactionClient,
  assessmentId: string,
): Promise<void> {
  const permissions = getRequestContext()?.activeMembership?.permissions ?? [];
  const permission = [
    'grades.questions.view',
    'grades.questions.manage',
    'grades.submissions.view',
    'grades.submissions.review',
    'grades.assessments.view',
  ].find((value) => permissions.includes(value));
  if (!permission) throw new NotFoundDomainException();
  await assertGradeLiveMutationPermission(tx, permission);
  await assertGradeAssessmentAccess(tx, assessmentId);
}

/** Called only inside the consumer's authorized scoped transaction. One batch
 * proves null classification and exact live ancestry for questions and options. */
export async function projectGradeRichContent(
  tx: Prisma.TransactionClient,
  assessmentId: string,
  questions: Question[],
  resolver: GradeAssetsRepository | undefined,
  audience: 'author' | 'student' | 'review',
): Promise<void> {
  if (!questions.length) return;
  if (questions.length > 200) {
    for (let start = 0; start < questions.length; start += 200)
      await projectGradeRichContent(
        tx,
        assessmentId,
        questions.slice(start, start + 200),
        resolver,
        audience,
      );
    return;
  }
  const actor = requireGradesScope();
  const ids = questions.map((q) => q.id);
  const rows = await tx.$queryRaw<
    Array<{
      id: string;
      questionId: string;
      optionId: string | null;
      value: unknown;
      sqlNull: boolean;
    }>
  >(Prisma.sql`
    SELECT q.id, q.id AS "questionId", NULL::uuid AS "optionId", q.rich_content AS value,
      q.rich_content IS NULL AS "sqlNull"
    FROM grade_assessment_questions q
    WHERE q.school_id = ${actor.schoolId}::uuid AND q.assessment_id = ${assessmentId}::uuid
      AND q.deleted_at IS NULL AND q.id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
    UNION ALL
    SELECT o.id, o.question_id AS "questionId", o.id AS "optionId", o.rich_content AS value,
      o.rich_content IS NULL AS "sqlNull"
    FROM grade_assessment_question_options o
    JOIN grade_assessment_questions q ON q.id=o.question_id AND q.school_id=o.school_id AND q.assessment_id=o.assessment_id
    WHERE q.school_id = ${actor.schoolId}::uuid AND q.assessment_id = ${assessmentId}::uuid
      AND q.deleted_at IS NULL AND o.deleted_at IS NULL
      AND q.id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})`);
  const byId = new Map(
    rows.map((row) => [
      `${row.optionId ? 'option' : 'question'}:${row.id}`,
      row,
    ]),
  );
  for (const question of questions) {
    for (const record of [question, ...(question.options ?? [])]) {
      const row = byId.get(
        `${record === question ? 'question' : 'option'}:${record.id}`,
      );
      let stored: StoredRichContent =
        row && row.questionId === question.id
          ? readStoredRichContent(row.value, row.sqlNull)
          : { state: 'invalid' };
      if (stored.state === 'valid') {
        try {
          const target = row!.optionId ? 'gradeOption' : 'gradeQuestion';
          const fallback = richContentFallback(stored.content, target);
          // Do not pair a concurrent newer AST with stale legacy display data.
          for (const [key, value] of Object.entries(fallback))
            if (
              (record as Record<string, unknown>)[key] !== undefined &&
              (record as Record<string, unknown>)[key] !== value
            )
              throw new ValidationDomainException('Stored display mismatch');
          const refs = gradeRichReferences(stored.content);
          if (refs.length && !resolver) throw new NotFoundDomainException();
          for (const reference of refs)
            await resolver!.assertReference({
              transaction: tx,
              actor,
              schoolId: actor.schoolId,
              owner: {
                domain: 'grades',
                assessmentId,
                questionId: question.id,
                ...(row!.optionId ? { optionId: row!.optionId } : {}),
              },
              reference,
              audience,
            });
        } catch (error) {
          if (
            !(
              error instanceof RichContentError ||
              error instanceof NotFoundDomainException ||
              error instanceof ValidationDomainException
            )
          )
            throw error;
          stored = { state: 'invalid' };
        }
      }
      projections.set(record, stored);
    }
  }
}
