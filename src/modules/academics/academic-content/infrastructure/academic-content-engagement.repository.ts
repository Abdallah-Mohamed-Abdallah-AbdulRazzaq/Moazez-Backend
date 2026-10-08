import { HttpStatus, Injectable } from '@nestjs/common';
import {
  AcademicContentEngagementEventType as EventType,
  Prisma,
} from '@prisma/client';
import {
  DomainException,
  NotFoundDomainException,
} from '../../../../common/exceptions/domain-exception';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { AcademicContentCurrentRecipientContext } from '../domain/academic-content-current-access.policy';
import {
  AcademicContentEngagementCommand,
  academicContentEngagementEligible,
  academicContentEngagementRequestFingerprint,
  academicContentEngagementRetryResult,
} from '../domain/academic-content-engagement.policy';
import { resolveAcademicContentFileType } from '../files/domain/academic-content-file.registry';
import { effectiveAcademicContentFilePolicy } from '../files/domain/academic-content-file-policy';
import {
  AcademicContentRecipientAuthority,
  RECIPIENT_TRANSACTION_OPTIONS,
} from './academic-content-recipient-authority';

type Context = AcademicContentCurrentRecipientContext;
type Tx = Prisma.TransactionClient;
type Identity = { publicationId: string; revisionId: string };
export type AcademicContentRecordedEngagement = {
  id: string;
  eventType: EventType;
  publicationId: string;
  revisionId: string;
  createdAt: Date;
  schoolId: string;
  actorUserId: string;
  clientRequestId: string;
  requestFingerprint: string;
};
function missing(): never {
  throw new NotFoundDomainException('Academic content not found');
}

