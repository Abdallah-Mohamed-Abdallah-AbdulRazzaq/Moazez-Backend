import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  DomainException,
  NotFoundDomainException,
} from '../../../../common/exceptions/domain-exception';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { AcademicContentCurrentRecipientContext } from '../domain/academic-content-current-access.policy';
import {
  childSql,
  currentRecipientPublicationQuery,
  matchingRevisionTarget,
} from './academic-content-recipient-read.repository';

type Context = AcademicContentCurrentRecipientContext;
type Tx = Prisma.TransactionClient;
type Identity = { publicationId: string; revisionId: string };
export const RECIPIENT_TRANSACTION_OPTIONS = {
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

/** Shared ACC-11B live authority and School/actor admission; uses the existing Prisma pool. */
@Injectable()
export class AcademicContentRecipientAuthority {
  constructor(protected readonly prisma: PrismaService) {}
  protected async deadlines(tx: Tx): Promise<void> {
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
    }, RECIPIENT_TRANSACTION_OPTIONS);
    if (!admitted[0]?.authorized) missing();
    if (!admitted[0].admitted) {
      throw new DomainException({
        code: 'rate_limit.exceeded',
        message: 'Too many engagement requests',
        httpStatus: HttpStatus.TOO_MANY_REQUESTS,
      });
    }
  }

  protected canonical(
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

  protected async lockAuthority(
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

  protected async guardian(
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

  protected currentEligibility(
    context: Context,
    contentId: string,
    membershipId: string,
    expectedPublicationId: string,
    guardianId: string | null,
  ) {
    return Prisma.sql`WITH final_clock AS MATERIALIZED (SELECT clock_timestamp() AS at), live AS MATERIALIZED (
      ${this.canonical(context, contentId, membershipId, Prisma.sql`(SELECT at FROM final_clock)`)}
    ) SELECT live.*, final_clock.at FROM live CROSS JOIN final_clock
      WHERE live."publicationId" = ${expectedPublicationId}::uuid
        ${
          guardianId === null
            ? Prisma.empty
            : Prisma.sql`AND EXISTS (SELECT 1 FROM guardians guardian JOIN student_guardian_links link ON link.guardian_id = guardian.id AND link.school_id = guardian.school_id
          WHERE guardian.id = ${guardianId}::uuid AND guardian.school_id = ${context.schoolId}::uuid AND guardian.user_id = ${context.userId}::uuid AND guardian.deleted_at IS NULL AND link.student_id = ${context.studentId}::uuid
            AND guardian.organization_id = (SELECT organization_id FROM schools WHERE id = ${context.schoolId}::uuid))`
        }`;
  }
}
