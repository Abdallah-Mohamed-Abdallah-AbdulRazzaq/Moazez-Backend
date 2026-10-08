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
  childSql,
  currentRecipientPublicationQuery,
  matchingRevisionTarget,
} from './academic-content-recipient-read.repository';

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
const TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  maxWait: 1000,
  timeout: 5000,
};
const CLOCK = Prisma.sql`clock_timestamp()`;

function missing(): never {
  throw new NotFoundDomainException('Academic content not found');
}

function membershipAllows(context: Context, membershipId: string) {
  return Prisma.sql`EXISTS (
    SELECT 1 FROM memberships membership
    JOIN roles role ON role.id = membership.role_id
    JOIN role_permissions grant_row ON grant_row.role_id = role.id
    JOIN permissions permission ON permission.id = grant_row.permission_id
    JOIN schools membership_school ON membership_school.id = membership.school_id
    WHERE membership.id = ${membershipId}::uuid
      AND membership.user_id = ${context.userId}::uuid AND membership.school_id = ${context.schoolId}::uuid
      AND membership.organization_id = membership_school.organization_id
      AND membership.user_type::text = ${context.actorKind}
      AND membership.status = 'ACTIVE' AND membership.deleted_at IS NULL AND membership.ended_at IS NULL
      AND role.deleted_at IS NULL AND (role.school_id IS NULL OR role.school_id = membership.school_id)
      AND permission.code = 'academics.academic_content.view'
  )`;
}

/** Uses only the existing Prisma pool. No network/Redis work occurs in either transaction. */
@Injectable()
export class AcademicContentEngagementRepository {
  constructor(private readonly prisma: PrismaService) {}

  private async deadlines(tx: Tx): Promise<void> {
    await tx.$executeRaw`SET LOCAL lock_timeout = '1500ms'`;
    await tx.$executeRaw`SET LOCAL statement_timeout = '3000ms'`;
  }

  async admit(context: Context, membershipId: string): Promise<void> {
    // Commit admission separately: denied content/conflicts cannot roll back abuse accounting.
    const admitted = await this.prisma.$transaction(async (tx) => {
      await this.deadlines(tx);
      return tx.$queryRaw<
        { authorized: boolean; admitted: boolean }[]
      >(Prisma.sql`
        WITH request_clock AS MATERIALIZED (SELECT clock_timestamp() AS at), authorized AS MATERIALIZED (
          SELECT at FROM request_clock WHERE ${membershipAllows(context, membershipId)}
            AND EXISTS (SELECT 1 FROM users WHERE id = ${context.userId}::uuid
              AND user_type::text = ${context.actorKind} AND status = 'ACTIVE' AND deleted_at IS NULL)
            AND EXISTS (SELECT 1 FROM schools school JOIN organizations organization ON organization.id = school.organization_id
              WHERE school.id = ${context.schoolId}::uuid AND school.status = 'ACTIVE' AND school.deleted_at IS NULL
                AND organization.status = 'ACTIVE' AND organization.deleted_at IS NULL)
        ), admission AS (
        INSERT INTO academic_content_engagement_admissions
          (id, school_id, actor_user_id, window_started_at, request_count, created_at, updated_at)
        SELECT gen_random_uuid(), ${context.schoolId}::uuid, ${context.userId}::uuid, at, 1, at, at
        FROM authorized WHERE true
        ON CONFLICT (school_id, actor_user_id) DO UPDATE SET
          window_started_at = CASE WHEN academic_content_engagement_admissions.window_started_at <= EXCLUDED.window_started_at - interval '60 seconds'
            THEN EXCLUDED.window_started_at ELSE academic_content_engagement_admissions.window_started_at END,
          request_count = CASE WHEN academic_content_engagement_admissions.window_started_at <= EXCLUDED.window_started_at - interval '60 seconds'
            THEN 1 ELSE academic_content_engagement_admissions.request_count + 1 END,
          updated_at = EXCLUDED.updated_at
        WHERE academic_content_engagement_admissions.window_started_at <= EXCLUDED.window_started_at - interval '60 seconds'
          OR academic_content_engagement_admissions.request_count < 60
        RETURNING id)
        SELECT EXISTS(SELECT 1 FROM authorized) AS authorized, EXISTS(SELECT 1 FROM admission) AS admitted`);
    }, TRANSACTION_OPTIONS);
    if (!admitted[0]?.authorized) missing();
    if (!admitted[0].admitted) {
      throw new DomainException({
        code: 'rate_limit.exceeded',
        message: 'Too many engagement requests',
        httpStatus: HttpStatus.TOO_MANY_REQUESTS,
      });
    }
  }

  private canonical(
    context: Context,
    contentId: string,
    membershipId: string,
    now: Prisma.Sql = CLOCK,
  ) {
    return Prisma.sql`SELECT p.id AS "publicationId", p.revision_id AS "revisionId"
      ${currentRecipientPublicationQuery(context, now, childSql(context))}
        AND p.academic_content_id = ${contentId}::uuid AND ${matchingRevisionTarget()}
        AND student.organization_id = school.organization_id
        AND ${membershipAllows(context, membershipId)}
      ORDER BY p.visible_from DESC, p.id DESC LIMIT 1`;
  }

