import { ValidationDomainException } from '../exceptions/domain-exception';
import { normalizeRichContent } from '../rich-content/rich-content.validation';
import type {
  RichAssetReference,
  RichQuestionContent,
} from '../rich-content/rich-content.types';

// These bounds match existing Homework answer batches and Grades question batches.
export const QUESTION_GROUP_LIMITS = { Homework: 100, Grades: 200 } as const;
export function groupOrder(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 2147483647
  )
    throw new ValidationDomainException('Question group order is invalid');
  return value;
}
export function groupText(
  value: unknown,
  maximum: number,
  required = false,
): string | null {
  if (value === null && !required) return null;
  if (
    typeof value !== 'string' ||
    value.trim().length > maximum ||
    /[<>\p{Cf}\p{Cs}]/u.test(value) ||
    [...value].some((character) => {
      const code = character.charCodeAt(0);
      return (code < 32 && ![9, 10, 13].includes(code)) || code === 127;
    }) ||
    (required && !value.trim())
  )
    throw new ValidationDomainException('Question group display is invalid');
  return value.trim() || null;
}
export function groupStimulus(value: unknown): RichQuestionContent | null {
  if (value === null) return null;
  try {
    const content = normalizeRichContent(value);
    if (content.kind !== 'question')
      throw new Error('Question display required');
    return content;
  } catch {
    throw new ValidationDomainException('Question group stimulus is invalid', {
      field: 'sharedStimulus',
    });
  }
}
/** Input has already passed the shared bounded AST validator. */
export function groupReferences(
  content: RichQuestionContent,
): RichAssetReference[] {
  const refs: RichAssetReference[] = [];
  function visit(value: unknown): void {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    if (record.type === 'assetReference')
      refs.push(record as RichAssetReference);
    else Object.values(record).forEach(visit);
  }
  visit(content);
  return refs;
}
export interface LayoutQuestion {
  id: string;
  groupId: string | null;
  layoutOrder: number | null;
  sortOrder: number;
}
export interface LayoutGroup {
  id: string;
  layoutOrder: number;
}
export function mixedQuestionLayout(
  questions: readonly LayoutQuestion[],
  groups: readonly LayoutGroup[],
) {
  const compare = (
    a: { id: string; order: number },
    b: { id: string; order: number },
  ) => a.order - b.order || a.id.localeCompare(b.id);
  const grouped = new Map(groups.map((g) => [g.id, [] as LayoutQuestion[]]));
  for (const q of questions) {
    if (q.groupId && !grouped.has(q.groupId))
      throw new ValidationDomainException(
        'Question group membership is unavailable',
      );
    if (q.groupId) grouped.get(q.groupId)!.push(q);
  }
  const childIds = new Map(
    [...grouped].map(([id, children]) => [
      id,
      children
        .map((q) => ({ id: q.id, order: q.layoutOrder ?? q.sortOrder }))
        .sort(compare)
        .map((q) => q.id),
    ]),
  );
  return {
    childIds,
    displayItems: [
      ...questions
        .filter((q) => !q.groupId)
        .map((q) => ({
          kind: 'question' as const,
          id: q.id,
          order: q.layoutOrder ?? q.sortOrder,
        })),
      ...groups.map((g) => ({
        kind: 'group' as const,
        id: g.id,
        order: g.layoutOrder,
      })),
    ]
      .sort(compare)
      .map(({ kind, id }) =>
        kind === 'group'
          ? { kind, groupId: id, questionIds: childIds.get(id)! }
          : { kind, questionId: id },
      ),
  };
}
