export interface QuestionGroupContext {
  groups: Array<{
    id: string;
    title: string;
    instructions: string | null;
    layoutOrder: number;
    questionIds: string[];
    points: string;
    sharedStimulus?: unknown;
    sharedStimulusSupported?: boolean;
    assets: object[];
  }>;
  displayItems: Array<
    | { kind: 'question'; questionId: string }
    | { kind: 'group'; groupId: string; questionIds: string[] }
  >;
}
const contexts = new WeakMap<object, QuestionGroupContext>();
const memberships = new WeakMap<object, string>();
/** Only authorized domain repositories register projections; raw JSON is never presented. */
export function attachQuestionGroupContext(
  records: readonly { id: string }[],
  context: QuestionGroupContext | undefined,
  groupIds: ReadonlyMap<string, string | null>,
): void {
  if (context) contexts.set(records, context);
  else contexts.delete(records);
  for (const record of records) {
    if (context) contexts.set(record, context);
    else contexts.delete(record);
    const id = groupIds.get(record.id);
    if (id) memberships.set(record, id);
    else memberships.delete(record);
  }
}
export function presentQuestionGroupContext(
  records: object | undefined,
): Partial<QuestionGroupContext> {
  if (!records) return {};
  const direct = contexts.get(records);
  if (direct) return direct;
  // Existing read models may combine questions and answer prompts into a new array.
  if (Array.isArray(records)) {
    for (const record of records as object[]) {
      const context = contexts.get(record);
      if (context) return context;
    }
  }
  return {};
}
export function presentQuestionGroupMembership(record: object): {
  groupId?: string;
} {
  const groupId = memberships.get(record);
  return groupId ? { groupId } : {};
}
