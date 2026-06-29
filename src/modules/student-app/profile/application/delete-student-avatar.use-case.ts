import { AuditOutcome, UserType } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import type { StudentAppContext } from '../../shared/student-app.types';
import { StudentAppStudentNotFoundException } from '../../shared/student-app-errors';
import { StudentProfileResponseDto } from '../dto/student-profile.dto';
import { StudentAvatarRepository } from '../infrastructure/student-avatar.repository';
import { StudentProfileReadAdapter } from '../infrastructure/student-profile-read.adapter';
import { buildStudentProfileResponse } from './student-profile-response.builder';

@Injectable()
export class DeleteStudentAvatarUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly avatarRepository: StudentAvatarRepository,
    private readonly readAdapter: StudentProfileReadAdapter,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(): Promise<StudentProfileResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const previousAvatar =
      await this.avatarRepository.findStudentAvatarState(context);

    if (!previousAvatar) {
      throw new StudentAppStudentNotFoundException({
        reason: 'student_avatar_identity_missing',
      });
    }

    const updated = await this.avatarRepository.clearStudentAvatarFile(context);
    if (!updated) {
      throw new StudentAppStudentNotFoundException({
        reason: 'student_avatar_update_target_missing',
      });
    }

    await this.recordAudit({
      context,
      previousFileId: previousAvatar.avatarFileId,
    });

    return buildStudentProfileResponse({
      context,
      readAdapter: this.readAdapter,
    });
  }

  private async recordAudit(params: {
    context: StudentAppContext;
    previousFileId: string | null;
  }): Promise<void> {
    await this.authRepository.createAuditLog({
      actorId: params.context.studentUserId,
      userType: UserType.STUDENT,
      organizationId: params.context.organizationId,
      schoolId: params.context.schoolId,
      module: 'student_app',
      action: 'student.profile.avatar.delete',
      resourceType: 'student_profile_avatar',
      resourceId: params.context.studentId,
      outcome: AuditOutcome.SUCCESS,
      before: {
        studentId: params.context.studentId,
        previousFileId: params.previousFileId,
        source: 'student_app',
      },
      after: {
        studentId: params.context.studentId,
        fileId: null,
        previousFileId: params.previousFileId,
        source: 'student_app',
      },
    });
  }
}
