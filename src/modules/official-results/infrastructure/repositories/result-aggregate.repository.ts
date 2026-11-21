import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { OfficialResultsError } from '../../domain/official-results.error';

@Injectable()
export class ResultAggregateRepository {
  async lockStudent(
    client: Prisma.TransactionClient,
    schoolId: string,
    id: string,
  ) {
    const rows = await client.$queryRaw<{ id: string }[]>`
      SELECT id FROM students WHERE school_id = ${schoolId}::uuid AND id = ${id}::uuid AND deleted_at IS NULL FOR UPDATE
    `;
    if (rows.length !== 1) throw new NotFoundDomainException();
  }

  async lockSources(
    client: Prisma.TransactionClient,
    schoolId: string,
    publicationIds: string[],
  ) {
    const ids = Prisma.join(
      publicationIds.map((id) => Prisma.sql`${id}::uuid`),
    );
    await client.$queryRaw`
      SELECT DISTINCT_SOURCE.id FROM result_slots DISTINCT_SOURCE
      WHERE DISTINCT_SOURCE.school_id = ${schoolId}::uuid AND EXISTS (
        SELECT 1 FROM result_publications p
        WHERE p.school_id = DISTINCT_SOURCE.school_id AND p.slot_id = DISTINCT_SOURCE.id AND p.id IN (${ids})
      )
      ORDER BY DISTINCT_SOURCE.id FOR UPDATE
    `;
  }

  staleSources(
    client: Prisma.TransactionClient,
    schoolId: string,
    publicationId: string,
  ) {
    return client.$executeRaw`
      WITH affected AS (
        SELECT candidate_id FROM result_aggregate_dependencies WHERE school_id = ${schoolId}::uuid AND publication_id = ${publicationId}::uuid
      )
      UPDATE result_current_aggregates head SET stale = true, updated_at = clock_timestamp()
      FROM result_aggregate_publications p
      WHERE head.school_id = ${schoolId}::uuid AND p.school_id = head.school_id
        AND head.publication_id = p.id AND p.candidate_id IN (SELECT candidate_id FROM affected) AND head.stale = false
    `;
  }

  async candidate(
    client: Prisma.TransactionClient,
    schoolId: string,
    id: string,
  ) {
    const candidate = await client.resultAggregateCandidate.findFirst({
      where: { schoolId, id },
      include: {
        profileVersion: { include: { profile: true } },
        decision: true,
      },
    });
    if (!candidate) throw new NotFoundDomainException();
    return candidate;
  }

  async currentCandidate(
    client: Prisma.TransactionClient,
    schoolId: string,
    id: string,
    expectedRevision: number,
    digest: string,
  ) {
    const candidate = await this.candidate(client, schoolId, id);
    if (
      candidate.revision !== expectedRevision ||
      candidate.contentDigest !== digest ||
      candidate.profileVersion.revision !==
        candidate.profileVersion.profile.revision
    ) {
      throw new OfficialResultsError('candidate.stale');
    }
    return candidate;
  }
}
