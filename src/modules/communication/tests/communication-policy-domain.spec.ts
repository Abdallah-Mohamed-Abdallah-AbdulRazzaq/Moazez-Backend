import {
  assertCommunicationPolicyLimits,
  buildDefaultCommunicationPolicy,
  CommunicationPolicyInvalidException,
  mergeCommunicationPolicyPatch,
  normalizeCommunicationModerationMode,
  normalizeCommunicationStudentDirectMode,
  summarizeCommunicationOverviewCounts,
} from '../domain/communication-policy-domain';

describe('communication policy domain', () => {
  it('builds safe default policy values matching the schema defaults', () => {
    const policy = buildDefaultCommunicationPolicy();

    expect(policy).toMatchObject({
      isEnabled: true,
      allowDirectStaffToStaff: true,
      allowAdminToAnyone: true,
      allowTeacherToParent: true,
      allowTeacherToStudent: true,
      allowStudentToTeacher: true,
      allowStudentToStudent: false,
      studentDirectMode: 'DISABLED',
      allowTeacherCreatedGroups: true,
      allowStudentCreatedGroups: false,
      requireApprovalForStudentGroups: true,
      allowParentToParent: false,
      allowAttachments: true,
      allowVoiceMessages: false,
      allowVideoMessages: false,
      allowMessageEdit: false,
      allowMessageDelete: true,
      allowReactions: true,
      allowReadReceipts: true,
      allowDeliveryReceipts: true,
      allowOnlinePresence: true,
      maxGroupMembers: 256,
      maxMessageLength: 4000,
      maxAttachmentSizeMb: 25,
      retentionDays: null,
      moderationMode: 'standard',
    });
  });

  it('normalizes frontend enum values to safe storage values', () => {
    expect(normalizeCommunicationStudentDirectMode('same_classroom')).toBe(
      'SAME_CLASSROOM',
    );
    expect(normalizeCommunicationStudentDirectMode('approval_required')).toBe(
      'APPROVAL_REQUIRED',
    );
    expect(normalizeCommunicationModerationMode('STRICT')).toBe('strict');
  });

  it('rejects invalid maxGroupMembers values', () => {
    expect(() =>
      assertCommunicationPolicyLimits({
        ...buildDefaultCommunicationPolicy(),
        maxGroupMembers: 1,
      }),
    ).toThrow(CommunicationPolicyInvalidException);
  });

  it('rejects invalid maxMessageLength values', () => {
    expect(() =>
      assertCommunicationPolicyLimits({
        ...buildDefaultCommunicationPolicy(),
        maxMessageLength: 20001,
      }),
    ).toThrow(CommunicationPolicyInvalidException);
  });

  it('rejects invalid maxAttachmentSizeMb values', () => {
    expect(() =>
      assertCommunicationPolicyLimits({
        ...buildDefaultCommunicationPolicy(),
        maxAttachmentSizeMb: 0,
      }),
    ).toThrow(CommunicationPolicyInvalidException);
  });

  it('rejects invalid retentionDays values', () => {
    expect(() =>
      assertCommunicationPolicyLimits({
        ...buildDefaultCommunicationPolicy(),
        retentionDays: 0,
      }),
    ).toThrow(CommunicationPolicyInvalidException);
  });

  it('rejects unsupported moderation modes', () => {
    expect(() => normalizeCommunicationModerationMode('maximum')).toThrow(
      CommunicationPolicyInvalidException,
    );
  });

  it('merges policy patches and reports changed fields', () => {
    const merged = mergeCommunicationPolicyPatch(
      buildDefaultCommunicationPolicy(),
      {
        isEnabled: false,
        studentDirectMode: 'same_grade',
        maxGroupMembers: 128,
      },
    );

    expect(merged.data).toMatchObject({
      isEnabled: false,
      studentDirectMode: 'SAME_GRADE',
      maxGroupMembers: 128,
    });
    expect(merged.nextPolicy.isEnabled).toBe(false);
    expect(merged.changedFields).toEqual([
      'isEnabled',
      'studentDirectMode',
      'maxGroupMembers',
    ]);
  });

  it('summarizes zero overview counts safely', () => {
    const counts = summarizeCommunicationOverviewCounts({
      conversationsTotal: 0,
      conversationStatuses: [],
      conversationTypes: [],
      participantsTotal: 0,
      participantStatuses: [],
      messagesTotal: 0,
      messageStatuses: [],
      messageKinds: [],
      reads: 0,
      deliveriesTotal: 0,
      deliveryStatuses: [],
      reportStatuses: [],
      activeBlocks: 0,
      activeRestrictions: 0,
      moderationActions: 0,
    });

    expect(counts.conversations.total).toBe(0);
    expect(counts.conversations.schoolWide).toBe(0);
    expect(counts.messages.text).toBe(0);
    expect(counts.receipts.pendingDeliveries).toBe(0);
    expect(counts.safety.openReports).toBe(0);
  });
});
