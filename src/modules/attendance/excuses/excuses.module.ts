import { Module } from '@nestjs/common';
import { AuthModule } from '../../iam/auth/auth.module';
import { CreateAttendanceExcuseRequestUseCase } from './application/create-attendance-excuse-request.use-case';
import { DeleteAttendanceExcuseAttachmentUseCase } from './application/delete-attendance-excuse-attachment.use-case';
import { DeleteAttendanceExcuseRequestUseCase } from './application/delete-attendance-excuse-request.use-case';
import { GetAttendanceExcuseRequestUseCase } from './application/get-attendance-excuse-request.use-case';
import { LinkAttendanceExcuseAttachmentsUseCase } from './application/link-attendance-excuse-attachments.use-case';
import { ListAttendanceExcuseAttachmentsUseCase } from './application/list-attendance-excuse-attachments.use-case';
import { ListAttendanceExcuseRequestsUseCase } from './application/list-attendance-excuse-requests.use-case';
import { UpdateAttendanceExcuseRequestUseCase } from './application/update-attendance-excuse-request.use-case';
import { AttendanceExcusesController } from './controller/attendance-excuses.controller';
import { AttendanceExcusesRepository } from './infrastructure/attendance-excuses.repository';

@Module({
  imports: [AuthModule],
  controllers: [AttendanceExcusesController],
  providers: [
    AttendanceExcusesRepository,
    ListAttendanceExcuseRequestsUseCase,
    GetAttendanceExcuseRequestUseCase,
    CreateAttendanceExcuseRequestUseCase,
    UpdateAttendanceExcuseRequestUseCase,
    DeleteAttendanceExcuseRequestUseCase,
    ListAttendanceExcuseAttachmentsUseCase,
    LinkAttendanceExcuseAttachmentsUseCase,
    DeleteAttendanceExcuseAttachmentUseCase,
  ],
})
export class ExcusesModule {}
