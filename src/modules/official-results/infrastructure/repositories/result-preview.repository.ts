import { Injectable } from '@nestjs/common';
import type { Prisma, ResultConfigurationPreviewKind } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import type { ResultActor } from '../../application/result-actor';
import { OfficialResultsError } from '../../domain/official-results.error';
import { resultContentDigest } from '../../domain/result-content-digest';

@Injectable()
export class ResultPreviewRepository {
  async create(
    client: Prisma.TransactionClient,
    actor: ResultActor,
    kind: ResultConfigurationPreviewKind,
    resourceId: string | null,
    binding: Prisma.InputJsonObject,
  ) {
    const expiresAt = new Date(Date.now() + 15 * 60_000);
    const digest = resultContentDigest(binding);
    const preview = await client.resultConfigurationPreview.create({
      data: {
        schoolId: actor.schoolId,
        authorId: actor.actorId,
        kind,
        resourceId,
        binding,
        digest,
        expiresAt,
      },
      select: { id: true },
    });
    return {
      previewId: preview.id,
      previewDigest: digest,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async load(
    client: Prisma.TransactionClient,
    actor: ResultActor,
    kind: ResultConfigurationPreviewKind,
    resourceId: string | null,
    previewId: string,
    digest: string,
  ) {
    const preview = await client.resultConfigurationPreview.findFirst({
      where: {
        schoolId: actor.schoolId,
        authorId: actor.actorId,
        kind,
        resourceId,
        id: previewId,
      },
      select: { digest: true, expiresAt: true, binding: true },
    });
    if (!preview) throw new NotFoundDomainException();
    if (preview.expiresAt <= new Date() || preview.digest !== digest) {
      throw new OfficialResultsError('preview.stale');
    }
    return preview.binding;
  }
}