  private async lockAuthority(
    tx: Tx,
    context: Context,
    contentId: string,
    membershipId: string,
  ): Promise<Identity> {
    // Matches ACC-7/ACC-9 Content-first ordering. SHARE permits independent event writers.
    const content = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM academic_contents
      WHERE id = ${contentId}::uuid AND school_id = ${context.schoolId}::uuid AND deleted_at IS NULL FOR SHARE`;
    if (!content.length) missing();
    const [identity] = await tx.$queryRaw<Identity[]>(
      this.canonical(context, contentId, membershipId),
    );
    if (!identity) missing();
    await tx.$queryRaw`SELECT id FROM academic_content_publications WHERE id = ${identity.publicationId}::uuid AND school_id = ${context.schoolId}::uuid FOR SHARE`;
    // Lock all live rows used by the shared ACC-10 authority, then re-read at READ COMMITTED.
    await tx.$queryRaw(Prisma.sql`SELECT p.id
      ${currentRecipientPublicationQuery(context, CLOCK, childSql(context))}
        AND p.id = ${identity.publicationId}::uuid AND ${matchingRevisionTarget()}
      FOR SHARE OF r, school, organization, actor, student, e, classroom, section, grade, stage`);
    const membership = await tx.$queryRaw<
      { id: string }[]
    >`SELECT membership.id FROM memberships membership
      JOIN roles role ON role.id = membership.role_id
      JOIN role_permissions grant_row ON grant_row.role_id = role.id
      JOIN permissions permission ON permission.id = grant_row.permission_id
      WHERE membership.id = ${membershipId}::uuid AND membership.school_id = ${context.schoolId}::uuid
        AND membership.user_id = ${context.userId}::uuid AND permission.code = 'academics.academic_content.view'
      FOR SHARE OF membership, role, grant_row, permission`;
    if (!membership.length) missing();
    // A positive subject allocation can be revoked independently of Content.
    await tx.$queryRaw`SELECT allocation.id FROM subject_allocations allocation
      JOIN academic_content_revision_targets target ON target.subject_id = allocation.subject_id AND target.school_id = allocation.school_id
      JOIN grades grade ON grade.id = allocation.grade_id AND grade.school_id = allocation.school_id
      JOIN sections section ON section.grade_id = grade.id AND section.school_id = grade.school_id
      JOIN classrooms classroom ON classroom.section_id = section.id AND classroom.school_id = section.school_id
      WHERE target.revision_id = ${identity.revisionId}::uuid AND allocation.school_id = ${context.schoolId}::uuid
        AND allocation.academic_year_id = ${context.academicYearId}::uuid AND allocation.term_id = ${context.termId}::uuid
        AND classroom.id = ${context.classroomId}::uuid AND allocation.weekly_hours > 0 AND allocation.deleted_at IS NULL
      ORDER BY allocation.id FOR SHARE OF allocation`;
    const [current] = await tx.$queryRaw<Identity[]>(
      this.canonical(context, contentId, membershipId),
    );
    if (!current || current.publicationId !== identity.publicationId) missing();
    return identity;
  }

  private async guardian(
    tx: Tx,
    context: Context,
    lock = true,
  ): Promise<string | null> {
    if (context.actorKind === 'STUDENT') return null;
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`SELECT guardian.id FROM guardians guardian
      JOIN student_guardian_links link ON link.guardian_id = guardian.id AND link.school_id = guardian.school_id
      WHERE guardian.school_id = ${context.schoolId}::uuid AND guardian.user_id = ${context.userId}::uuid
        AND guardian.organization_id = (SELECT organization_id FROM schools WHERE id = ${context.schoolId}::uuid)
        AND guardian.id = ANY(${[...context.guardianIds]}::uuid[]) AND guardian.deleted_at IS NULL
        AND link.student_id = ${context.studentId}::uuid
      ORDER BY guardian.id ${lock ? Prisma.sql`FOR SHARE OF guardian, link` : Prisma.empty}`;
    if (!rows.length) missing();
    return rows[0].id;
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
    return Prisma.sql`WITH final_clock AS MATERIALIZED (SELECT clock_timestamp() AS at), live AS MATERIALIZED (
      ${this.canonical(context, contentId, membershipId, Prisma.sql`(SELECT at FROM final_clock)`)}
    ) SELECT live.*, final_clock.at FROM live CROSS JOIN final_clock
      WHERE live."publicationId" = ${expectedPublicationId}::uuid AND ${reference}
        ${
          guardianId === null
            ? Prisma.empty
            : Prisma.sql`AND EXISTS (SELECT 1 FROM guardians guardian JOIN student_guardian_links link ON link.guardian_id = guardian.id AND link.school_id = guardian.school_id
          WHERE guardian.id = ${guardianId}::uuid AND guardian.school_id = ${context.schoolId}::uuid AND guardian.user_id = ${context.userId}::uuid AND guardian.deleted_at IS NULL AND link.student_id = ${context.studentId}::uuid
            AND guardian.organization_id = (SELECT organization_id FROM schools WHERE id = ${context.schoolId}::uuid))`
        }
        ${sessionEnd === null ? Prisma.empty : Prisma.sql`AND final_clock.at < ${sessionEnd}`}`;
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
    }, TRANSACTION_OPTIONS);
  }
}
