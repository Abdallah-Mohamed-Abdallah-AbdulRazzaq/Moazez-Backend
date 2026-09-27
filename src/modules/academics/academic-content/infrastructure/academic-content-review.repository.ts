import { Injectable } from '@nestjs/common';
import { AcademicContentTargetScopeType, Prisma } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { AcademicContentReviewQueueQuery } from '../domain/academic-content-review.query';
import {
  academicContentSubjectApplicability,
  academicContentTargetScopePredicate,
  resolveAcademicContentScope,
} from './academic-content-library-scope.query';

type QueueRow = {
  contentId: string;
  title: string;
  academicYearId: string;
  termId: string;
  approvalId: string;
  submittedRevisionId: string;
  roundNumber: number;
  submittedAt: Date;
  submittedByUserId: string;
};

export type ReviewQueueTarget = {
  scopeType: AcademicContentTargetScopeType;
  stageId: string | null;
  gradeId: string | null;
  sectionId: string | null;
  classroomId: string | null;
  subjectId: string | null;
  teacherSubjectAllocationId: string | null;
};

export type ReviewQueueItem = QueueRow & { targets: ReviewQueueTarget[] };

const HISTORY_FIELDS =
  Prisma.validator<Prisma.AcademicContentApprovalDefaultArgs>()({
    select: {
      id: true,
      revisionId: true,
      roundNumber: true,
      status: true,
      submittedByUserId: true,
      submittedAt: true,
      decidedByUserId: true,
      decidedAt: true,
      decisionNote: true,
    },
  });

export type ApprovalHistoryItem = Prisma.AcademicContentApprovalGetPayload<
  typeof HISTORY_FIELDS
>;

@Injectable()
export class AcademicContentReviewRepository {
  constructor(private readonly prisma: PrismaService) {}

