import { Injectable } from '@nestjs/common';
import { FileVisibility, Prisma } from '@prisma/client';
import { StorageService } from '../../../../infrastructure/storage/storage.service';
import { AssessmentMediaRepository } from './assessment-media.repository';
import {
  AssessmentMediaException,
  type AssessmentMediaOwner,
} from '../domain/assessment-media.contract';
import {
  assertAssessmentUploadPolicy,
  type EffectiveAssessmentMediaPolicy,
} from '../domain/assessment-media.policy';
import { effectiveAssessmentMediaPolicy } from '../domain/assessment-media.policy';
import { assertAssessmentReadyContentPolicy } from '../domain/assessment-media-ready';

/** Storage/provenance primitive only. Callers own parent, question and Answer locks. */
@Injectable()
export class AnswerMediaRegistry {
  private readonly privateBucket: string;
  constructor(
    private readonly media: AssessmentMediaRepository,
    storage: StorageService,
  ) {
    this.privateBucket = storage.resolveBucket(FileVisibility.PRIVATE);
  }

  async resolve(
    tx: Prisma.TransactionClient,
    owner: AssessmentMediaOwner,
    uploadId: string,
    policy: EffectiveAssessmentMediaPolicy,
  ) {
    await tx.$queryRaw`SELECT id FROM assessment_answer_upload_intents WHERE upload_id=${uploadId}::uuid AND school_id=${owner.schoolId}::uuid FOR SHARE`;
    const intent = await tx.assessmentAnswerUploadIntent.findFirst({
      where: {
        uploadId,
        schoolId: owner.schoolId,
        organizationId: owner.organizationId,
        actorId: owner.actorId,
        contextId: owner.contextId,
        questionId: owner.questionId,
        purpose: owner.purpose,
      },
    });
    if (!intent) throw new AssessmentMediaException('upload_not_found');
    const session = await tx.fileUploadSession.findFirst({
      where: { id: uploadId, schoolId: owner.schoolId },
    });
    if (!session?.fileId)
      throw new AssessmentMediaException('ready_relationship_invalid');
    const { file, session: readySession } = await this.media.readyAnswerFile(
      tx,
      {
        uploadId,
        fileId: session.fileId,
        contextId: owner.contextId,
        questionId: intent.questionId,
        creatorId: owner.actorId,
        privateBucket: this.privateBucket,
        expectedPurpose: intent.purpose as
          | 'HOMEWORK_SUBMISSION_MEDIA'
          | 'GRADE_SUBMISSION_MEDIA',
        lock: true,
      },
    );
    assertAssessmentUploadPolicy(policy, owner, file.mimeType, file.sizeBytes);
    assertAssessmentReadyContentPolicy(policy, readySession, file);
    await this.media.assertAnswerBindingCapacity(tx, owner, policy);
    return { intent, file };
  }

  async verifyRead(
    tx: Prisma.TransactionClient,
    input: {
      fileId: string;
      uploadId: string;
      contextId: string;
      questionId: string;
      creatorId: string;
      purpose: 'HOMEWORK_SUBMISSION_MEDIA' | 'GRADE_SUBMISSION_MEDIA';
    },
  ) {
    const { file, session } = await this.media.readyAnswerFile(tx, {
      ...input,
      expectedPurpose: input.purpose,
      privateBucket: this.privateBucket,
      lock: true,
    });
    const policy = effectiveAssessmentMediaPolicy(
      await tx.schoolAssessmentMediaPolicy.findFirst({
        where: { schoolId: file.schoolId! },
      }),
    );
    assertAssessmentReadyContentPolicy(policy, session, file);
    return file;
  }
}
