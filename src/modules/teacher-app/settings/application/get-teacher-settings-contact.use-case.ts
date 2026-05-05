import { Injectable } from '@nestjs/common';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import { TeacherSettingsContactResponseDto } from '../dto/teacher-settings.dto';
import { TeacherSettingsReadAdapter } from '../infrastructure/teacher-settings-read.adapter';
import { TeacherSettingsPresenter } from '../presenters/teacher-settings.presenter';

@Injectable()
export class GetTeacherSettingsContactUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly settingsReadAdapter: TeacherSettingsReadAdapter,
  ) {}

  async execute(): Promise<TeacherSettingsContactResponseDto> {
    const context = this.accessService.assertCurrentTeacher();
    const school = await this.settingsReadAdapter.findSchoolSettings(context);

    return TeacherSettingsPresenter.presentContact(school);
  }
}
