import { Prisma } from '@prisma/client';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../common/exceptions/domain-exception';
import {
  readStoredRichContent,
  richContentFallback,
  type StoredRichContent,
} from '../../../common/rich-content/rich-content.compatibility';
import type {
  RichContent,
  RichQuestionContent,
  RichOptionContent,
} from '../../../common/rich-content/rich-content.types';
import { RichContentError } from '../../../common/rich-content/rich-content.validation';
import { homeworkRichReferences } from '../domain/homework-rich-content';
import type { HomeworkAssetActor } from '../domain/homework-question-asset';
import { requireHomeworkScope } from '../homework-context';
import type { HomeworkQuestionAssetsRepository } from './homework-question-assets.repository';

const projections = new WeakMap<object, StoredRichContent>();
export function presentHomeworkRichContent(record: object): {
  richContent?: RichContent;
} {
  const stored = projections.get(record);
  return stored?.state === 'valid' ? { richContent: stored.content } : {};
}
export function presentHomeworkRichQuestion(record: object): {
  richContent?: RichQuestionContent;
} {
  const stored = projections.get(record);
  return stored?.state === 'valid' && stored.content.kind === 'question'
    ? { richContent: stored.content }
    : {};
}
export function presentHomeworkRichOption(record: object): {
  richContent?: RichOptionContent;
} {
  const stored = projections.get(record);
  return stored?.state === 'valid' && stored.content.kind === 'option'
    ? { richContent: stored.content }
    : {};
}
export function homeworkRichState(record: object) {
  return projections.get(record)?.state;
}
export type HomeworkRichQuestion = {
  id: string;
  richContent?: unknown;
  prompt?: string;
  instructions?: string | null;
  options?: Array<{ id: string; richContent?: unknown; text?: string }>;
};
export function hasHomeworkRichSelection(
  questions: HomeworkRichQuestion[],
): boolean {
  return questions.some(
    (q) =>
      q.richContent !== undefined ||
      q.options?.some((o) => o.richContent !== undefined),
  );
}

/** Consumer authorization precedes this bounded, scoped, read-only projection. */
export async function projectHomeworkRichContent(
  tx: Prisma.TransactionClient,
  homeworkId: string,
  questions: HomeworkRichQuestion[],
  resolver: HomeworkQuestionAssetsRepository,
  audience: 'author' | 'student' | 'review',
  resourceActor: HomeworkAssetActor,
): Promise<void> {
  if (!questions.length) return;
  if (questions.length > 200) {
    for (let start = 0; start < questions.length; start += 200)
      await projectHomeworkRichContent(
        tx,
        homeworkId,
        questions.slice(start, start + 200),
        resolver,
        audience,
        resourceActor,
      );
    return;
  }
  const scope = requireHomeworkScope();
  const ids = Prisma.join(questions.map((q) => Prisma.sql`${q.id}::uuid`));
  const rows = await tx.$queryRaw<
    Array<{
      id: string;
      questionId: string;
      optionId: string | null;
      value: unknown;
      sqlNull: boolean;
      legacy: Record<string, unknown>;
    }>
  >(Prisma.sql`
    SELECT q.id, q.id AS "questionId", NULL::uuid AS "optionId", q.rich_content AS value, q.rich_content IS NULL AS "sqlNull",
      jsonb_build_object('prompt', q.prompt, 'instructions', q.instructions) AS legacy
    FROM homework_questions q
    JOIN homework_assignments a ON a.id = q.homework_assignment_id AND a.school_id = q.school_id
    WHERE q.school_id = ${scope.schoolId}::uuid AND a.id = ${homeworkId}::uuid AND a.deleted_at IS NULL
      AND q.deleted_at IS NULL AND q.id IN (${ids})
    UNION ALL
    SELECT o.id, q.id AS "questionId", o.id AS "optionId", o.rich_content AS value, o.rich_content IS NULL AS "sqlNull",
      jsonb_build_object('text', o.text) AS legacy
    FROM homework_question_options o
    JOIN homework_questions q ON q.id = o.homework_question_id AND q.school_id = o.school_id
    JOIN homework_assignments a ON a.id = q.homework_assignment_id AND a.school_id = q.school_id
    WHERE q.school_id = ${scope.schoolId}::uuid AND a.id = ${homeworkId}::uuid AND a.deleted_at IS NULL
      AND q.deleted_at IS NULL AND o.deleted_at IS NULL AND q.id IN (${ids})`);
  const byId = new Map(
    rows.map((r) => [`${r.optionId ? 'option' : 'question'}:${r.id}`, r]),
  );
  for (const question of questions) {
    for (const record of [question, ...(question.options ?? [])]) {
      const row = byId.get(
        `${record === question ? 'question' : 'option'}:${record.id}`,
      );
      let stored: StoredRichContent =
        row?.questionId === question.id
          ? readStoredRichContent(row.value, row.sqlNull)
          : { state: 'invalid' };
      if (stored.state === 'valid') {
        try {
          const fallback = richContentFallback(
            stored.content,
            row!.optionId ? 'homeworkOption' : 'homeworkQuestion',
          );
          for (const [field, value] of Object.entries(fallback))
            if (
              row!.legacy[field] !== value ||
              ((record as Record<string, unknown>)[field] !== undefined &&
                (record as Record<string, unknown>)[field] !== value)
            )
              throw new ValidationDomainException('Stored display mismatch');
          for (const reference of homeworkRichReferences(stored.content))
            await resolver.assertReference({
              transaction: tx,
              actor: { ...scope, resourceActor },
              schoolId: scope.schoolId,
              owner: {
                domain: 'homework',
                homeworkId,
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
