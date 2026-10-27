/** ST09-A foundation only. These contracts do not activate public Homework APIs. */
export const HOMEWORK_TYPED_LIMITS = Object.freeze({
  items: 50,
  identifier: 64,
  blank: 1000,
  label: 1000,
  segment: 5000,
  mediaText: 10000,
  jsonBytes: 65536,
  nodes: 4096,
  depth: 12,
});

export type HomeworkFoundationType = 'FILL_IN_BLANK' | 'MATCHING' | 'MEDIA';
export type HomeworkDefinitionMode = 'draft' | 'complete';
export type HomeworkAnswerMode = 'draft' | 'final';
export type HomeworkFillSegment = { text: string } | { blankId: string };
export interface HomeworkOrderedItem {
  id: string;
  order: number;
}
export interface HomeworkMatchingItem extends HomeworkOrderedItem {
  label: string;
  labelAr: string | null;
}
export interface HomeworkFillDefinition {
  definitionVersion: 1;
  kind: 'fill';
  blanks: HomeworkOrderedItem[];
  segments: HomeworkFillSegment[];
  maxAnswerLength: number;
}
export interface HomeworkMatchingDefinition {
  definitionVersion: 1;
  kind: 'matching';
  left: HomeworkMatchingItem[];
  right: HomeworkMatchingItem[];
  reuseRight: false;
}
/** A syntactic reference, NEVER evidence of ownership, READY state or access. */
export interface HomeworkMediaSource {
  kind: 'homeworkQuestionAsset';
  assetId: string;
}
export interface HomeworkMediaDefinition {
  definitionVersion: 1;
  kind: 'media';
  source: HomeworkMediaSource | null;
  answer: { kind: 'text'; maxLength: number; multiline: true };
}
export type HomeworkPublicDefinition =
  | HomeworkFillDefinition
  | HomeworkMatchingDefinition
  | HomeworkMediaDefinition;
export interface HomeworkFillAnswer {
  blanks: Array<{ blankId: string; text: string }>;
}
export interface HomeworkMatchingAnswer {
  pairs: Array<{ leftId: string; rightId: string }>;
}
export type HomeworkPrivateAnswerKey =
  | {
      keyVersion: 1;
      kind: 'fill';
      blanks: Array<{ blankId: string; acceptedAnswers: string[] }>;
    }
  | { keyVersion: 1; kind: 'matching'; pairs: HomeworkMatchingAnswer['pairs'] };
export type HomeworkNormalizedTypedAnswer =
  | { type: 'FILL_IN_BLANK'; textAnswer: null; answerJson: HomeworkFillAnswer }
  | { type: 'MATCHING'; textAnswer: null; answerJson: HomeworkMatchingAnswer }
  | { type: 'MEDIA'; textAnswer: string; answerJson: null };
export type HomeworkStoredTypedValue<T> =
  | { state: 'absent' }
  | { state: 'valid'; value: T }
  | { state: 'invalid' };
export class HomeworkTypedContentError extends Error {
  readonly code = 'homework.typed_content.invalid';
  constructor(
    readonly reason:
      | 'shape'
      | 'version'
      | 'limit'
      | 'text'
      | 'association'
      | 'completeness',
  ) {
    super('Homework typed content is invalid');
    this.name = 'HomeworkTypedContentError';
  }
}
