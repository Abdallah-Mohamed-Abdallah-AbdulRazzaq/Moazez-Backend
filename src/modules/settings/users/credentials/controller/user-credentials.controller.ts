import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../../common/decorators/required-permissions.decorator';
import { BulkCredentialGenerateUseCase } from '../application/bulk-credential-generate.use-case';
import { BulkCredentialPreviewUseCase } from '../application/bulk-credential-preview.use-case';
import { GenerateUserCredentialUseCase } from '../application/generate-user-credential.use-case';
import { ListCredentialStatusUseCase } from '../application/list-credential-status.use-case';
import { SetUserCredentialUseCase } from '../application/set-user-credential.use-case';
import {
  BulkCredentialPreviewResponseDto,
  BulkCredentialSelectionDto,
  BulkGenerateCredentialsResponseDto,
  CredentialStatusListResponseDto,
  CredentialStatusQueryDto,
  GeneratedCredentialResponseDto,
  SetCredentialPasswordDto,
  SetCredentialResponseDto,
} from '../dto/credential.dto';

@ApiTags('settings-user-credentials')
@ApiBearerAuth()
@Controller('settings/users/credentials')
export class UserCredentialsCollectionController {
  constructor(
    private readonly listCredentialStatusUseCase: ListCredentialStatusUseCase,
    private readonly bulkPreviewUseCase: BulkCredentialPreviewUseCase,
    private readonly bulkGenerateUseCase: BulkCredentialGenerateUseCase,
  ) {}

  @Get('status')
  @RequiredPermissions('settings.users.view')
  status(
    @Query() query: CredentialStatusQueryDto,
  ): Promise<CredentialStatusListResponseDto> {
    return this.listCredentialStatusUseCase.execute(query);
  }

  @Post('bulk-preview')
  @RequiredPermissions('settings.users.view')
  bulkPreview(
    @Body() dto: BulkCredentialSelectionDto,
  ): Promise<BulkCredentialPreviewResponseDto> {
    return this.bulkPreviewUseCase.execute(dto);
  }

  @Post('bulk-generate')
  @RequiredPermissions('settings.users.manage')
  bulkGenerate(
    @Body() dto: BulkCredentialSelectionDto,
  ): Promise<BulkGenerateCredentialsResponseDto> {
    return this.bulkGenerateUseCase.execute(dto);
  }
}

@ApiTags('settings-user-credentials')
@ApiBearerAuth()
@Controller('settings/users/:userId/credentials')
export class UserCredentialsMemberController {
  constructor(
    private readonly generateCredentialUseCase: GenerateUserCredentialUseCase,
    private readonly setCredentialUseCase: SetUserCredentialUseCase,
  ) {}

  @Post('generate')
  @RequiredPermissions('settings.users.manage')
  generate(
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ): Promise<GeneratedCredentialResponseDto> {
    return this.generateCredentialUseCase.execute(userId, 'generate');
  }

  @Post('set')
  @RequiredPermissions('settings.users.manage')
  set(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() dto: SetCredentialPasswordDto,
  ): Promise<SetCredentialResponseDto> {
    return this.setCredentialUseCase.execute(userId, dto);
  }

  @Post('regenerate')
  @RequiredPermissions('settings.users.manage')
  regenerate(
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ): Promise<GeneratedCredentialResponseDto> {
    return this.generateCredentialUseCase.execute(userId, 'regenerate');
  }
}
