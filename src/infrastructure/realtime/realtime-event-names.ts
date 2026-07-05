export const REALTIME_SERVER_EVENTS = Object.freeze({
  COMMUNICATION_CHAT_MESSAGE_CREATED: 'communication.chat.message.created',
  COMMUNICATION_CHAT_MESSAGE_UPDATED: 'communication.chat.message.updated',
  COMMUNICATION_CHAT_MESSAGE_DELETED: 'communication.chat.message.deleted',
  COMMUNICATION_CHAT_MESSAGE_READ: 'communication.chat.message.read',
  COMMUNICATION_CHAT_REACTION_UPSERTED: 'communication.chat.reaction.upserted',
  COMMUNICATION_CHAT_REACTION_DELETED: 'communication.chat.reaction.deleted',
  COMMUNICATION_CHAT_ATTACHMENT_LINKED: 'communication.chat.attachment.linked',
  COMMUNICATION_CHAT_ATTACHMENT_DELETED:
    'communication.chat.attachment.deleted',
  COMMUNICATION_PRESENCE_USER_UPDATED: 'communication.presence.user.updated',
  COMMUNICATION_TYPING_STARTED: 'communication.typing.started',
  COMMUNICATION_TYPING_STOPPED: 'communication.typing.stopped',
  COMMUNICATION_ANNOUNCEMENT_PUBLISHED: 'communication.announcement.published',
  COMMUNICATION_NOTIFICATION_CREATED: 'communication.notification.created',
  COMMUNICATION_NOTIFICATION_READ: 'communication.notification.read',
  DISMISSAL_REQUEST_CREATED: 'dismissal.request.created',
  DISMISSAL_REQUEST_CANCELLED: 'dismissal.request.cancelled',
  DISMISSAL_REQUEST_STATUS_CHANGED: 'dismissal.request.status_changed',
  DISMISSAL_REQUEST_ARRIVAL_CONFIRMED:
    'dismissal.request.arrival_confirmed',
  DISMISSAL_REQUEST_DELIVERED: 'dismissal.request.delivered',
  DISMISSAL_QUEUE_CHANGED: 'dismissal.queue.changed',
  PARENT_SMART_PICKUP_REQUEST_CHANGED:
    'parent.smart_pickup.request.changed',
  DISMISSAL_NOTIFICATION_CREATED: 'dismissal.notification.created',
  DISMISSAL_NOTIFICATION_READ: 'dismissal.notification.read',
  DISMISSAL_NOTIFICATIONS_READ_ALL: 'dismissal.notifications.read_all',
} as const);

export const REALTIME_CLIENT_COMMANDS = Object.freeze({
  COMMUNICATION_CHAT_MESSAGE_SEND: 'communication.chat.message.send',
  COMMUNICATION_CHAT_CONVERSATION_READ: 'communication.chat.conversation.read',
  COMMUNICATION_CHAT_CONVERSATION_JOIN: 'communication.chat.conversation.join',
  COMMUNICATION_CHAT_CONVERSATION_LEAVE:
    'communication.chat.conversation.leave',
  COMMUNICATION_TYPING_START: 'communication.typing.start',
  COMMUNICATION_TYPING_STOP: 'communication.typing.stop',
} as const);

export type RealtimeServerEventName =
  (typeof REALTIME_SERVER_EVENTS)[keyof typeof REALTIME_SERVER_EVENTS];

export type RealtimeClientCommandName =
  (typeof REALTIME_CLIENT_COMMANDS)[keyof typeof REALTIME_CLIENT_COMMANDS];
