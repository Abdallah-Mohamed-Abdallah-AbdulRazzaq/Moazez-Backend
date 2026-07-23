import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { SchoolManagementOnly } from '../../../../common/decorators/school-management-only.decorator';
import {
  CancelLearningMediaUploadUseCase,
  CompleteLearningMediaUploadUseCase,
  CreateLearningMediaUploadUseCase,
  VerifyLegacyLearningMediaUseCase,
} from '../../../files/uploads/application/learning-media-upload.use-cases';
import {
  CreateLearningMediaUploadDto,
  CompleteLearningMediaUploadDto,
  LearningMediaUploadCancelResponseDto,
  LearningMediaUploadCompletionResponseDto,
  LearningMediaUploadIntentResponseDto,
} from '../../../files/uploads/dto/learning-media-upload.dto';

@ApiTags('academics-learning-media')
@ApiBearerAuth()
@Controller('academics/learning-media/uploads')
@SchoolManagementOnly()
@RequiredPermissions('academics.curriculum.manage', 'files.uploads.manage')
export class LearningMediaController {
  constructor(
    private readonly createUpload: CreateLearningMediaUploadUseCase,
    private readonly completeUpload: CompleteLearningMediaUploadUseCase,
    private readonly cancelUpload: CancelLearningMediaUploadUseCase,
    private readonly verifyLegacyUpload: VerifyLegacyLearningMediaUseCase,
  ) {}

  @Post()
  @ApiCreatedResponse({ type: LearningMediaUploadIntentResponseDto })
  @ApiConflictResponse({ description: 'Safe upload lifecycle conflict' })
  create(
    @Body() command: CreateLearningMediaUploadDto,
  ): Promise<LearningMediaUploadIntentResponseDto> {
    return this.createUpload.execute(command);
  }

  @Post(':uploadId/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: LearningMediaUploadCompletionResponseDto })
  complete(
    @Param('uploadId', new ParseUUIDPipe()) uploadId: string,
    @Body() command: CompleteLearningMediaUploadDto,
  ): Promise<LearningMediaUploadCompletionResponseDto> {
    void command;
    return this.completeUpload.execute(uploadId);
  }

  @Post(':uploadId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: LearningMediaUploadCancelResponseDto })
  cancel(
    @Param('uploadId', new ParseUUIDPipe()) uploadId: string,
  ): Promise<LearningMediaUploadCancelResponseDto> {
    return this.cancelUpload.execute(uploadId);
  }

  @Post('legacy/:uploadId/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: LearningMediaUploadCompletionResponseDto })
  verifyLegacy(
    @Param('uploadId', new ParseUUIDPipe()) uploadId: string,
  ): Promise<LearningMediaUploadCompletionResponseDto> {
    return this.verifyLegacyUpload.execute(uploadId);
  }
}
