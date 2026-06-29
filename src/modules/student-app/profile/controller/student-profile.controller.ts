import {
  Controller,
  Delete,
  Get,
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
import { UploadStudentAvatarUseCase } from '../application/upload-student-avatar.use-case';
import { StudentProfileResponseDto } from '../dto/student-profile.dto';
import { UploadedMultipartFile } from '../../../files/uploads/domain/uploaded-file';

@ApiTags('student-app')
@ApiBearerAuth()
@Controller('student/profile')
export class StudentProfileController {
  constructor(
    private readonly getStudentProfileUseCase: GetStudentProfileUseCase,
    private readonly uploadStudentAvatarUseCase: UploadStudentAvatarUseCase,
    private readonly deleteStudentAvatarUseCase: DeleteStudentAvatarUseCase,
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
}
