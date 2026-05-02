function normalizeRealtimeId(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} is required for realtime room naming`);
  }

  return normalized;
}

export function schoolRoom(schoolId: string): string {
  return `school:${normalizeRealtimeId(schoolId, 'schoolId')}`;
}

export function userRoom(schoolId: string, userId: string): string {
  return `${schoolRoom(schoolId)}:user:${normalizeRealtimeId(userId, 'userId')}`;
}

export function conversationRoom(
  schoolId: string,
  conversationId: string,
): string {
  return `${schoolRoom(schoolId)}:conversation:${normalizeRealtimeId(
    conversationId,
    'conversationId',
  )}`;
}
