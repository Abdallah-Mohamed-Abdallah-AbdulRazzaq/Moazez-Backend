import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import {
  AcademicContentAudienceRecipientKind as Kind,
  AcademicContentPublicationStatus as PublicationStatus,
  AcademicContentStatus as ContentStatus,
  AuditOutcome,
  Prisma,
  UserType,
} from '@prisma/client';
import {
  DomainException,
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { AcademicContentRevisionAudienceResolver } from '../application/academic-content-revision-audience.resolver';
import {
  academicContentRecipientIdentity,
  assertAcademicContentPublicationUuid,
} from '../domain/academic-content-publication.policy';

export type AcademicContentPublicationExecutionInput = {
  schoolId: string;
  contentId: string;
  publicationId: string;
  now: Date;
};
export type AcademicContentPublicationExecutionOutcome =
  | 'PUBLISHED'
  | 'ALREADY_PUBLISHED'
  | 'NOT_DUE'
  | 'MISSED_VISIBILITY_WINDOW'
  | 'TERMINAL_NOOP';

const PUBLICATION_SELECT = {
  id: true,
  revisionId: true,
  status: true,
  publishedAt: true,
  publishAt: true,
  visibleFrom: true,
  visibleUntil: true,
  studentRecipientCount: true,
  guardianRecipientContextCount: true,
} satisfies Prisma.AcademicContentPublicationSelect;
type Publication = Prisma.AcademicContentPublicationGetPayload<{
  select: typeof PUBLICATION_SELECT;
}>;
function result(
  row: Publication,
  outcome: AcademicContentPublicationExecutionOutcome,
) {
  return {
    outcome,
    publicationId: row.id,
    revisionId: row.revisionId,
    status: row.status,
    publishedAt: row.publishedAt,
    studentRecipientCount: row.studentRecipientCount,
    guardianRecipientContextCount: row.guardianRecipientContextCount,
  };
}
function conflict(): never {
  throw new DomainException({
    code: 'academic_content.publication.snapshot_conflict',
    message: 'Publication state is inconsistent',
    httpStatus: HttpStatus.CONFLICT,
  });
}
export const ACADEMIC_CONTENT_SNAPSHOT_BATCH_SIZE = 500;

@Injectable()
export class AcademicContentPublicationSnapshotRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audience: AcademicContentRevisionAudienceResolver,
  ) {}

  async publishScheduledPublication(
    input: AcademicContentPublicationExecutionInput,
  ) {
    for (const id of [input.schoolId, input.contentId, input.publicationId])
      assertAcademicContentPublicationUuid(id);
    if (!(input.now instanceof Date) || !Number.isFinite(input.now.getTime()))
      throw new ValidationDomainException(
        'Publication execution requires a valid instant',
      );
    const command = { ...input, now: new Date(input.now) };
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(
          (tx) => this.publishInTransaction(tx, command),
          {
            isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
            maxWait: 20_000,
            timeout: 20_000,
          },
        );
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          !(
            error.code === 'P2034' ||
            (error.code === 'P2010' && error.meta?.code === '40001')
          )
        )
          throw error;
        // A contender may lose RepeatableRead serialization after waiting on Content.
        // Retry with a fresh database snapshot; no resolved audience is reused.
        if (attempt === 2) conflict();
      }
    }
    return conflict();
  }

  private async publishInTransaction(
    tx: Prisma.TransactionClient,
    input: AcademicContentPublicationExecutionInput,
  ) {
    // Shared with ACC-7B unschedule: always Content, then exact Publication.
    const parents = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM academic_contents WHERE id = ${input.contentId}::uuid
        AND school_id = ${input.schoolId}::uuid AND deleted_at IS NULL FOR UPDATE`;
    if (!parents.length)
      throw new NotFoundDomainException('Academic content not found');
    const publications = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM academic_content_publications WHERE id = ${input.publicationId}::uuid
        AND school_id = ${input.schoolId}::uuid AND academic_content_id = ${input.contentId}::uuid FOR UPDATE`;
    if (!publications.length)
      throw new NotFoundDomainException('Publication not found');
    const content = await tx.academicContent.findFirstOrThrow({
      where: { id: input.contentId, schoolId: input.schoolId, deletedAt: null },
      select: { status: true, school: { select: { organizationId: true } } },
    });
    const publication = await tx.academicContentPublication.findFirstOrThrow({
      where: {
        id: input.publicationId,
        schoolId: input.schoolId,
        academicContentId: input.contentId,
      },
      select: PUBLICATION_SELECT,
    });
    if (
      publication.status === PublicationStatus.CANCELLED ||
      publication.status === PublicationStatus.EXPIRED
    )
      return result(publication, 'TERMINAL_NOOP');
    if (publication.status === PublicationStatus.PUBLISHED) {
      const counts = await tx.academicContentAudienceRecipient.groupBy({
        by: ['recipientKind'],
        where: { schoolId: input.schoolId, publicationId: input.publicationId },
        _count: { _all: true },
      });
      const count = (kind: Kind) =>
        counts.find((row) => row.recipientKind === kind)?._count._all ?? 0;
      const revisionCount = await tx.academicContentRevision.count({
        where: {
          id: publication.revisionId,
          schoolId: input.schoolId,
          academicContentId: input.contentId,
          snapshotContractVersion: 2,
        },
      });
      const unattributedRecipients =
        await tx.academicContentAudienceRecipient.count({
          where: {
            schoolId: input.schoolId,
            publicationId: input.publicationId,
            targets: { none: {} },
          },
        });
      if (
        revisionCount !== 1 ||
        unattributedRecipients !== 0 ||
        content.status !== ContentStatus.PUBLISHED ||
        publication.publishedAt === null ||
        publication.studentRecipientCount !== count(Kind.STUDENT) ||
        publication.guardianRecipientContextCount !== count(Kind.GUARDIAN)
      )
        conflict();
      return result(publication, 'ALREADY_PUBLISHED');
    }
    if (
      content.status !== ContentStatus.SCHEDULED ||
      publication.publishedAt !== null ||
      publication.studentRecipientCount !== 0 ||
      publication.guardianRecipientContextCount !== 0
    )
      conflict();
    if (publication.publishAt > input.now)
      return result(publication, 'NOT_DUE');
    if (
      publication.visibleUntil !== null &&
      publication.visibleUntil <= input.now
    )
      return result(publication, 'MISSED_VISIBILITY_WINDOW');
    if (
      await tx.academicContentAudienceRecipient.count({
        where: { schoolId: input.schoolId, publicationId: input.publicationId },
      })
    )
      conflict();
    const identity = {
      schoolId: input.schoolId,
      contentId: input.contentId,
      revisionId: publication.revisionId,
    };
    const resolved = await this.audience.resolve(tx, identity);
    const recipients: Prisma.AcademicContentAudienceRecipientCreateManyInput[] =
      [];
    const targets: Prisma.AcademicContentAudienceRecipientTargetCreateManyInput[] =
      [];
    const common = {
      schoolId: input.schoolId,
      publicationId: input.publicationId,
      revisionId: publication.revisionId,
    };
    for (const student of resolved.students) {
      const id = randomUUID();
      recipients.push({
        ...common,
        id,
        recipientKind: Kind.STUDENT,
        identityFingerprint: academicContentRecipientIdentity({
          recipientKind: Kind.STUDENT,
          enrollmentId: student.enrollmentId,
        }).identityFingerprint,
        studentId: student.studentId,
        enrollmentId: student.enrollmentId,
        classroomId: student.classroomId,
        guardianId: null,
        recipientUserId: student.recipientUserId,
        guardianCanReceiveNotifications: null,
      });
      for (const revisionTargetId of student.matchedRevisionTargetIds)
        targets.push({
          schoolId: input.schoolId,
          recipientId: id,
          revisionId: publication.revisionId,
          revisionTargetId,
        });
    }
    for (const guardian of resolved.guardians) {
      const id = randomUUID();
      recipients.push({
        ...common,
        id,
        recipientKind: Kind.GUARDIAN,
        identityFingerprint: academicContentRecipientIdentity({
          recipientKind: Kind.GUARDIAN,
          guardianId: guardian.guardianId,
          studentId: guardian.studentId,
          enrollmentId: guardian.enrollmentId,
        }).identityFingerprint,
        studentId: guardian.studentId,
        enrollmentId: guardian.enrollmentId,
        classroomId: guardian.classroomId,
        guardianId: guardian.guardianId,
        recipientUserId: guardian.recipientUserId,
        guardianCanReceiveNotifications:
          guardian.guardianCanReceiveNotifications,
      });
      for (const revisionTargetId of guardian.matchedRevisionTargetIds)
        targets.push({
          schoolId: input.schoolId,
          recipientId: id,
          revisionId: publication.revisionId,
          revisionTargetId,
        });
    }
    for (
      let offset = 0;
      offset < recipients.length;
      offset += ACADEMIC_CONTENT_SNAPSHOT_BATCH_SIZE
    ) {
      const data = recipients.slice(
        offset,
        offset + ACADEMIC_CONTENT_SNAPSHOT_BATCH_SIZE,
      );
      const inserted = await tx.academicContentAudienceRecipient.createMany({
        data,
      });
      if (inserted.count !== data.length) conflict();
    }
    for (
      let offset = 0;
      offset < targets.length;
      offset += ACADEMIC_CONTENT_SNAPSHOT_BATCH_SIZE
    ) {
      const data = targets.slice(
        offset,
        offset + ACADEMIC_CONTENT_SNAPSHOT_BATCH_SIZE,
      );
      const inserted =
        await tx.academicContentAudienceRecipientTarget.createMany({ data });
      if (inserted.count !== data.length) conflict();
    }
    const studentRecipientCount = resolved.students.length,
      guardianRecipientContextCount = resolved.guardians.length;
    const changed = await tx.academicContentPublication.updateMany({
      where: {
        id: input.publicationId,
        schoolId: input.schoolId,
        academicContentId: input.contentId,
        revisionId: publication.revisionId,
        status: PublicationStatus.SCHEDULED,
      },
      data: {
        status: PublicationStatus.PUBLISHED,
        publishedAt: input.now,
        studentRecipientCount,
        guardianRecipientContextCount,
      },
    });
    const changedContent = await tx.academicContent.updateMany({
      where: {
        id: input.contentId,
        schoolId: input.schoolId,
        deletedAt: null,
        status: ContentStatus.SCHEDULED,
      },
      data: { status: ContentStatus.PUBLISHED, updatedByUserId: null },
    });
    if (changed.count !== 1 || changedContent.count !== 1) conflict();
    await tx.auditLog.create({
      data: {
        actorId: null,
        userType: UserType.SERVICE_ACCOUNT,
        organizationId: content.school.organizationId,
        schoolId: input.schoolId,
        module: 'academic-content',
        action: 'academics.academic_content.publication.publish',
        resourceType: 'academic_content_publication',
        resourceId: input.publicationId,
        outcome: AuditOutcome.SUCCESS,
        after: {
          contentId: input.contentId,
          publicationId: input.publicationId,
          revisionId: publication.revisionId,
          status: PublicationStatus.PUBLISHED,
          publishedAt: input.now.toISOString(),
          publishAt: publication.publishAt.toISOString(),
          visibleFrom: publication.visibleFrom.toISOString(),
          visibleUntil: publication.visibleUntil?.toISOString() ?? null,
          studentRecipientCount,
          guardianRecipientContextCount,
        },
      },
    });
    return result(
      {
        ...publication,
        status: PublicationStatus.PUBLISHED,
        publishedAt: input.now,
        studentRecipientCount,
        guardianRecipientContextCount,
      },
      'PUBLISHED',
    );
  }
}
