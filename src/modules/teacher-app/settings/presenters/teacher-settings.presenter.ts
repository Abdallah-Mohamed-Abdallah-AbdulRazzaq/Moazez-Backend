import {
  TeacherSettingsAboutResponseDto,
  TeacherSettingsContactResponseDto,
} from '../dto/teacher-settings.dto';
import type { TeacherSettingsSchoolRecord } from '../infrastructure/teacher-settings-read.adapter';

export class TeacherSettingsPresenter {
  static presentAbout(
    school: TeacherSettingsSchoolRecord,
  ): TeacherSettingsAboutResponseDto {
    return {
      app: {
        name: 'Moazez',
        version: null,
        environment: null,
      },
      school: {
        name: school.name,
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
    };
  }

  static presentContact(
    school: TeacherSettingsSchoolRecord,
  ): TeacherSettingsContactResponseDto {
    return {
      school: {
        name: school.name,
        email: school.email,
        phone: school.phone,
        address: school.address,
      },
      support: {
        email: null,
        phone: null,
        status: 'not_configured',
      },
    };
  }
}
