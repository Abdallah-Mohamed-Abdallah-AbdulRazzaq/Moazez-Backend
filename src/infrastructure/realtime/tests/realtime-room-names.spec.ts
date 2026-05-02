import { conversationRoom, schoolRoom, userRoom } from '../realtime-room-names';

describe('realtime room names', () => {
  it('builds stable school-scoped room names', () => {
    expect(schoolRoom('school-1')).toBe('school:school-1');
    expect(userRoom('school-1', 'user-1')).toBe('school:school-1:user:user-1');
    expect(conversationRoom('school-1', 'conversation-1')).toBe(
      'school:school-1:conversation:conversation-1',
    );
  });

  it('requires a school id for every room', () => {
    expect(() => schoolRoom('')).toThrow('schoolId is required');
    expect(() => userRoom(' ', 'user-1')).toThrow('schoolId is required');
    expect(() => conversationRoom('', 'conversation-1')).toThrow(
      'schoolId is required',
    );
  });

  it('requires nested ids when building scoped rooms', () => {
    expect(() => userRoom('school-1', '')).toThrow('userId is required');
    expect(() => conversationRoom('school-1', ' ')).toThrow(
      'conversationId is required',
    );
  });
});
