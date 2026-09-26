import {
  EXCLUDED_FROM_SCHOOL_SCOPE,
  SCHOOL_SCOPED_MODELS,
  SOFT_DELETE_MODELS,
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

  it('registers student credential models without a school-scope exclusion', () => {
    for (const model of ['StudentCredentialBatch', 'StudentCredentialRow']) {
      expect(SCHOOL_SCOPED_MODELS.has(model)).toBe(true);
      expect(EXCLUDED_FROM_SCHOOL_SCOPE.has(model)).toBe(false);
    }
  });

  it('registers AcademicContent for school scope and soft-delete filtering', () => {
    expect(SCHOOL_SCOPED_MODELS.has('AcademicContent')).toBe(true);
    expect(SOFT_DELETE_MODELS.has('AcademicContent')).toBe(true);
    expect(EXCLUDED_FROM_SCHOOL_SCOPE.has('AcademicContent')).toBe(false);
  });

  it('registers AcademicContentTarget for school scope without soft-delete filtering', () => {
    expect(SCHOOL_SCOPED_MODELS.has('AcademicContentTarget')).toBe(true);
    expect(SOFT_DELETE_MODELS.has('AcademicContentTarget')).toBe(false);
    expect(EXCLUDED_FROM_SCHOOL_SCOPE.has('AcademicContentTarget')).toBe(false);
  });

  it('registers ACC files models with their distinct soft-delete contracts', () => {
    for (const model of ['AcademicContentAsset', 'AcademicContentFilePolicy']) {
      expect(SCHOOL_SCOPED_MODELS.has(model)).toBe(true);
      expect(EXCLUDED_FROM_SCHOOL_SCOPE.has(model)).toBe(false);
    }
    expect(SOFT_DELETE_MODELS.has('AcademicContentAsset')).toBe(true);
    expect(SOFT_DELETE_MODELS.has('AcademicContentFilePolicy')).toBe(false);
    expect(SOFT_DELETE_MODELS.has('FileUploadSession')).toBe(false);
  });

  it('registers ACC links, tags, and immutable revisions as School scoped', () => {
    for (const model of [
      'AcademicContentLink',
      'AcademicContentTag',
      'AcademicContentRevision',
      'AcademicContentRevisionTarget',
      'AcademicContentRevisionAsset',
      'AcademicContentRevisionLink',
      'AcademicContentRevisionTag',
    ]) {
      expect(SCHOOL_SCOPED_MODELS.has(model)).toBe(true);
      expect(EXCLUDED_FROM_SCHOOL_SCOPE.has(model)).toBe(false);
      expect(SOFT_DELETE_MODELS.has(model)).toBe(false);
    }
  });

  it('registers every ACC-5A detail and weekly reference without soft deletion or exclusion', () => {
    for (const model of [
      'AcademicContentPreparationDetail',
      'AcademicContentWeeklyPlanDetail',
      'AcademicContentGuardianNoteDetail',
      'AcademicContentSubjectResourceDetail',
      'AcademicContentOnlineSessionDetail',
      'AcademicContentWeeklyPlanHomeworkReference',
      'AcademicContentWeeklyPlanAssessmentReference',
    ]) {
      expect(SCHOOL_SCOPED_MODELS.has(model)).toBe(true);
      expect(SOFT_DELETE_MODELS.has(model)).toBe(false);
      expect(EXCLUDED_FROM_SCHOOL_SCOPE.has(model)).toBe(false);
    }
  });
});
