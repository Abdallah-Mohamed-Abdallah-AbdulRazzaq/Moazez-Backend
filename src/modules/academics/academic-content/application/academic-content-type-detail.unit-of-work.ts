import { NormalizedDetail } from '../domain/academic-content-type-detail.policy';

export type TypeDetailMutation = {
  contentId: string;
  schoolId: string;
  organizationId: string;
  actorId: string;
  now: Date;
  detail: NormalizedDetail;
};

export type TypeDetailMutationResult = {
  changed: boolean;
  state: NormalizedDetail['state'];
};

export const ACADEMIC_CONTENT_TYPE_DETAIL_UNIT_OF_WORK = Symbol(
  'ACADEMIC_CONTENT_TYPE_DETAIL_UNIT_OF_WORK',
);

/** The application boundary has no transaction client or arbitrary database access. */
export interface AcademicContentTypeDetailUnitOfWork {
  mutate(input: TypeDetailMutation): Promise<TypeDetailMutationResult>;
}
