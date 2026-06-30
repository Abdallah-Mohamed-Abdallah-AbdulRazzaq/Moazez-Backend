import {
  Controller,
  Delete,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { DeleteStudentAvatarUseCase } from '../application/delete-student-avatar.use-case';
import { GetStudentProfileUseCase } from '../application/get-student-profile.use-case';
import {
  CancelStudentProfileCorrectionRequestUseCase,
  GetStudentProfileCorrectionRequestUseCase,
  ListStudentProfileCorrectionRequestsUseCase,
  SubmitStudentProfileCorrectionRequestUseCase,
} from '../application/student-profile-correction-requests.use-cases';
import { UploadStudentAvatarUseCase } from '../application/upload-student-avatar.use-case';
import { StudentProfileResponseDto } from '../dto/student-profile.dto';
import { UploadedMultipartFile } from '../../../files/uploads/domain/uploaded-file';
import {
  StudentProfileCorrectionRequestResponseDto,
  SubmitStudentProfileCorrectionRequestDto,
} from '../../../students/profile-correction-requests/dto/profile-correction-request.dto';

@ApiTags('student-app')
@ApiBearerAuth()
@Controller('student/profile')
export class StudentProfileController {
  constructor(
    private readonly getStudentProfileUseCase: GetStudentProfileUseCase,
    private readonly uploadStudentAvatarUseCase: UploadStudentAvatarUseCase,
    private readonly deleteStudentAvatarUseCase: DeleteStudentAvatarUseCase,
    private readonly submitCorrectionRequestUseCase: SubmitStudentProfileCorrectionRequestUseCase,
    private readonly listCorrectionRequestsUseCase: ListStudentProfileCorrectionRequestsUseCase,
    private readonly getCorrectionRequestUseCase: GetStudentProfileCorrectionRequestUseCase,
    private readonly cancelCorrectionRequestUseCase: CancelStudentProfileCorrectionRequestUseCase,
  ) {}

  @Get()
  @ApiOkResponse({ type: StudentProfileResponseDto })
  getProfile(): Promise<StudentProfileResponseDto> {
    return this.getStudentProfileUseCase.execute();
  }

  @Post('avatar')
  @UseInterceptors(FileInterceptor('file', { limits: { files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiCreatedResponse({ type: StudentProfileResponseDto })
  uploadAvatar(
    @UploadedFile() file: UploadedMultipartFile | undefined,
  ): Promise<StudentProfileResponseDto> {
    return this.uploadStudentAvatarUseCase.execute(file);
  }

  @Delete('avatar')
  @ApiOkResponse({ type: StudentProfileResponseDto })
  deleteAvatar(): Promise<StudentProfileResponseDto> {
    return this.deleteStudentAvatarUseCase.execute();
  }

  @Post('correction-requests')
  @ApiCreatedResponse({ type: StudentProfileCorrectionRequestResponseDto })
  submitCorrectionRequest(
    @Body() dto: SubmitStudentProfileCorrectionRequestDto,
  ): Promise<StudentProfileCorrectionRequestResponseDto> {
    return this.submitCorrectionRequestUseCase.execute(dto);
  }

  @Get('correction-requests')
  @ApiOkResponse({
    type: StudentProfileCorrectionRequestResponseDto,
    isArray: true,
  })
  listCorrectionRequests(): Promise<StudentProfileCorrectionRequestResponseDto[]> {
    return this.listCorrectionRequestsUseCase.execute();
  }

  @Get('correction-requests/:requestId')
  @ApiOkResponse({ type: StudentProfileCorrectionRequestResponseDto })
  getCorrectionRequest(
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
  ): Promise<StudentProfileCorrectionRequestResponseDto> {
    return this.getCorrectionRequestUseCase.execute(requestId);
  }

  @Post('correction-requests/:requestId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: StudentProfileCorrectionRequestResponseDto })
  cancelCorrectionRequest(
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
  ): Promise<StudentProfileCorrectionRequestResponseDto> {
    return this.cancelCorrectionRequestUseCase.execute(requestId);
  }
}
