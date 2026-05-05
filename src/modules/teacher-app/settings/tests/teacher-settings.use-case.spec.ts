import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import { TeacherAppRequiredTeacherException } from '../../shared/teacher-app.errors';
import { GetTeacherSettingsAboutUseCase } from '../application/get-teacher-settings-about.use-case';
import { GetTeacherSettingsContactUseCase } from '../application/get-teacher-settings-contact.use-case';
import { TeacherSettingsReadAdapter } from '../infrastructure/teacher-settings-read.adapter';

describe('Teacher Settings use cases', () => {
  it('about rejects non-teacher actors through the access service', async () => {
    const { aboutUseCase, accessService } = createUseCases();
    accessService.assertCurrentTeacher.mockImplementation(() => {
      throw new TeacherAppRequiredTeacherException({
        reason: 'actor_not_teacher',
      });
    });

    await expect(aboutUseCase.execute()).rejects.toBeInstanceOf(
      TeacherAppRequiredTeacherException,
    );
  });

  it('contact rejects non-teacher actors through the access service', async () => {
    const { contactUseCase, accessService } = createUseCases();
    accessService.assertCurrentTeacher.mockImplementation(() => {
      throw new TeacherAppRequiredTeacherException({
        reason: 'actor_not_teacher',
      });
    });

    await expect(contactUseCase.execute()).rejects.toBeInstanceOf(
      TeacherAppRequiredTeacherException,
    );
  });

  it('about returns stable app, school, legal, and unsupported settings shape', async () => {
    const { aboutUseCase } = createUseCases();

    const result = await aboutUseCase.execute();

    expect(result).toEqual({
      app: {
        name: 'Moazez',
        version: null,
        environment: null,
      },
      school: {
        name: 'Moazez Academy',
        logoUrl: null,
      },
      legal: {
        termsUrl: null,
        privacyUrl: null,
        status: 'not_configured',
      },
      unsupported: {
        privacySettings: true,
        appPreferences: true,
        supportTickets: true,
        rating: true,
      },
    });
  });

  it('contact returns stable school and support shape without private identifiers', async () => {
    const { contactUseCase } = createUseCases();

    const result = await contactUseCase.execute();
    const json = JSON.stringify(result);

    expect(result).toEqual({
      school: {
        name: 'Moazez Academy',
        email: null,
        phone: null,
        address: '123 School St',
      },
      support: {
        email: null,
        phone: null,
        status: 'not_configured',
      },
    });
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('scheduleId');
  });
});

function createUseCases(): {
  aboutUseCase: GetTeacherSettingsAboutUseCase;
  contactUseCase: GetTeacherSettingsContactUseCase;
  accessService: jest.Mocked<TeacherAppAccessService>;
  settingsReadAdapter: jest.Mocked<TeacherSettingsReadAdapter>;
} {
  const accessService = {
    assertCurrentTeacher: jest.fn(() => ({
      teacherUserId: 'teacher-1',
      schoolId: 'school-1',
      organizationId: 'org-1',
      membershipId: 'membership-1',
      roleId: 'role-1',
      permissions: [],
    })),
  } as unknown as jest.Mocked<TeacherAppAccessService>;
  const settingsReadAdapter = {
    findSchoolSettings: jest.fn(() =>
      Promise.resolve({
        name: 'Moazez Academy',
        logoUrl: null,
        email: null,
        phone: null,
        address: '123 School St',
      }),
    ),
  } as unknown as jest.Mocked<TeacherSettingsReadAdapter>;

  return {
    aboutUseCase: new GetTeacherSettingsAboutUseCase(
      accessService,
      settingsReadAdapter,
    ),
    contactUseCase: new GetTeacherSettingsContactUseCase(
      accessService,
      settingsReadAdapter,
    ),
    accessService,
    settingsReadAdapter,
  };
}
