import { Injectable } from '@nestjs/common';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import { TeacherSettingsAboutResponseDto } from '../dto/teacher-settings.dto';
import { TeacherSettingsReadAdapter } from '../infrastructure/teacher-settings-read.adapter';
import { TeacherSettingsPresenter } from '../presenters/teacher-settings.presenter';
import { ResolveSchoolLogoUrlService } from '../../../settings/branding/application/resolve-school-logo-url.service';

@Injectable()
export class GetTeacherSettingsAboutUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly settingsReadAdapter: TeacherSettingsReadAdapter,
    private readonly logoResolver: ResolveSchoolLogoUrlService,
  ) {}

  async execute(): Promise<TeacherSettingsAboutResponseDto> {
    const context = this.accessService.assertCurrentTeacher();
    const [school, logoUrl] = await Promise.all([
      this.settingsReadAdapter.findSchoolSettings(context),
      this.logoResolver.resolveForSchool(context.schoolId),
    ]);

    return TeacherSettingsPresenter.presentAbout({ ...school, logoUrl });
  }
}
