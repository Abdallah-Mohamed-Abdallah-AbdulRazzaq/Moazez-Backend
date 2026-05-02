import {
  REALTIME_CLIENT_COMMANDS,
  REALTIME_SERVER_EVENTS,
} from '../realtime-event-names';

describe('realtime event names', () => {
  it('keeps server event names stable', () => {
    expect(Object.values(REALTIME_SERVER_EVENTS)).toEqual([
      'communication.chat.message.created',
      'communication.chat.message.updated',
      'communication.chat.message.deleted',
      'communication.chat.message.read',
      'communication.chat.reaction.upserted',
      'communication.chat.reaction.deleted',
      'communication.chat.attachment.linked',
      'communication.chat.attachment.deleted',
      'communication.presence.user.updated',
      'communication.typing.started',
      'communication.typing.stopped',
      'communication.announcement.published',
      'communication.notification.created',
      'communication.notification.read',
    ]);
  });

  it('keeps client command event names stable', () => {
    expect(Object.values(REALTIME_CLIENT_COMMANDS)).toEqual([
      'communication.chat.message.send',
      'communication.chat.conversation.read',
      'communication.typing.start',
      'communication.typing.stop',
    ]);
  });
});
