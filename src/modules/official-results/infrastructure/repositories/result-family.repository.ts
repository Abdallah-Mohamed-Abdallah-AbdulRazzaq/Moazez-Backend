import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

type FamilyPrincipal = {
  userId: string;
  membershipId: string;
  schoolId: string;
  audience: 'STUDENT' | 'PARENT';
};
export type FamilyOwnership = {
  schoolId: string;
  studentId: string;
  current: boolean;
};
export type FamilyPublicationRow = {
  id: string;
  schoolId: string;
  studentId: string;
  periodId: string;
  groupId: string;
  slotId: string;
  definitionVersionId: string;
  revision: number;
  publicationGeneration: number;
  publishedAt: Date;
  snapshot: Prisma.JsonValue;
  active: boolean;
  revoked: boolean;
  policy: Prisma.JsonValue | null;
  startsOn: Date;
  endsOn: Date;
  periodStatus: 'OPEN' | 'ENTRY_CLOSED' | 'ARCHIVED';
};
export type FamilyAggregateRow = {
  id: string;
  profileId: string;
  computed: Prisma.JsonValue;
  definition: Prisma.JsonValue;
  stale: boolean;
};

@Injectable()
export class ResultFamilyRepository {
  async ownership(
    client: Prisma.TransactionClient,
    principal: FamilyPrincipal,
    studentId?: string,
  ) {
    const { userId, membershipId, schoolId, audience } = principal;
    const identity =
      audience === 'STUDENT'
        ? Prisma.sql`st.user_id = ${userId}::uuid AND st.deleted_at IS NULL`
        : Prisma.sql`st.id = ${studentId}::uuid AND st.deleted_at IS NULL AND EXISTS (
        SELECT 1 FROM student_guardian_links link JOIN guardians g ON g.id = link.guardian_id AND g.school_id = link.school_id
        WHERE link.school_id = st.school_id AND link.student_id = st.id AND g.user_id = ${userId}::uuid AND g.deleted_at IS NULL
      )`;
    const retained =
      audience === 'STUDENT'
        ? Prisma.sql`e.relationship_id IS NULL AND EXISTS (
        SELECT 1 FROM students live WHERE live.user_id = ${userId}::uuid AND live.school_id = ${schoolId}::uuid AND live.deleted_at IS NULL
      )`
        : Prisma.sql`st.id = ${studentId}::uuid AND EXISTS (
        SELECT 1 FROM student_guardian_links link JOIN guardians g ON g.id = link.guardian_id AND g.school_id = link.school_id
        WHERE link.id = e.relationship_id AND link.school_id = e.school_id AND link.student_id = e.student_id
          AND g.user_id = ${userId}::uuid AND g.deleted_at IS NULL
      )`;
    const rows = await client.$queryRaw<FamilyOwnership[]>(Prisma.sql`
      WITH principal AS (
        SELECT u.id FROM users u JOIN memberships m ON m.user_id = u.id
        JOIN roles r ON r.id = m.role_id AND r.deleted_at IS NULL
        JOIN role_permissions rp ON rp.role_id = r.id
        JOIN permissions p ON p.id = rp.permission_id AND p.code = 'official_results.results.view'
        JOIN schools s ON s.id = m.school_id AND s.organization_id = m.organization_id
        JOIN organizations o ON o.id = s.organization_id
        WHERE u.id = ${userId}::uuid AND u.status = 'ACTIVE' AND u.deleted_at IS NULL
          AND u.user_type::text = ${audience} AND m.user_type::text = ${audience}
          AND m.id = ${membershipId}::uuid AND m.school_id = ${schoolId}::uuid
          AND m.status = 'ACTIVE' AND m.deleted_at IS NULL AND m.ended_at IS NULL
          AND (r.school_id IS NULL OR r.school_id = s.id)
          AND s.status = 'ACTIVE' AND s.deleted_at IS NULL AND o.status = 'ACTIVE' AND o.deleted_at IS NULL
      ), proof AS (
        SELECT st.school_id, st.id AS student_id, true AS current
        FROM students st JOIN principal p ON true
        WHERE st.school_id = ${schoolId}::uuid AND (${identity})
        UNION
        SELECT e.school_id, e.student_id, false AS current
        FROM result_read_entitlements e JOIN principal p ON p.id = e.actor_id
        JOIN students st ON st.id = e.student_id AND st.school_id = e.school_id
        WHERE e.revoked_at IS NULL AND e.school_id <> ${schoolId}::uuid AND (${retained})
      )
      SELECT proof.school_id AS "schoolId", proof.student_id AS "studentId", proof.current
      FROM proof JOIN schools s ON s.id = proof.school_id AND s.status = 'ACTIVE' AND s.deleted_at IS NULL
      JOIN organizations o ON o.id = s.organization_id AND o.status = 'ACTIVE' AND o.deleted_at IS NULL
      ORDER BY proof.current DESC, proof.school_id, proof.student_id
      LIMIT 101
    `);
    return rows;
  }