  async queue(
    schoolId: string,
    query: AcademicContentReviewQueueQuery & { page: number; limit: number },
  ): Promise<{
    items: ReviewQueueItem[];
    page: number;
    limit: number;
    total: number;
  }> {
    const scope = await resolveAcademicContentScope(
      this.prisma,
      schoolId,
      query,
    );
    if (scope === null)
      return { items: [], page: query.page, limit: query.limit, total: 0 };

    const clauses: Prisma.Sql[] = [
      Prisma.sql`a.school_id = ${schoolId}::uuid`,
      Prisma.sql`c.deleted_at IS NULL`,
      Prisma.sql`c.type = 'TEACHER_PREPARATION'::academic_content_type`,
      Prisma.sql`c.status = 'SUBMITTED'::academic_content_status`,
      Prisma.sql`a.status = 'PENDING'::academic_content_approval_status`,
      Prisma.sql`NOT EXISTS (
        SELECT 1 FROM academic_content_approvals later
        WHERE later.school_id = a.school_id
          AND later.academic_content_id = a.academic_content_id
          AND later.round_number > a.round_number)`,
    ];
    if (query.academicYearId)
      clauses.push(
        Prisma.sql`r.academic_year_id = ${query.academicYearId}::uuid`,
      );
    if (query.termId)
      clauses.push(Prisma.sql`r.term_id = ${query.termId}::uuid`);
    const search = query.search?.normalize('NFKC').trim();
    if (search)
      clauses.push(Prisma.sql`(
        POSITION(LOWER(${search}) IN LOWER(r.title)) > 0 OR
        POSITION(LOWER(${search}) IN LOWER(COALESCE(r.description, ''))) > 0 OR
        EXISTS (
          SELECT 1 FROM academic_content_revision_tags search_tag
          WHERE search_tag.school_id = a.school_id
            AND search_tag.revision_id = a.revision_id
            AND POSITION(LOWER(${search}) IN LOWER(search_tag.normalized_value)) > 0))`);
    if (scope || query.subjectId || query.teacherUserId) {
      const targets: Prisma.Sql[] = [
        Prisma.sql`t.school_id = a.school_id`,
        Prisma.sql`t.revision_id = a.revision_id`,
      ];
      if (scope) targets.push(academicContentTargetScopePredicate(scope));
      if (query.subjectId)
        targets.push(Prisma.sql`t.subject_id = ${query.subjectId}::uuid`);
      if (query.teacherUserId)
        targets.push(Prisma.sql`EXISTS (
          SELECT 1 FROM teacher_subject_allocations teacher_allocation
          WHERE teacher_allocation.id = t.teacher_subject_allocation_id
            AND teacher_allocation.school_id = a.school_id
            AND teacher_allocation.teacher_user_id = ${query.teacherUserId}::uuid)`);
      if (scope || query.subjectId)
        targets.push(
          Prisma.sql`(t.subject_id IS NULL OR ${academicContentSubjectApplicability(scope, Prisma.sql`r.academic_year_id`, Prisma.sql`r.term_id`)})`,
        );
      clauses.push(Prisma.sql`EXISTS (
        SELECT 1 FROM academic_content_revision_targets t
        WHERE ${Prisma.join(targets, ' AND ')})`);
    }

    const fromWhere = Prisma.sql`
      FROM academic_content_approvals a
      JOIN academic_contents c
        ON c.id = a.academic_content_id AND c.school_id = a.school_id
      JOIN academic_content_revisions r
        ON r.id = a.revision_id AND r.school_id = a.school_id
          AND r.academic_content_id = a.academic_content_id
      WHERE ${Prisma.join(clauses, ' AND ')}`;
    const offset = (query.page - 1) * query.limit;
    const [rows, totals] = await Promise.all([
      this.prisma.$queryRaw<QueueRow[]>(Prisma.sql`
        SELECT c.id AS "contentId", r.title,
          r.academic_year_id AS "academicYearId",
          r.term_id AS "termId",
          a.id AS "approvalId", a.revision_id AS "submittedRevisionId",
          a.round_number AS "roundNumber", a.submitted_at AS "submittedAt",
          a.submitted_by_user_id AS "submittedByUserId"
        ${fromWhere}
        ORDER BY a.submitted_at ASC, a.id ASC
        LIMIT ${query.limit} OFFSET ${offset}`),
      this.prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
        SELECT COUNT(*) AS total ${fromWhere}`),
    ]);
    if (!rows.length)
      return {
        items: [],
        page: query.page,
        limit: query.limit,
        total: Number(totals[0]?.total ?? 0),
      };

    const revisionIds = rows.map((row) => row.submittedRevisionId);
    const targetRows = await this.prisma.academicContentRevisionTarget.findMany(
      {
        where: { schoolId, revisionId: { in: revisionIds } },
        select: {
          revisionId: true,
          scopeType: true,
          stageId: true,
          gradeId: true,
          sectionId: true,
          classroomId: true,
          subjectId: true,
          teacherSubjectAllocationId: true,
        },
        orderBy: [{ identityFingerprint: 'asc' }, { id: 'asc' }],
      },
    );
    const targetsByRevision = new Map<string, ReviewQueueTarget[]>();
    for (const { revisionId, ...target } of targetRows) {
      const current = targetsByRevision.get(revisionId) ?? [];
      current.push(target);
      targetsByRevision.set(revisionId, current);
    }
    return {
      items: rows.map((row) => ({
        ...row,
        targets: targetsByRevision.get(row.submittedRevisionId) ?? [],
      })),
      page: query.page,
      limit: query.limit,
      total: Number(totals[0]?.total ?? 0),
    };
  }

  async history(input: {
    schoolId: string;
    contentId: string;
    page: number;
    limit: number;
  }): Promise<{
    items: ApprovalHistoryItem[];
    page: number;
    limit: number;
    total: number;
  }> {
    const content = await this.prisma.academicContent.findFirst({
      where: {
        id: input.contentId,
        schoolId: input.schoolId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!content)
      throw new NotFoundDomainException('Academic content not found');
    const where = {
      schoolId: input.schoolId,
      academicContentId: input.contentId,
    };
    const [items, total] = await Promise.all([
      this.prisma.academicContentApproval.findMany({
        where,
        ...HISTORY_FIELDS,
        orderBy: [{ roundNumber: 'desc' }, { id: 'desc' }],
        skip: (input.page - 1) * input.limit,
        take: input.limit,
      }),
      this.prisma.academicContentApproval.count({ where }),
    ]);
    return { items, page: input.page, limit: input.limit, total };
  }
}
