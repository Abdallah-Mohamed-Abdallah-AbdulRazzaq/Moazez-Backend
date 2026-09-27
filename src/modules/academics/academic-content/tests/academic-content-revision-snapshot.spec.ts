import {
  AcademicContentType,
  AcademicOnlineSessionPlatform,
} from '@prisma/client';
import { decodeAcademicContentRevisionSnapshotV2 } from '../domain/academic-content-revision-snapshot';

const online = {
  type: AcademicContentType.ONLINE_SESSION,
  state: {
    platform: AcademicOnlineSessionPlatform.ZOOM,
    providerName: null,
    joinUrl: 'https://example.test/meeting',
    accessCode: 'historical-secret',
    instructions: null,
    startAt: '2028-09-10T10:00:00.000Z',
    endAt: '2028-09-10T11:00:00.000Z',
    timezone: 'Africa/Cairo',
    timetableEntryId: null,
  },
};

describe('Academic Content revision V2 snapshot contract', () => {
  it('decodes only frozen fields, leaving unknown persisted properties private', () => {
    expect(
      decodeAcademicContentRevisionSnapshotV2(
        {
          ...online,
          schoolId: 'private',
          state: { ...online.state, rowId: 'private' },
        },
        AcademicContentType.ONLINE_SESSION,
      ),
    ).toEqual(online);
  });

  it('fails closed on a discriminator mismatch', () => {
    expect(() =>
      decodeAcademicContentRevisionSnapshotV2(
        online,
        AcademicContentType.TEACHER_PREPARATION,
      ),
    ).toThrow('Academic content revision snapshot is invalid');
  });

  it('fails closed on malformed typed fields without echoing secret values', () => {
    expect(() =>
      decodeAcademicContentRevisionSnapshotV2(
        {
          ...online,
          state: {
            ...online.state,
            startAt: 'invalid',
            accessCode: 'historical-secret',
          },
        },
        AcademicContentType.ONLINE_SESSION,
      ),
    ).toThrow('Academic content revision snapshot is invalid');
  });

  it('never treats General Resource as a specialized snapshot', () => {
    expect(() =>
      decodeAcademicContentRevisionSnapshotV2(
        { type: AcademicContentType.GENERAL_RESOURCE, state: {} },
        AcademicContentType.GENERAL_RESOURCE,
      ),
    ).toThrow('Academic content revision snapshot is invalid');
  });
});
