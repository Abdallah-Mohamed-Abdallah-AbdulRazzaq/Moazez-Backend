import { SCHOOL_SCOPED_MODELS } from '../school-scope.extension';

describe('schoolScope communication registration', () => {
  it('registers announcement models for school scope enforcement', () => {
    expect(SCHOOL_SCOPED_MODELS.has('CommunicationAnnouncement')).toBe(true);
    expect(SCHOOL_SCOPED_MODELS.has('CommunicationAnnouncementAudience')).toBe(
      true,
    );
    expect(SCHOOL_SCOPED_MODELS.has('CommunicationAnnouncementRead')).toBe(
      true,
    );
    expect(
      SCHOOL_SCOPED_MODELS.has('CommunicationAnnouncementAttachment'),
    ).toBe(true);
  });

  it('registers notification runtime models for school scope enforcement', () => {
    expect(SCHOOL_SCOPED_MODELS.has('CommunicationNotification')).toBe(true);
    expect(SCHOOL_SCOPED_MODELS.has('CommunicationNotificationDelivery')).toBe(
      true,
    );
  });
});
