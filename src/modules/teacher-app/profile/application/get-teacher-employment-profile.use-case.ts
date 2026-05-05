import { Injectable } from '@nestjs/common';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import { TeacherEmploymentProfileResponseDto } from '../dto/teacher-profile.dto';
import { TeacherProfilePresenter } from '../presenters/teacher-profile.presenter';

@Injectable()
export class GetTeacherEmploymentProfileUseCase {
  constructor(private readonly accessService: TeacherAppAccessService) {}

  execute(): TeacherEmploymentProfileResponseDto {
    this.accessService.assertCurrentTeacher();

    return TeacherProfilePresenter.presentEmploymentUnsupported();
  }
}