/** Uses only the existing Prisma pool. No network/Redis work occurs in either transaction. */
@Injectable()
export class AcademicContentEngagementRepository extends AcademicContentRecipientAuthority {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  private async references(
    tx: Tx,
    context: Context,
    identity: Identity,
    command: AcademicContentEngagementCommand,
  ) {
    if (command.fileId) {
      const files = await tx.$queryRaw<
        { originalName: string; mimeType: string }[]
      >`SELECT file.original_name AS "originalName", file.mime_type AS "mimeType"
        FROM academic_content_revision_assets asset JOIN files file ON file.id = asset.file_id AND file.school_id = asset.school_id
        WHERE asset.school_id = ${context.schoolId}::uuid AND asset.revision_id = ${identity.revisionId}::uuid AND asset.file_id = ${command.fileId}::uuid
          AND file.visibility = 'PRIVATE' AND file.deleted_at IS NULL AND file.size_bytes > 0
        FOR SHARE OF asset, file`;
      if (!files.length) missing();
      await tx.$queryRaw`SELECT id FROM academic_content_file_policies WHERE school_id = ${context.schoolId}::uuid FOR SHARE`;
      const row = await tx.academicContentFilePolicy.findUnique({
        where: { schoolId: context.schoolId },
      });
      const policy = effectiveAcademicContentFilePolicy(row);
      if (
        command.eventType === EventType.FILE_PREVIEWED
          ? !policy.allowInlinePreview ||
            !resolveAcademicContentFileType(
              files[0].originalName,
              files[0].mimeType,
            )?.inlinePreviewSupported
          : !(context.actorKind === 'STUDENT'
              ? policy.allowStudentDownload
              : policy.allowGuardianDownload)
      )
        missing();
      return {
        revisionAsset: {
          schoolId: context.schoolId,
          revisionId: identity.revisionId,
          fileId: command.fileId,
        },
      };
    }
    if (command.revisionLinkId) {
      const links = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM academic_content_revision_links
        WHERE id = ${command.revisionLinkId}::uuid AND school_id = ${context.schoolId}::uuid AND revision_id = ${identity.revisionId}::uuid FOR SHARE`;
      if (!links.length) missing();
      return {
        revisionLink: {
          schoolId: context.schoolId,
          revisionId: identity.revisionId,
          id: links[0].id,
        },
      };
    }
    return {};
  }

  private finalEligibility(
    context: Context,
    contentId: string,
    membershipId: string,
    expectedPublicationId: string,
    guardianId: string | null,
    command: AcademicContentEngagementCommand,
    sessionEnd: Date | null,
  ) {
    const reference = command.fileId
      ? Prisma.sql`EXISTS (
      SELECT 1 FROM academic_content_revision_assets asset JOIN files file ON file.id = asset.file_id AND file.school_id = asset.school_id
      LEFT JOIN academic_content_file_policies policy ON policy.school_id = asset.school_id
      WHERE asset.school_id = ${context.schoolId}::uuid AND asset.revision_id = live."revisionId" AND asset.file_id = ${command.fileId}::uuid
        AND file.visibility = 'PRIVATE' AND file.deleted_at IS NULL AND file.size_bytes > 0
        AND ${command.eventType === EventType.FILE_PREVIEWED ? Prisma.sql`COALESCE(policy.allow_inline_preview, true)` : context.actorKind === 'STUDENT' ? Prisma.sql`COALESCE(policy.allow_student_download, true)` : Prisma.sql`COALESCE(policy.allow_guardian_download, true)`}
    )`
      : command.revisionLinkId
        ? Prisma.sql`EXISTS (SELECT 1 FROM academic_content_revision_links
      WHERE id = ${command.revisionLinkId}::uuid AND school_id = ${context.schoolId}::uuid AND revision_id = live."revisionId")`
        : Prisma.sql`true`;
    return Prisma.sql`SELECT live.* FROM (${this.currentEligibility(context, contentId, membershipId, expectedPublicationId, guardianId)}) live
      WHERE ${reference}
        ${sessionEnd === null ? Prisma.empty : Prisma.sql`AND live.at < ${sessionEnd}`}`;
  }

  async record(
    context: Context,
    membershipId: string,
    contentId: string,
    expectedPublicationId: string,
    command: AcademicContentEngagementCommand,
  ): Promise<AcademicContentRecordedEngagement> {
    // Hash only server-resolved facts outside the transaction. These exact identities
    // are resolved again under locks below; a changed identity is never persisted.
    const [candidate] = await this.prisma.$queryRaw<Identity[]>(
      this.canonical(context, contentId, membershipId),
    );
    if (!candidate || candidate.publicationId !== expectedPublicationId)
      missing();
    const candidateGuardianId = await this.guardian(
      this.prisma,
      context,
      false,
    );
    const requestFingerprint = academicContentEngagementRequestFingerprint(
      {
        schoolId: context.schoolId,
        academicContentId: contentId,
        ...candidate,
        actorUserId: context.userId,
        actorKind: context.actorKind,
        studentId: context.studentId,
        enrollmentId: context.enrollmentId,
        guardianId: candidateGuardianId,
      },
      command,
    );
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
      if (
        identity.publicationId !== candidate.publicationId ||
        identity.revisionId !== candidate.revisionId ||
        guardianId !== candidateGuardianId
      )
        missing();
      const references = await this.references(tx, context, identity, command);
      const publication = await tx.academicContentPublication.findFirst({
        where: { id: identity.publicationId, schoolId: context.schoolId },
        include: { revision: true },
      });
      if (!publication) missing();
      const [clock] = await tx.$queryRaw<
        { at: Date }[]
      >`SELECT clock_timestamp() AS at`;
      if (
        !academicContentEngagementEligible(
          {
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
            now: clock.at,
          },
          command,
          references,
        )
      )
        missing();
      // The immutable ONLINE_SESSION snapshot was decoded by ACC-11A above.
      const sessionEnd =
        command.eventType === EventType.JOIN_LINK_CLICKED
          ? new Date(
              (
                publication.revision.typeSpecificSnapshot as {
                  state: { endAt: string };
                }
              ).state.endAt,
            )
          : null;
      const eligible = this.finalEligibility(
        context,
        contentId,
        membershipId,
        expectedPublicationId,
        guardianId,
        command,
        sessionEnd,
      );
      const inserted = await tx.$queryRaw<
        AcademicContentRecordedEngagement[]
      >(Prisma.sql`INSERT INTO academic_content_engagement_events
        (id, school_id, academic_content_id, publication_id, revision_id, actor_user_id, actor_kind, student_id, enrollment_id, guardian_id, event_type, file_id, revision_link_id, client_request_id, request_fingerprint, created_at)
        SELECT gen_random_uuid(), ${context.schoolId}::uuid, ${contentId}::uuid, final."publicationId", final."revisionId", ${context.userId}::uuid,
          ${context.actorKind}::academic_content_engagement_actor_kind, ${context.studentId}::uuid, ${context.enrollmentId}::uuid, ${guardianId}::uuid,
          ${command.eventType}::academic_content_engagement_event_type, ${command.fileId ?? null}::uuid, ${command.revisionLinkId ?? null}::uuid,
          ${command.clientRequestId}::uuid, ${requestFingerprint}, final.at FROM (${eligible}) final
        ON CONFLICT (school_id, actor_user_id, client_request_id) DO NOTHING
        RETURNING id, event_type AS "eventType", publication_id AS "publicationId", revision_id AS "revisionId", created_at AS "createdAt", school_id AS "schoolId", actor_user_id AS "actorUserId", client_request_id AS "clientRequestId", request_fingerprint AS "requestFingerprint"`);
      let event = inserted[0];
      if (!event) {
        // Includes a fresh final clock after waiting on the unique constraint. Reauthorize every retry.
        const existing = await tx.$queryRaw<
          AcademicContentRecordedEngagement[]
        >`SELECT event.id, event.event_type AS "eventType", event.publication_id AS "publicationId", event.revision_id AS "revisionId", event.created_at AS "createdAt", event.school_id AS "schoolId", event.actor_user_id AS "actorUserId", event.client_request_id AS "clientRequestId", event.request_fingerprint AS "requestFingerprint"
          FROM academic_content_engagement_events event CROSS JOIN (${eligible}) authorized
          WHERE event.school_id = ${context.schoolId}::uuid AND event.actor_user_id = ${context.userId}::uuid AND event.client_request_id = ${command.clientRequestId}::uuid`;
        event = existing[0];
        if (!event) missing();
        if (
          academicContentEngagementRetryResult(event, {
            schoolId: context.schoolId,
            actorUserId: context.userId,
            clientRequestId: command.clientRequestId,
            requestFingerprint,
          }) !== 'IDENTICAL'
        ) {
          throw new DomainException({
            code: 'academic_content.engagement.idempotency_conflict',
            message: 'Engagement request identity already used',
            httpStatus: HttpStatus.CONFLICT,
          });
        }
      }
      return event;
    }, RECIPIENT_TRANSACTION_OPTIONS);
  }
}
