import {
  EXCLUDED_FROM_SCHOOL_SCOPE,
  SCHOOL_SCOPED_MODELS,
} from '../school-scope.extension';

describe('schoolScope communication registration', () => {
  it('registers TeacherProfile for school scope enforcement', () => {
    expect(SCHOOL_SCOPED_MODELS.has('TeacherProfile')).toBe(true);
  });

  it('registers school login settings for school scope enforcement', () => {
    expect(SCHOOL_SCOPED_MODELS.has('SchoolLoginSettings')).toBe(true);
  });

  it('registers school email settings for school scope enforcement', () => {
    expect(SCHOOL_SCOPED_MODELS.has('SchoolEmailConnection')).toBe(true);
    expect(SCHOOL_SCOPED_MODELS.has('SchoolEmailTemplate')).toBe(true);
    expect(SCHOOL_SCOPED_MODELS.has('SchoolEmailDeliveryBatch')).toBe(true);
    expect(SCHOOL_SCOPED_MODELS.has('SchoolEmailDeliveryRecipient')).toBe(true);
  });

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

  it('registers timetable core models for school scope enforcement', () => {
    expect(SCHOOL_SCOPED_MODELS.has('TimetableConfig')).toBe(true);
    expect(SCHOOL_SCOPED_MODELS.has('TimetablePeriod')).toBe(true);
    expect(SCHOOL_SCOPED_MODELS.has('TimetableEntry')).toBe(true);
    expect(SCHOOL_SCOPED_MODELS.has('TimetablePublication')).toBe(true);
    expect(SCHOOL_SCOPED_MODELS.has('TimetableConflict')).toBe(true);
  });

  it('registers homework core models for school scope enforcement', () => {
    expect(SCHOOL_SCOPED_MODELS.has('HomeworkAssignment')).toBe(true);
    expect(SCHOOL_SCOPED_MODELS.has('HomeworkTarget')).toBe(true);
  });

  it('registers bulk student registration models without a school-scope exclusion', () => {
    for (const model of [
      'StudentBulkRegistrationBatch',
      'StudentBulkRegistrationRow',
    ]) {
      expect(SCHOOL_SCOPED_MODELS.has(model)).toBe(true);
      expect(EXCLUDED_FROM_SCHOOL_SCOPE.has(model)).toBe(false);
    }
  });
});
