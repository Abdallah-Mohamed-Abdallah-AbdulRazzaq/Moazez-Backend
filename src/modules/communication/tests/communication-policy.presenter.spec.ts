import { buildDefaultCommunicationPolicy } from '../domain/communication-policy-domain';
import { presentCommunicationPolicy } from '../presenters/communication-policy.presenter';

describe('communication policy presenter', () => {
  it('maps studentDirectMode to lowercase frontend values', () => {
    const result = presentCommunicationPolicy(
      {
        ...buildDefaultCommunicationPolicy(),
        id: 'policy-1',
        schoolId: 'school-1',
        studentDirectMode: 'SAME_CLASSROOM',
        createdAt: new Date('2026-05-01T10:00:00.000Z'),
        updatedAt: new Date('2026-05-01T11:00:00.000Z'),
      },
      { isConfigured: true },
    );

    expect(result.studentDirectMode).toBe('same_classroom');
    expect(result.createdAt).toBe('2026-05-01T10:00:00.000Z');
    expect(result.updatedAt).toBe('2026-05-01T11:00:00.000Z');
  });

  it('never exposes schoolId', () => {
    const result = presentCommunicationPolicy(
      {
        ...buildDefaultCommunicationPolicy(),
        id: 'policy-1',
        schoolId: 'school-1',
      },
      { isConfigured: false },
    );

    expect(result).not.toHaveProperty('schoolId');
    expect(JSON.stringify(result)).not.toContain('schoolId');
  });
});
