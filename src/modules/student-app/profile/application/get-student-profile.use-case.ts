import { Injectable } from '@nestjs/common';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentProfileResponseDto } from '../dto/student-profile.dto';
import { StudentProfileReadAdapter } from '../infrastructure/student-profile-read.adapter';
import { buildStudentProfileResponse } from './student-profile-response.builder';

@Injectable()
export class GetStudentProfileUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly readAdapter: StudentProfileReadAdapter,
  ) {}

  async execute(): Promise<StudentProfileResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();

    return buildStudentProfileResponse({
      context,
      readAdapter: this.readAdapter,
    });
  }
}
