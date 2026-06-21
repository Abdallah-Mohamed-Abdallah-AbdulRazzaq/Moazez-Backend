export type CommunicationAppContactAliasStyle = 'dual' | 'camel';

export type CommunicationAppContactRole = 'teacher' | 'student' | 'parent';

export interface CommunicationAppContactRecord {
  contactId: string;
  targetUserId: string;
  displayName: string;
  role: CommunicationAppContactRole;
  avatarUrl: string | null;
  subtitle: string | null;
  conversationId: string | null;
  canMessage: boolean;
}

export interface CommunicationAppContactListResult {
  items: CommunicationAppContactRecord[];
  total: number;
  page: number;
  limit: number;
}

export function presentCommunicationAppContactList(
  result: CommunicationAppContactListResult,
  aliasStyle: CommunicationAppContactAliasStyle,
) {
  return {
    contacts: result.items.map((contact) =>
      presentCommunicationAppContact(contact, aliasStyle),
    ),
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
    },
  };
}

export function presentCommunicationAppContact(
  contact: CommunicationAppContactRecord,
  aliasStyle: CommunicationAppContactAliasStyle,
) {
  const base = {
    contactId: contact.contactId,
    displayName: contact.displayName,
    role: contact.role,
    avatarUrl: contact.avatarUrl,
    subtitle: contact.subtitle,
    conversationId: contact.conversationId,
    canMessage: contact.canMessage,
  };

  if (aliasStyle === 'camel') {
    return base;
  }

  return {
    ...base,
    contact_id: contact.contactId,
    display_name: contact.displayName,
    avatar_url: contact.avatarUrl,
    conversation_id: contact.conversationId,
    can_message: contact.canMessage,
  };
}
