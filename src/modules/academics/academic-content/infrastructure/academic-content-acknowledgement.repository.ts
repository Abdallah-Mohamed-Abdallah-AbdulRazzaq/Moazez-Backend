import { Injectable } from '@nestjs/common';
import { AcademicContentType, Prisma } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { AcademicContentCurrentRecipientContext } from '../domain/academic-content-current-access.policy';
import { academicContentAcknowledgementEligible } from '../domain/academic-content-engagement.policy';
import { decodeAcademicContentRevisionSnapshotV2 } from '../domain/academic-content-revision-snapshot';
import {
  AcademicContentRecipientAuthority,
  RECIPIENT_TRANSACTION_OPTIONS,
} from './academic-content-recipient-authority';

type Context = Extract<
  AcademicContentCurrentRecipientContext,
  { actorKind: 'PARENT' }
>;
type Identity = { publicationId: string; revisionId: string };
type Recorded = { id: string; acknowledgedAt: Date };
function missing(): never {
  throw new NotFoundDomainException('Academic content not found');
}

@Injectable()
export class AcademicContentAcknowledgementRepository extends AcademicContentRecipientAuthority {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  protected async note(
    tx: Prisma.TransactionClient,
    context: Context,
    identity: Identity,
    guardianId: string,
  ) {
    const publication = await tx.academicContentPublication.findFirst({
      where: { id: identity.publicationId, schoolId: context.schoolId },
      include: { revision: true },
    });
    if (
      !publication ||
      publication.revision.type !== AcademicContentType.GUARDIAN_WEEKLY_NOTE
    )
      missing();
    let required: boolean;
    try {
      const snapshot = decodeAcademicContentRevisionSnapshotV2(
        publication.revision.typeSpecificSnapshot,
        publication.revision.type,
      );
      if (snapshot.type !== AcademicContentType.GUARDIAN_WEEKLY_NOTE) missing();
      required = snapshot.state.requiresAcknowledgement;
    } catch {
      missing();
    }
    const [{ at }] = await tx.$queryRaw<
      { at: Date }[]
    >`SELECT clock_timestamp() AS at`;
    if (
      required &&
      !academicContentAcknowledgementEligible({
        context,
        publication,
        canonicalPublicationId: identity.publicationId,
        currentRelationship: {
          schoolId: context.schoolId,
          actorUserId: context.userId,
          studentId: context.studentId,
          enrollmentId: context.enrollmentId,
          guardianId,
        },
        typeSpecificSnapshot: publication.revision.typeSpecificSnapshot,
        now: at,
      })
    )
      missing();
    return required;
  }

  private eligible(
    context: Context,
    membershipId: string,
    contentId: string,
    publicationId: string,
    guardianId: string,
    required: boolean,
  ) {
    return Prisma.sql`SELECT live.* FROM (${this.currentEligibility(context, contentId, membershipId, publicationId, guardianId)}) live
      JOIN academic_content_revisions revision ON revision.id = live."revisionId" AND revision.school_id = ${context.schoolId}::uuid
      WHERE revision.academic_content_id = ${contentId}::uuid AND revision.type = 'GUARDIAN_WEEKLY_NOTE'
        AND revision.snapshot_contract_version = 2
        AND revision.type_specific_snapshot #> '{state,requiresAcknowledgement}' = ${JSON.stringify(required)}::jsonb`;
  }

  async resolve(
    context: Context,
    membershipId: string,
    contentId: string,
    expectedPublicationId: string,
    write: boolean,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.deadlines(tx);
      const identity = await this.lockAuthority(
        tx,
        context,
        contentId,
        membershipId,
      );
      if (identity.publicationId !== expectedPublicationId) missing();
      const guardianId = await this.guardian(tx, context);
      if (!guardianId) missing();
      const required = await this.note(tx, context, identity, guardianId);
      if (write && !required) missing();
      const eligible = this.eligible(
        context,
        membershipId,
        contentId,
        expectedPublicationId,
        guardianId,
        required,
      );
      let created = false;
      if (write) {
        created =
          (await tx.$executeRaw(Prisma.sql`
          INSERT INTO academic_content_acknowledgements
            (id, school_id, academic_content_id, publication_id, revision_id, student_id, enrollment_id, actor_user_id, guardian_id, acknowledged_at, created_at)
          SELECT gen_random_uuid(), ${context.schoolId}::uuid, ${contentId}::uuid, live."publicationId", live."revisionId",
            ${context.studentId}::uuid, ${context.enrollmentId}::uuid, ${context.userId}::uuid, ${guardianId}::uuid, live.at, live.at FROM (${eligible}) live
          ON CONFLICT (school_id, publication_id, student_id, actor_user_id) DO NOTHING`)) ===
          1;
      }
      // Recheck even an insert winner: a conflicting transaction may roll back after expiry.
      // Historical Guardian/Enrollment never become ACLs.
      const [status] = await tx.$queryRaw<
        { id: string | null; acknowledgedAt: Date | null }[]
      >(Prisma.sql`
          SELECT acknowledgement.id, acknowledgement.acknowledged_at AS "acknowledgedAt" FROM (${eligible}) live
          LEFT JOIN academic_content_acknowledgements acknowledgement
            ON acknowledgement.school_id = ${context.schoolId}::uuid AND acknowledgement.publication_id = live."publicationId"
            AND acknowledgement.student_id = ${context.studentId}::uuid AND acknowledgement.actor_user_id = ${context.userId}::uuid`);
      if (!status || (write && !status.id)) missing();
      const acknowledgement: Recorded | null =
        status.id && status.acknowledgedAt
          ? {
              id: status.id,
              acknowledgedAt: status.acknowledgedAt,
            }
          : null;
      return {
        ...identity,
        created,
        requiresAcknowledgement: required,
        acknowledgement: required ? (acknowledgement ?? null) : null,
      };
    }, RECIPIENT_TRANSACTION_OPTIONS);
  }
}
