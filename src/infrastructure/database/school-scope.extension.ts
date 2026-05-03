import { Prisma } from '@prisma/client';
import { getRequestContext } from '../../common/context/request-context';

// Models explicitly EXCLUDED from automatic school scoping.
// Platform-level models, append-only logs, raw auth tokens, and catalogs
// must not have schoolId injected into their queries.
const EXCLUDED_FROM_SCHOOL_SCOPE = new Set<string>([
  'Organization',
  'School',
  'Permission',
  'Session',
  'AuditLog',
  'User',
  'RolePermission',
]);

// Models that carry a schoolId column and participate in scope injection.
// Keep this list in sync with PRISMA_CONVENTIONS.md section 6. Additions
// made later must be mirrored here.
export const SCHOOL_SCOPED_MODELS = new Set<string>([
  'Membership',
  'Role',
  'File',
  'Attachment',
  'ImportJob',
  'SchoolProfile',
  'SecuritySetting',
  'NotificationTemplate',
  'NotificationTemplateChannelState',
  'IntegrationConnection',
  'BackupJob',
  'Lead',
  'Application',
  'ApplicationDocument',
  'PlacementTest',
  'Interview',
  'AdmissionDecision',
  'Student',
  'Guardian',
  'StudentGuardian',
  'Enrollment',
  'StudentDocument',
  'StudentMedicalProfile',
  'StudentNote',
  'AcademicYear',
  'Term',
  'Stage',
  'Grade',
  'Section',
  'Classroom',
  'Subject',
  'TeacherSubjectAllocation',
  'Room',
  'AttendancePolicy',
  'AttendanceSession',
  'AttendanceEntry',
  'AttendanceExcuseRequest',
  'AttendanceExcuseRequestSession',
  'GradeAssessment',
  'GradeAssessmentQuestion',
  'GradeAssessmentQuestionOption',
  'GradeSubmission',
  'GradeSubmissionAnswer',
  'GradeSubmissionAnswerOption',
  'GradeItem',
  'GradeRule',
  'ReinforcementTask',
  'ReinforcementTaskTarget',
  'ReinforcementAssignment',
  'ReinforcementTaskStage',
  'ReinforcementSubmission',
  'ReinforcementReview',
  'ReinforcementTaskTemplate',
  'ReinforcementTaskTemplateStage',
  'XpPolicy',
  'XpLedger',
  'RewardCatalogItem',
  'RewardRedemption',
  'HeroBadge',
  'HeroMission',
  'HeroMissionObjective',
  'HeroMissionProgress',
  'HeroMissionObjectiveProgress',
  'HeroStudentBadge',
  'HeroJourneyEvent',
  'BehaviorCategory',
  'BehaviorRecord',
  'BehaviorPointLedger',
  'CommunicationPolicy',
  'CommunicationConversation',
  'CommunicationConversationParticipant',
  'CommunicationConversationInvite',
  'CommunicationConversationJoinRequest',
  'CommunicationMessage',
  'CommunicationMessageRead',
  'CommunicationMessageDelivery',
  'CommunicationMessageReaction',
  'CommunicationMessageAttachment',
  'CommunicationMessageReport',
  'CommunicationModerationAction',
  'CommunicationUserBlock',
  'CommunicationUserRestriction',
  'CommunicationAnnouncement',
  'CommunicationAnnouncementAudience',
  'CommunicationAnnouncementRead',
  'CommunicationAnnouncementAttachment',
  'CommunicationNotification',
  'CommunicationNotificationDelivery',
]);

// Models that use soft delete (have a deletedAt column). Read operations
// automatically exclude deletedAt != null unless the caller opts in via
// withSoftDeleted().
const SOFT_DELETE_MODELS = new Set<string>([
  'Organization',
  'School',
  'User',
  'Membership',
  'Role',
  'File',
  'Lead',
  'Application',
  'Student',
  'Guardian',
  'Enrollment',
  'AcademicYear',
  'Term',
  'Stage',
  'Grade',
  'Section',
  'Classroom',
  'Subject',
  'Room',
  'AttendancePolicy',
  'AttendanceSession',
  'AttendanceExcuseRequest',
  'GradeAssessment',
  'GradeAssessmentQuestion',
  'GradeAssessmentQuestionOption',
  'ReinforcementTask',
  'ReinforcementTaskStage',
  'ReinforcementTaskTemplate',
  'ReinforcementTaskTemplateStage',
  'XpPolicy',
  'RewardCatalogItem',
  'HeroBadge',
  'HeroMission',
  'HeroMissionObjective',
  'BehaviorCategory',
  'BehaviorRecord',
  'CommunicationConversation',
  'CommunicationMessageAttachment',
]);

const READ_OPERATIONS = new Set<string>([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);

const MUTATION_OPERATIONS = new Set<string>([
  'update',
  'updateMany',
  'delete',
  'deleteMany',
]);

type AnyWhere = Record<string, unknown>;
type AnyArgs = { where?: AnyWhere; [key: string]: unknown };

function mergeWhere(base: AnyWhere | undefined, add: AnyWhere): AnyWhere {
  if (!base || Object.keys(base).length === 0) return add;
  return { AND: [base, add] };
}

function injectSchoolScope(args: AnyArgs, schoolId: string): AnyArgs {
  const scoped = mergeWhere(args.where, { schoolId });
  return { ...args, where: scoped };
}

function injectSoftDeleteFilter(args: AnyArgs): AnyArgs {
  const scoped = mergeWhere(args.where, { deletedAt: null });
  return { ...args, where: scoped };
}

export const schoolScopeExtension = Prisma.defineExtension({
  name: 'schoolScope',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const ctx = getRequestContext();
        const isRead = READ_OPERATIONS.has(operation);
        const isMutation = MUTATION_OPERATIONS.has(operation);

        if (!isRead && !isMutation) {
          return query(args);
        }

        let nextArgs: AnyArgs = (args ?? {}) as AnyArgs;

        // 1. school scope (only when context has a scoped membership
        //    and scope bypass is not active)
        if (
          ctx &&
          !ctx.bypass.bypassSchoolScope &&
          ctx.activeMembership?.schoolId &&
          SCHOOL_SCOPED_MODELS.has(model) &&
          !EXCLUDED_FROM_SCHOOL_SCOPE.has(model)
        ) {
          nextArgs = injectSchoolScope(
            nextArgs,
            ctx.activeMembership.schoolId,
          );
        }

        // 2. soft-delete filter (opt-out via withSoftDeleted)
        const includeDeleted = ctx?.bypass.includeSoftDeleted === true;
        if (!includeDeleted && isRead && SOFT_DELETE_MODELS.has(model)) {
          nextArgs = injectSoftDeleteFilter(nextArgs);
        }

        return query(nextArgs);
      },
    },
  },
});
