import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { ResultCommandRepository } from '../infrastructure/repositories/result-command.repository';
import { familyReleaseFields } from './result-family.presenter';
import { releaseSnapshot } from '../domain/result-release.contract';
import { officialResultsPilotWhere } from '../domain/result-exposure';

type Recipient = { id: string; userType: 'STUDENT' | 'PARENT' };

@Injectable()
export class ResultNoticeService {
  private readonly logger = new Logger(ResultNoticeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly commands: ResultCommandRepository,
  ) {}

  async reconcile() {
    const pending = await this.prisma.resultPublicationNotice.findMany({
      where: { status: 'PENDING', ...officialResultsPilotWhere() },
      select: { id: true, schoolId: true },
      take: 100,
      orderBy: { createdAt: 'asc' },
    });
    for (const notice of pending) {
      try {
        await this.deliver(notice);
      } catch {
        await this.prisma.$executeRaw`
          UPDATE result_publication_notices
          SET attempts = attempts + 1, updated_at = clock_timestamp(),
            status = CASE WHEN attempts >= 3 THEN 'FAILED'::result_notice_status ELSE status END
          WHERE id = ${notice.id}::uuid AND school_id = ${notice.schoolId}::uuid AND status = 'PENDING'
        `;
        this.logger.warn({
          event: 'official_results.notice.delivery_retry',
          noticeId: notice.id,
        });
      }
    }
  }

  private deliver(notice: { id: string; schoolId: string }) {
    return this.commands.transaction(async (client) => {
      const [claim] = await client.$queryRaw<{ publicationId: string }[]>`
        SELECT publication_id AS "publicationId" FROM result_publication_notices
        WHERE id = ${notice.id}::uuid AND school_id = ${notice.schoolId}::uuid
          AND status = 'PENDING' FOR UPDATE SKIP LOCKED
      `;
      if (!claim) return;
      const publication = await client.resultPublication.findFirst({
        where: { id: claim.publicationId, schoolId: notice.schoolId },
        include: {
          candidate: { select: { snapshot: true } },
          slot: { select: { studentId: true, reportingPeriodId: true } },
        },
      });
      if (!publication)
        throw new Error('official_results.notice.publication_missing');
      // The slot lock serializes delivery with release replacement and revocation.
      await client.$queryRaw`SELECT id FROM result_slots
        WHERE id = ${publication.slotId}::uuid AND school_id = ${notice.schoolId}::uuid FOR SHARE`;
      const pointer = await client.resultCurrentRelease.count({
        where: {
          schoolId: notice.schoolId,
          publicationId: claim.publicationId,
        },
      });
      let delivered = 0;
      if (pointer) {
        const decoded = releaseSnapshot.parse(publication.candidate.snapshot);
        const audience = (['STUDENT', 'PARENT'] as const).filter(
          (item) =>
            familyReleaseFields(decoded, publication.definitionVersionId, item)
              .length,
        );
        const candidates = await this.resolveRecipients(
          client,
          notice.schoolId,
          publication.slot.studentId,
        );
        for (const recipient of candidates) {
          if (!audience.includes(recipient.userType)) continue;
          const idempotencyKey = [
            'official-results',
            publication.id,
            recipient.userType,
            recipient.id,
            'in-app',
          ].join('-');
          const changed = await client.communicationNotification.createMany({
            skipDuplicates: true,
            data: {
              schoolId: notice.schoolId,
              recipientUserId: recipient.id,
              sourceModule: 'SYSTEM',
              sourceType: 'OFFICIAL_RESULTS_PUBLICATION',
              sourceId: publication.id,
              idempotencyKey,
              type: 'SYSTEM_ALERT',
              title: publication.predecessorId
                ? 'تم تحديث نتيجة رسمية'
                : 'نتيجة رسمية متاحة',
              body: 'يمكنك عرض النتيجة عبر قسم النتائج الرسمية بعد تسجيل الدخول.',
              metadata: {
                destination: 'OFFICIAL_RESULTS',
                reportingPeriodId: publication.slot.reportingPeriodId,
              },
            },
          });
          if (changed.count) {
            const event =
              await client.communicationNotification.findFirstOrThrow({
                where: { schoolId: notice.schoolId, idempotencyKey },
                select: { id: true },
              });
            await client.communicationNotificationDelivery.create({
              data: {
                schoolId: notice.schoolId,
                notificationId: event.id,
                channel: 'IN_APP',
                status: 'DELIVERED',
                deliveredAt: new Date(),
              },
            });
          }
          delivered++;
        }
      }
      await client.resultPublicationNotice.updateMany({
        where: { id: notice.id, schoolId: notice.schoolId, status: 'PENDING' },
        data: {
          status: delivered ? 'DELIVERED' : 'SKIPPED',
          attempts: { increment: 1 },
        },
      });
    });
  }

  private async resolveRecipients(
    client: Prisma.TransactionClient,
    schoolId: string,
    studentId: string,
  ) {
    const current = await client.$queryRaw<Recipient[]>`
      WITH verified AS (
        SELECT u.id, 'STUDENT'::text AS audience FROM students st
        JOIN users u ON u.id = st.user_id
        WHERE st.school_id = ${schoolId}::uuid AND st.id = ${studentId}::uuid AND st.deleted_at IS NULL
        FOR SHARE OF st
      ), related AS (
        SELECT g.user_id AS id, 'PARENT'::text AS audience FROM student_guardian_links sg
        JOIN guardians g ON g.school_id = sg.school_id AND g.id = sg.guardian_id AND g.deleted_at IS NULL
        JOIN students st ON st.school_id = sg.school_id AND st.id = sg.student_id AND st.deleted_at IS NULL
        WHERE sg.school_id = ${schoolId}::uuid AND sg.student_id = ${studentId}::uuid AND g.user_id IS NOT NULL
        FOR SHARE OF sg, g, st
      ), candidates AS (
        SELECT * FROM verified UNION SELECT * FROM related
      )
      SELECT u.id, u.user_type::text AS "userType"
      FROM candidates x JOIN users u ON u.id = x.id AND u.user_type::text = x.audience
      JOIN memberships m ON m.user_id = u.id AND m.user_type::text = x.audience AND m.school_id = ${schoolId}::uuid
      JOIN schools s ON s.id = m.school_id AND s.organization_id = m.organization_id
      JOIN organizations o ON o.id = s.organization_id
      JOIN roles r ON r.id = m.role_id AND r.deleted_at IS NULL AND (r.school_id IS NULL OR r.school_id = s.id)
      JOIN role_permissions rp ON rp.role_id = r.id
      JOIN permissions p ON p.id = rp.permission_id AND p.code = 'official_results.results.view'
      WHERE m.status = 'ACTIVE' AND m.deleted_at IS NULL AND m.ended_at IS NULL
        AND u.status = 'ACTIVE' AND u.deleted_at IS NULL
        AND s.status = 'ACTIVE' AND s.deleted_at IS NULL AND o.status = 'ACTIVE' AND o.deleted_at IS NULL
      ORDER BY u.id LIMIT 501 FOR SHARE OF u, m, r, rp, p, s, o
    `;
    if (current.length > 500)
      throw new Error('official_results.notice.recipient_limit');
    return [
      ...new Map(
        current.map((recipient) => [recipient.id, recipient]),
      ).values(),
    ];
  }
}
