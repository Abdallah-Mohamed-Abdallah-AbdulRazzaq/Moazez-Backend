import { TeacherSettingsPresenter } from '../presenters/teacher-settings.presenter';

describe('TeacherSettingsPresenter', () => {
  it('maps about settings with explicit unsupported areas', () => {
    const result = TeacherSettingsPresenter.presentAbout({
      name: 'Moazez Academy',
      logoUrl: null,
      email: null,
      phone: null,
      address: '123 School St',
    });
    const json = JSON.stringify(result);

    expect(result.unsupported).toEqual({
      privacySettings: true,
      appPreferences: true,
      supportTickets: true,
      rating: true,
    });
    expect(result.legal).toEqual({
      termsUrl: null,
      privacyUrl: null,
      status: 'not_configured',
    });
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('scheduleId');
  });

  it('maps contact settings without support-ticket persistence', () => {
    const result = TeacherSettingsPresenter.presentContact({
      name: 'Moazez Academy',
      logoUrl: null,
      email: null,
      phone: null,
      address: null,
    });

    expect(result).toEqual({
      school: {
        name: 'Moazez Academy',
        email: null,
        phone: null,
        address: null,
      },
      support: {
        email: null,
        phone: null,
        status: 'not_configured',
      },
    });
  });
});
