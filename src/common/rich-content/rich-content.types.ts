/** Display-only JSON. No resource authority or grading data belongs here. */
export type RichLanguage = 'ar' | 'en' | 'und';
export type RichDirection = 'rtl' | 'ltr' | 'auto';
export type RichText = {
  type: 'text';
  text: string;
  language?: RichLanguage;
  direction?: RichDirection;
};
export type MathExpression =
  | RichText
  | { type: 'subscript' | 'superscript'; children: MathExpression[] }
  | {
      type: 'fraction';
      numerator: MathExpression[];
      denominator: MathExpression[];
    }
  | { type: 'radical'; radicand: MathExpression[]; degree?: number };
export type RichMath<TDisplay extends 'inline' | 'block' = 'inline' | 'block'> =
  {
    type: 'math';
    display: TDisplay;
    children: MathExpression[];
    altText: string;
  };
export type ChemicalSpecies = {
  coefficient: number;
  elements: { element: string; count: number }[];
  charge?: number;
  state?: 's' | 'l' | 'g' | 'aq';
};
export type RichChemistry = {
  type: 'chemistry';
  reactants: ChemicalSpecies[];
  altText: string;
} & (
  | { products?: never; arrow?: never }
  | { products: ChemicalSpecies[]; arrow: 'yields' | 'equilibrium' }
);
export type RichAssetReference = {
  type: 'assetReference';
  assetId: string;
  kind: 'image' | 'audio' | 'video' | 'document' | 'other';
  altText: string;
  caption?: string;
};
export type RichInline =
  | MathExpression
  | { type: 'lineBreak' }
  | { type: 'strong' | 'emphasis'; children: RichInline[] }
  | RichMath<'inline'>
  | RichChemistry
  | RichAssetReference;
export type RichBlock =
  | { type: 'paragraph'; children: RichInline[] }
  | RichMath<'block'>;
export type RichDocument = {
  language: RichLanguage;
  direction: RichDirection;
  blocks: RichBlock[];
};
export type RichQuestionContent = {
  contentVersion: 1;
  kind: 'question';
  stem: RichDocument;
  instructions?: RichDocument;
  stemAr?: RichDocument;
};
export type RichOptionContent = {
  contentVersion: 1;
  kind: 'option';
  label: RichDocument;
  labelAr?: RichDocument;
};
export type RichContent = RichQuestionContent | RichOptionContent;

/** Future adapters supply actor/context and their existing scoped transaction.
 * An AST ID is never a File capability. No implementation is installed here. */
export interface RichAssetResolver<TTransaction, TActor> {
  assertReference(input: {
    transaction: TTransaction;
    actor: TActor;
    owner:
      | {
          domain: 'homework';
          homeworkId: string;
          questionId: string;
          optionId?: string;
        }
      | {
          domain: 'grades';
          assessmentId: string;
          questionId: string;
          optionId?: string;
        };
    schoolId: string;
    reference: RichAssetReference;
    audience: 'author' | 'student' | 'review';
  }): Promise<void>;
}