  publications(
    client: Prisma.TransactionClient,
    ownership: FamilyOwnership,
    input: {
      periodId?: string;
      groupId?: string;
      publicationId?: string;
      includeHistory?: boolean;
    },
  ) {
    return client.$queryRaw<FamilyPublicationRow[]>(Prisma.sql`
      SELECT p.id, p.school_id AS "schoolId", sl.student_id AS "studentId", r.id AS "periodId", sl.group_id AS "groupId",
        sl.id AS "slotId", p.definition_version_id AS "definitionVersionId", p.revision, p.publication_generation AS "publicationGeneration",
        p.published_at AS "publishedAt", c.snapshot, (active.id IS NOT NULL) AS active,
        EXISTS (SELECT 1 FROM result_release_events e WHERE e.school_id = p.school_id AND e.publication_id = p.id AND e.event = 'REVOKED') AS revoked,
        version.configuration AS policy, r.starts_on AS "startsOn", r.ends_on AS "endsOn", r.status AS "periodStatus"
      FROM result_publications p
      JOIN result_slots sl ON sl.id = p.slot_id AND sl.school_id = p.school_id
      JOIN result_reporting_periods r ON r.id = sl.reporting_period_id AND r.school_id = sl.school_id
      JOIN result_release_candidates c ON c.id = p.candidate_id AND c.school_id = p.school_id
      LEFT JOIN result_current_releases active ON active.publication_id = p.id AND active.school_id = p.school_id
      LEFT JOIN official_result_policies root ON root.school_id = p.school_id
      LEFT JOIN official_result_policy_versions version ON version.id = root.active_version_id AND version.school_id = p.school_id
      WHERE p.school_id = ${ownership.schoolId}::uuid AND sl.student_id = ${ownership.studentId}::uuid
        ${input.periodId ? Prisma.sql`AND r.id = ${input.periodId}::uuid` : Prisma.empty}
        ${input.groupId ? Prisma.sql`AND sl.group_id = ${input.groupId}::uuid` : Prisma.empty}
        ${input.publicationId ? Prisma.sql`AND p.id = ${input.publicationId}::uuid` : Prisma.empty}
        ${input.includeHistory ? Prisma.empty : Prisma.sql`AND active.id IS NOT NULL`}
      ORDER BY p.published_at DESC, p.id DESC
      LIMIT 2001
    `);
  }

  aggregates(
    client: Prisma.TransactionClient,
    ownership: FamilyOwnership,
    periodId: string,
  ) {
    return client.$queryRaw<FamilyAggregateRow[]>`
      SELECT p.id, p.profile_id AS "profileId", c.computed_result AS computed, v.definition,
        (a.stale OR EXISTS (
          SELECT 1 FROM result_aggregate_dependencies d
          LEFT JOIN result_current_releases release ON release.school_id = d.school_id AND release.publication_id = d.publication_id
          WHERE d.school_id = a.school_id AND d.candidate_id = c.id AND release.id IS NULL
        )) AS stale
      FROM result_current_aggregates a
      JOIN result_aggregate_publications p ON p.id = a.publication_id AND p.school_id = a.school_id
      JOIN result_aggregate_candidates c ON c.id = p.candidate_id AND c.school_id = p.school_id
      JOIN result_aggregate_profile_versions v ON v.id = c.profile_version_id AND v.school_id = c.school_id
      WHERE a.school_id = ${ownership.schoolId}::uuid AND a.student_id = ${ownership.studentId}::uuid
        AND a.reporting_period_id = ${periodId}::uuid
      ORDER BY p.published_at DESC, p.id DESC
      LIMIT 100
    `;
  }

  async issueReadEntitlements(
    client: Prisma.TransactionClient,
    schoolId: string,
    publicationId: string,
  ) {
    // First release records already-verified identity. Later grants never reactivate a revoked entitlement.
    await client.$executeRaw`
      WITH learner AS (
        SELECT st.id AS student_id, st.user_id
        FROM result_publications p JOIN result_slots sl ON sl.id = p.slot_id AND sl.school_id = p.school_id
        JOIN students st ON st.id = sl.student_id AND st.school_id = sl.school_id AND st.deleted_at IS NULL
        WHERE p.id = ${publicationId}::uuid AND p.school_id = ${schoolId}::uuid
      ), links AS (
        SELECT l.student_id, l.user_id AS actor_id, NULL::uuid AS relationship_id, 'STUDENT'::text AS audience
        FROM learner l WHERE l.user_id IS NOT NULL
        UNION ALL
        SELECT l.student_id, g.user_id, sg.id, 'PARENT'::text AS audience
        FROM learner l JOIN student_guardian_links sg ON sg.student_id = l.student_id AND sg.school_id = ${schoolId}::uuid
        JOIN guardians g ON g.id = sg.guardian_id AND g.school_id = sg.school_id AND g.deleted_at IS NULL
        WHERE g.user_id IS NOT NULL
      )
      INSERT INTO result_read_entitlements (school_id, student_id, actor_id, relationship_id, issued_from_id, updated_at)
      SELECT DISTINCT ON (links.actor_id) ${schoolId}::uuid, links.student_id, links.actor_id, links.relationship_id,
        ${publicationId}::uuid, clock_timestamp()
      FROM links JOIN users u ON u.id = links.actor_id AND u.deleted_at IS NULL AND u.status = 'ACTIVE' AND u.user_type::text = links.audience
      WHERE EXISTS (SELECT 1 FROM memberships m JOIN roles r ON r.id = m.role_id AND r.deleted_at IS NULL
        JOIN role_permissions rp ON rp.role_id = r.id JOIN permissions p ON p.id = rp.permission_id AND p.code = 'official_results.results.view'
        WHERE m.user_id = links.actor_id AND m.user_type::text = links.audience AND m.school_id = ${schoolId}::uuid
        AND m.status = 'ACTIVE' AND m.deleted_at IS NULL AND m.ended_at IS NULL)
      ORDER BY links.actor_id, links.relationship_id
      ON CONFLICT (school_id, student_id, actor_id) DO NOTHING
    `;
  }
}
