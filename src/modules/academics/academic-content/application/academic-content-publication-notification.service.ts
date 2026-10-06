import { Injectable, Logger } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { CommunicationNotificationGenerationService } from '../../../communication/application/communication-notification-generation.service';
import { CommunicationNotificationQueueService } from '../../../communication/application/communication-notification-queue.service';
import {
  CommunicationAcademicContentNotificationGenerationJobData,
  CommunicationPreparedAcademicContentRecipient,
  CommunicationPreparedAcademicContentBatch,
  CommunicationAcademicContentSessionReminderJobData,
} from '../../../communication/domain/communication-notification-generation-domain';
import { effectiveAcademicContentNotificationPolicy } from '../domain/academic-content-notification.policy';
import {
  ACADEMIC_CONTENT_NOTIFICATION_CONTEXT_PAGE_SIZE,
  ACADEMIC_CONTENT_NOTIFICATION_RECIPIENT_PAGE_SIZE,
  ACADEMIC_CONTENT_NOTIFICATION_RECOVERY_PAGE_SIZE,
  publishedNotificationContextAllows,
  academicContentPublicationNotificationEvent,
  publishedNotificationPolicyAllows,
  academicContentReminderAt,
  academicContentSessionStartAt,
} from '../domain/academic-content-publication-notification.policy';
import { AcademicContentPublicationJobData } from '../domain/academic-content-publication-runtime.constants';
import {
  AcademicContentNotificationRecoveryCursor,
  AcademicContentPublicationNotificationRepository,
  publicationNotificationJobData,
  AcademicContentLaterNotificationSource,
  AcademicContentLaterEvent,
  laterPublicationNotificationJobData,
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
      if (source && academicContentPublicationNotificationEvent(source)) {
        await this.queue.ensureAcademicContentPublishedNotifications(
          publicationNotificationJobData(source),
        );
        this.signal('enqueued', identity, { reason: 'publication_committed' });
      }
    } catch {
      this.signal(
        'skipped',
        identity,
        { reason: 'post_commit_enqueue_failed' },
        true,
      );
    }
    try {
      await this.ensureSessionReminders(identity, now, 'publication');
    } catch {
      this.signal(
        'skipped',
        identity,
        { reason: 'post_commit_enqueue_failed' },
        true,
        'session_reminder',
      );
    }
  }

  generateCancellation(
    input: CommunicationAcademicContentNotificationGenerationJobData,
    now?: Date,
  ) {
    return this.generateLaterEvent(
      input,
      'academic_content_cancelled',
      now ?? new Date(),
      undefined,
      () => now ?? new Date(),
    );
  }

  generateSessionReminder(
    input: CommunicationAcademicContentSessionReminderJobData,
    now?: Date,
  ) {
    return this.generateLaterEvent(
      input,
      'online_session_reminder',
      now ?? new Date(),
      input.reminderOffsetMinutes,
      () => now ?? new Date(),
    );
  }

  private laterBatch(
    source: AcademicContentLaterNotificationSource,
    event: AcademicContentLaterEvent,
    now: Date,
    recipients: CommunicationPreparedAcademicContentRecipient[],
    offset?: number,
  ): CommunicationPreparedAcademicContentBatch | null {
    const common = {
      ...laterPublicationNotificationJobData(source, event),
      recipients,
      title:
        event === 'academic_content_cancelled'
          ? 'Academic content cancelled'
          : 'Online session reminder',
      body: source.revision.title,
      expiresAt:
        event === 'academic_content_cancelled' ? null : source.visibleUntil,
      now,
    };
    if (event === 'academic_content_cancelled')
      return { ...common, eventType: event };
    const start = academicContentSessionStartAt(
      source.revision.typeSpecificSnapshot,
      source.revision.type,
    );
    return start && offset !== undefined
      ? {
          ...common,
          eventType: event,
          reminderOffsetMinutes: offset,
          sessionStartAt: start.toISOString(),
        }
      : null;
  }

  private async generateLaterEvent(
    input: CommunicationAcademicContentNotificationGenerationJobData,
    event: AcademicContentLaterEvent,
    now: Date,
    offset?: number,
    executionNow = () => now,
  ) {
    const source = await this.repository.findLaterSource(input, event, now);
    const topic =
      event === 'academic_content_cancelled'
        ? 'cancellation_notification'
        : 'session_reminder';
    if (
      !source ||
      source.school.organizationId !== input.organizationId ||
      !source.publishedAt
    ) {
      this.signal(
        'skipped',
        input,
        { reason: 'source_not_eligible' },
        false,
        topic,
      );
      return {
        recipientCount: 0,
        createdNotificationCount: 0,
        skippedReason: 'source_not_eligible',
      };
    }
    const metadata = (
      current: AcademicContentLaterNotificationSource,
      studentIds: string[],
      childContextCount: number,
    ) => ({
      academicContentId: current.academicContentId,
      publicationId: current.id,
      revisionId: current.revisionId,
      contentType: current.revision.type.toLowerCase(),
      eventType: event,
      publishedAt: current.publishedAt!.toISOString(),
      studentIds,
      childContextCount,
    });
    let afterUser: string | undefined;
    let recipientCount = 0,
      createdNotificationCount = 0,
      authorized = true;
    while (true) {
      const userIds = await this.repository.listLaterRecipientUsers(
        source,
        afterUser,
      );
      if (!userIds.length) break;
      // Candidate IDs are used for preference filtering; only the transaction's revalidated batch may be persisted.
      const candidates = userIds.map((recipientUserId) => ({
        recipientUserId,
        metadata: metadata(source, [], 0),
      }));
      const inputBatch = this.laterBatch(
        source,
        event,
        now,
        candidates,
        offset,
      );
      if (!inputBatch)
        return {
          recipientCount: 0,
          createdNotificationCount: 0,
          skippedReason: 'invalid_session_revision',
        };
      const result =
        await this.generation.generateForAcademicContentPublicationBatch(
          inputBatch,
          async (tx) => {
            await this.repository.lockLaterSource(tx, input);
            const authorizedAt = executionNow();
            const current = await this.repository.findLaterSource(
              input,
              event,
              authorizedAt,
              tx,
            );
            if (
              !current ||
              current.school.organizationId !== input.organizationId ||
              !current.publishedAt ||
              current.revision.id !== current.revisionId ||
              current.revision.schoolId !== current.schoolId ||
              current.revision.academicContentId !== current.academicContentId
            ) {
              authorized = false;
              return null;
            }
            const policy = effectiveAcademicContentNotificationPolicy(
              await this.repository.findPolicyInTransaction(
                tx,
                current.schoolId,
              ),
            );
            if (
              !publishedNotificationPolicyAllows(
                current.revision.type,
                policy,
              ) ||
              (event === 'academic_content_cancelled'
                ? !policy.cancellationNotificationsEnabled
                : !policy.onlineSessionRemindersEnabled ||
                  offset === undefined ||
                  !policy.onlineSessionReminderOffsetsMinutes.includes(offset))
            ) {
              authorized = false;
              return null;
            }
            if (event === 'online_session_reminder') {
              const start = academicContentSessionStartAt(
                current.revision.typeSpecificSnapshot,
                current.revision.type,
              );
              if (
                !start ||
                offset === undefined ||
                !academicContentReminderAt({
                  startAt: start,
                  publishedAt: current.publishedAt,
                  offsetMinutes: offset,
                  now: authorizedAt,
                  phase: 'worker',
                })
              ) {
                authorized = false;
                return null;
              }
            }
            const byUser = new Map<
              string,
              { students: Set<string>; count: number }
            >();
            let afterContext: string | undefined;
            while (true) {
              const page = await this.repository.listCurrentLaterContexts(
                tx,
                current,
                userIds,
                afterContext,
              );
              for (const context of page.contexts) {
                if (
                  !publishedNotificationContextAllows(
                    { ...context, guardianCanReceiveNotifications: null },
                    {
                      status: 'ACTIVE',
                      deletedAt: null,
                      userType:
                        context.recipientKind === 'STUDENT'
                          ? 'STUDENT'
                          : 'PARENT',
                    },
                    policy,
                    current.revision.audience,
                  ) ||
                  !isUUID(context.studentId)
                )
                  continue;
                const value = byUser.get(context.recipientUserId) ?? {
                  students: new Set<string>(),
                  count: 0,
                };
                value.students.add(context.studentId);
                value.count++;
                byUser.set(context.recipientUserId, value);
              }
              if (!page.next) break;
              afterContext = page.next;
            }
            return this.laterBatch(
              current,
              event,
              authorizedAt,
              userIds.flatMap((recipientUserId) => {
                const value = byUser.get(recipientUserId);
                return value?.students.size
                  ? [
                      {
                        recipientUserId,
                        metadata: metadata(
                          current,
                          [...value.students].sort(),
                          value.count,
                        ),
                      },
                    ]
                  : [];
              }),
              offset,
            );
          },
        );
      recipientCount += result.recipientCount;
      createdNotificationCount += result.createdNotificationCount;
      if (
        !authorized ||
        userIds.length < ACADEMIC_CONTENT_NOTIFICATION_RECIPIENT_PAGE_SIZE
      )
        break;
      afterUser = userIds[userIds.length - 1];
    }
    this.signal(
      authorized
        ? event === 'online_session_reminder'
          ? 'sent'
          : 'generated'
        : 'skipped',
      input,
      {
        recipientCount,
        createdNotificationCount,
        reason: authorized
          ? 'completed'
          : 'source_policy_or_timing_not_eligible',
        ...(offset === undefined ? {} : { offsetMinutes: offset }),
      },
      false,
      topic,
    );
    return {
      recipientCount,
      createdNotificationCount,
      skippedReason: authorized ? null : 'source_policy_or_timing_not_eligible',
    };
  }

  async ensureSessionReminders(
    identity: AcademicContentPublicationJobData,
    now: Date,
    phase: 'publication' | 'recovery',
  ) {
    const source = await this.repository.findLaterSource(
      identity,
      'online_session_reminder',
      now,
    );
    if (!source?.publishedAt) return 0;
    const policy = effectiveAcademicContentNotificationPolicy(
      await this.repository.findPolicy(source.schoolId),
    );
    const start = academicContentSessionStartAt(
      source.revision.typeSpecificSnapshot,
      source.revision.type,
    );
    if (
      !start ||
      !publishedNotificationPolicyAllows(source.revision.type, policy) ||
      !policy.onlineSessionRemindersEnabled
    )
      return 0;
    let restored = 0;
    for (const offset of policy.onlineSessionReminderOffsetsMinutes) {
      const at = academicContentReminderAt({
        startAt: start,
        publishedAt: source.publishedAt,
        offsetMinutes: offset,
        now,
        phase,
      });
      if (!at) continue;
      const result = await this.queue.ensureAcademicContentSessionReminder(
        {
          ...laterPublicationNotificationJobData(
            source,
            'online_session_reminder',
          ),
          reminderOffsetMinutes: offset,
        },
        at,
        now,
      );
      if (result === 'created' || result === 'replaced') restored++;
      this.signal(
        phase === 'publication' ? 'scheduled' : 'recovered',
        identity,
        { offsetMinutes: offset, reason: result },
        false,
        'session_reminder',
      );
    }
    return restored;
  }

  private async recoverLaterEvents(now: Date) {
    let restored = 0;
    let cancelCursor: { cancelledAt: Date; id: string } | undefined;
    while (true) {
      const page = await this.repository.listCancellationRecoveryCandidates(
        now,
        cancelCursor,
      );
      for (const source of page) {
        const result =
          await this.queue.ensureAcademicContentCancellationNotifications(
            laterPublicationNotificationJobData(
              source,
              'academic_content_cancelled',
            ),
          );
        if (result === 'created' || result === 'replaced') restored++;
        this.signal(
          'recovered',
          {
            schoolId: source.schoolId,
            contentId: source.academicContentId,
            publicationId: source.id,
          },
          { reason: result },
          false,
          'cancellation_notification',
        );
      }
      if (page.length < ACADEMIC_CONTENT_NOTIFICATION_RECOVERY_PAGE_SIZE) break;
      const last = page[page.length - 1];
      cancelCursor = { cancelledAt: last.cancelledAt!, id: last.id };
    }
    let reminderCursor: string | undefined;
    while (true) {
      const page = await this.repository.listReminderRecoveryCandidates(
        now,
        reminderCursor,
      );
      for (const source of page)
        restored += await this.ensureSessionReminders(
          {
            schoolId: source.schoolId,
            contentId: source.academicContentId,
            publicationId: source.id,
          },
          now,
          'recovery',
        );
      if (page.length < ACADEMIC_CONTENT_NOTIFICATION_RECOVERY_PAGE_SIZE) break;
      reminderCursor = page[page.length - 1].id;
    }
    return restored;
  }

  async generate(
    input: CommunicationAcademicContentNotificationGenerationJobData,
    now = new Date(),
  ) {
    const executionNow = () => new Date(Math.max(Date.now(), now.getTime()));
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
    const eventType = academicContentPublicationNotificationEvent(source);
    if (!eventType)
      return {
        recipientCount: 0,
        createdNotificationCount: 0,
        skippedReason: 'no_notification_event',
      };
    const policy = effectiveAcademicContentNotificationPolicy(
      await this.repository.findPolicy(source.schoolId),
    );
    if (
      !publishedNotificationPolicyAllows(source.revision.type, policy) ||
      (eventType === 'academic_content_updated' &&
        !policy.significantUpdateNotificationsEnabled)
    ) {
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
                eventType,
                publishedAt: source.publishedAt!.toISOString(),
                studentIds,
                childContextCount: students.contextCount,
              },
            },
          ];
        });
      const result =
        await this.generation.generateForAcademicContentPublicationBatch(
          {
            ...publicationNotificationJobData(source),
            eventType,
            title:
              eventType === 'academic_content_updated'
                ? 'Academic content updated'
                : 'New academic content',
            body: source.revision.title.trim(),
            expiresAt: source.visibleUntil,
            recipients,
            now,
          },
          async (tx) => {
            // Communication owns the advisory generation lock; Academics owns
            // source/policy/audience authorization in that same transaction.
            await this.repository.lockLaterSource(tx, input);
            const authorizedAt = executionNow();
            const current = await this.repository.findSource(
              input,
              authorizedAt,
              tx,
            );
            if (
              !current ||
              current.school.organizationId !== input.organizationId ||
              current.revision.id !== current.revisionId ||
              current.revision.schoolId !== current.schoolId ||
              current.revision.academicContentId !==
                current.academicContentId ||
              !current.publishedAt ||
              academicContentPublicationNotificationEvent(current) !== eventType
            )
              return null;
            const currentPolicy = effectiveAcademicContentNotificationPolicy(
              await this.repository.findPolicyInTransaction(
                tx,
                current.schoolId,
              ),
            );
            if (
              !publishedNotificationPolicyAllows(
                current.revision.type,
                currentPolicy,
              ) ||
              (eventType === 'academic_content_updated' &&
                !currentPolicy.significantUpdateNotificationsEnabled)
            )
              return null;
            const authorizedContexts = new Map<
              string,
              { studentIds: Set<string>; contextCount: number }
            >();
            const candidateIds = recipients.map(
              (recipient) => recipient.recipientUserId,
            );
            let cursor: string | undefined;
            while (true) {
              const page = await this.repository.listCurrentLaterContexts(
                tx,
                current,
                candidateIds,
                cursor,
                true,
              );
              for (const context of page.contexts) {
                if (
                  !isUUID(context.studentId) ||
                  !publishedNotificationContextAllows(
                    { ...context, guardianCanReceiveNotifications: null },
                    {
                      status: 'ACTIVE',
                      deletedAt: null,
                      userType:
                        context.recipientKind === 'STUDENT'
                          ? 'STUDENT'
                          : 'PARENT',
                    },
                    currentPolicy,
                    current.revision.audience,
                  )
                )
                  continue;
                const value = authorizedContexts.get(
                  context.recipientUserId,
                ) ?? { studentIds: new Set<string>(), contextCount: 0 };
                value.studentIds.add(context.studentId);
                value.contextCount++;
                authorizedContexts.set(context.recipientUserId, value);
              }
              if (!page.next) break;
              cursor = page.next;
            }
            return {
              ...publicationNotificationJobData(current),
              eventType,
              title:
                eventType === 'academic_content_updated'
                  ? 'Academic content updated'
                  : 'New academic content',
              body: current.revision.title.trim(),
              expiresAt: current.visibleUntil,
              now: authorizedAt,
              recipients: candidateIds.flatMap((recipientUserId) => {
                const value = authorizedContexts.get(recipientUserId);
                return value?.studentIds.size
                  ? [
                      {
                        recipientUserId,
                        metadata: {
                          academicContentId: current.academicContentId,
                          publicationId: current.id,
                          revisionId: current.revisionId,
                          contentType: current.revision.type.toLowerCase(),
                          eventType,
                          publishedAt: current.publishedAt!.toISOString(),
                          studentIds: [...value.studentIds].sort(),
                          childContextCount: value.contextCount,
                        },
                      },
                    ]
                  : [];
              }),
            };
          },
        );
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
        if (!academicContentPublicationNotificationEvent(source)) continue;
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
    return restored + (await this.recoverLaterEvents(now));
  }

  private signal(
    event: string,
    identity: AcademicContentPublicationJobData,
    details: Record<string, string | number>,
    warning = false,
    topic = 'notification',
  ) {
    const signal = {
      event: `academic_content.${topic}.${event}`,
      schoolId: identity.schoolId,
      contentId: identity.contentId,
      publicationId: identity.publicationId,
      ...details,
    };
    if (warning) this.logger.warn(signal);
    else this.logger.log(signal);
  }
}
