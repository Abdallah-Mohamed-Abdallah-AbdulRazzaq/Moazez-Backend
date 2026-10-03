import { Injectable, Logger } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { CommunicationNotificationGenerationService } from '../../../communication/application/communication-notification-generation.service';
import { CommunicationNotificationQueueService } from '../../../communication/application/communication-notification-queue.service';
import {
  CommunicationAcademicContentNotificationGenerationJobData,
  CommunicationPreparedAcademicContentRecipient,
} from '../../../communication/domain/communication-notification-generation-domain';
import { effectiveAcademicContentNotificationPolicy } from '../domain/academic-content-notification.policy';
import {
  ACADEMIC_CONTENT_NOTIFICATION_CONTEXT_PAGE_SIZE,
  ACADEMIC_CONTENT_NOTIFICATION_RECIPIENT_PAGE_SIZE,
  ACADEMIC_CONTENT_NOTIFICATION_RECOVERY_PAGE_SIZE,
  publishedNotificationContextAllows,
  publishedNotificationPolicyAllows,
} from '../domain/academic-content-publication-notification.policy';
import { AcademicContentPublicationJobData } from '../domain/academic-content-publication-runtime.constants';
import {
  AcademicContentNotificationRecoveryCursor,
  AcademicContentPublicationNotificationRepository,
  publicationNotificationJobData,
} from '../infrastructure/academic-content-publication-notification.repository';

@Injectable()
export class AcademicContentPublicationNotificationService {
  private readonly logger = new Logger(
    AcademicContentPublicationNotificationService.name,
  );
  constructor(
    private readonly repository: AcademicContentPublicationNotificationRepository,
    private readonly generation: CommunicationNotificationGenerationService,
    private readonly queue: CommunicationNotificationQueueService,
  ) {}

  async ensureAfterPublicationCommit(
    identity: AcademicContentPublicationJobData,
    now = new Date(),
  ): Promise<void> {
    try {
      const source = await this.repository.findSource(identity, now);
      if (!source) return;
      await this.queue.ensureAcademicContentPublishedNotifications(
        publicationNotificationJobData(source),
      );
      this.signal('enqueued', identity, { reason: 'publication_committed' });
    } catch {
      this.signal(
        'skipped',
        identity,
        { reason: 'post_commit_enqueue_failed' },
        true,
      );
    }
  }

  async generate(
    input: CommunicationAcademicContentNotificationGenerationJobData,
    now = new Date(),
  ) {
    const source = await this.repository.findSource(input, now);
    if (
      !source ||
      source.school.organizationId !== input.organizationId ||
      source.revision.id !== source.revisionId ||
      source.revision.schoolId !== source.schoolId ||
      source.revision.academicContentId !== source.academicContentId ||
      !source.publishedAt
    ) {
      this.signal('skipped', input, { reason: 'source_not_eligible' });
      return {
        recipientCount: 0,
        createdNotificationCount: 0,
        skippedReason: 'source_not_eligible',
      };
    }
    const policy = effectiveAcademicContentNotificationPolicy(
      await this.repository.findPolicy(source.schoolId),
    );
    if (!publishedNotificationPolicyAllows(source.revision.type, policy)) {
      this.signal('skipped', input, {
        reason: 'school_or_type_policy_disabled',
      });
      return {
        recipientCount: 0,
        createdNotificationCount: 0,
        skippedReason: 'school_or_type_policy_disabled',
      };
    }
    let afterUser: string | undefined;
    let recipientCount = 0,
      createdNotificationCount = 0;
    while (true) {
      const userIds = await this.repository.listRecipientUsers(
        source,
        afterUser,
      );
      if (userIds.length === 0) break;
      const users = new Map(
        (await this.repository.listCurrentUsers(userIds)).map((user) => [
          user.id,
          user,
        ]),
      );
      const studentsByUser = new Map<
        string,
        { studentIds: Set<string>; contextCount: number }
      >();
      let afterContext: string | undefined;
      while (true) {
        const contexts = await this.repository.listContexts(
          source,
          userIds,
          afterContext,
        );
        for (const context of contexts) {
          if (
            !publishedNotificationContextAllows(
              context,
              users.get(context.recipientUserId ?? ''),
              policy,
              source.revision.audience,
            ) ||
            !isUUID(context.studentId)
          )
            continue;
          const recipientUserId = context.recipientUserId!;
          const students = studentsByUser.get(recipientUserId) ?? {
            studentIds: new Set<string>(),
            contextCount: 0,
          };
          students.studentIds.add(context.studentId);
          students.contextCount++;
          studentsByUser.set(recipientUserId, students);
        }
        if (contexts.length < ACADEMIC_CONTENT_NOTIFICATION_CONTEXT_PAGE_SIZE)
          break;
        afterContext = contexts[contexts.length - 1].id;
      }
      const recipients: CommunicationPreparedAcademicContentRecipient[] =
        userIds.flatMap((recipientUserId) => {
          const students = studentsByUser.get(recipientUserId);
          if (!students?.studentIds.size) return [];
          const studentIds = [...students.studentIds].sort();
          return [
            {
              recipientUserId,
              metadata: {
                academicContentId: source.academicContentId,
                publicationId: source.id,
                revisionId: source.revisionId,
                contentType: source.revision.type.toLowerCase(),
                eventType: 'academic_content_published',
                publishedAt: source.publishedAt!.toISOString(),
                studentIds,
                childContextCount: students.contextCount,
              },
            },
          ];
        });
      const result =
        await this.generation.generateForAcademicContentPublicationBatch({
          ...publicationNotificationJobData(source),
          title: 'New academic content',
          body: source.revision.title.trim(),
          expiresAt: source.visibleUntil,
          recipients,
          now,
        });
      recipientCount += result.recipientCount;
      createdNotificationCount += result.createdNotificationCount;
      if (userIds.length < ACADEMIC_CONTENT_NOTIFICATION_RECIPIENT_PAGE_SIZE)
        break;
      afterUser = userIds[userIds.length - 1];
    }
    this.signal('generated', input, {
      recipientCount,
      createdNotificationCount,
      reason: 'completed',
    });
    return { recipientCount, createdNotificationCount, skippedReason: null };
  }

  async recover(now = new Date()): Promise<number> {
    let after: AcademicContentNotificationRecoveryCursor | undefined;
    let restored = 0;
    while (true) {
      const page = await this.repository.listRecoveryCandidates(now, after);
      for (const source of page) {
        const result =
          await this.queue.ensureAcademicContentPublishedNotifications(
            publicationNotificationJobData(source),
          );
        if (result === 'created' || result === 'replaced') {
          restored++;
          this.signal(
            'recovered',
            {
              schoolId: source.schoolId,
              contentId: source.academicContentId,
              publicationId: source.id,
            },
            { reason: result },
          );
        }
      }
      if (page.length < ACADEMIC_CONTENT_NOTIFICATION_RECOVERY_PAGE_SIZE) break;
      const last = page[page.length - 1];
      after = { publishedAt: last.publishedAt!, id: last.id };
    }
    return restored;
  }

  private signal(
    event: string,
    identity: AcademicContentPublicationJobData,
    details: Record<string, string | number>,
    warning = false,
  ) {
    const signal = {
      event: `academic_content.notification.${event}`,
      schoolId: identity.schoolId,
      contentId: identity.contentId,
      publicationId: identity.publicationId,
      ...details,
    };
    if (warning) this.logger.warn(signal);
    else this.logger.log(signal);
  }
}
