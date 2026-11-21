import { z } from 'zod/v4';
import {
  resultAggregateDefinition,
  resultAggregateValue,
} from '../domain/result-aggregate.contract';

const uuid = z.uuid();
const revision = z.number().int().min(1);
const profile = z.object({
  profileId: uuid,
  profileVersionId: uuid,
  revision,
  definition: resultAggregateDefinition,
});
const candidate = z.object({
  candidateKind: z.literal('AGGREGATE'),
  candidateId: uuid,
  candidateRevision: revision,
  status: z.enum([
    'SUBMITTED',
    'APPROVED',
    'READY_FOR_DIRECT',
    'RETURNED',
    'SUPERSEDED',
  ]),
  contentDigest: z.string().length(64),
  reportingPeriodId: uuid,
  studentId: uuid,
  profileVersionId: uuid,
  sourcePublicationIds: z.array(uuid),
  computedResult: resultAggregateValue,
});
const publication = z.object({
  publicationId: uuid,
  revision,
  status: z.enum(['ACTIVE', 'SUPERSEDED', 'REVOKED', 'STALE']),
  profileVersionId: uuid,
  sourcePublicationIds: z.array(uuid),
  computedResult: resultAggregateValue,
  publishedAt: z.iso.datetime(),
});
export const aggregateOutputs = { profile, candidate, publication };
