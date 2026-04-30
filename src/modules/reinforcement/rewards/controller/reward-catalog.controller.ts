import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import {
  ArchiveRewardCatalogItemUseCase,
  CreateRewardCatalogItemUseCase,
  GetRewardCatalogItemUseCase,
  ListRewardCatalogUseCase,
  PublishRewardCatalogItemUseCase,
  UpdateRewardCatalogItemUseCase,
} from '../application/reward-catalog.use-cases';
import {
  ArchiveRewardCatalogItemDto,
  CreateRewardCatalogItemDto,
  ListRewardCatalogQueryDto,
  UpdateRewardCatalogItemDto,
} from '../dto/reward-catalog.dto';

@ApiTags('reinforcement-rewards')
@ApiBearerAuth()
@Controller('reinforcement/rewards')
export class RewardCatalogController {
  constructor(
    private readonly listRewardCatalogUseCase: ListRewardCatalogUseCase,
    private readonly getRewardCatalogItemUseCase: GetRewardCatalogItemUseCase,
    private readonly createRewardCatalogItemUseCase: CreateRewardCatalogItemUseCase,
    private readonly updateRewardCatalogItemUseCase: UpdateRewardCatalogItemUseCase,
    private readonly publishRewardCatalogItemUseCase: PublishRewardCatalogItemUseCase,
    private readonly archiveRewardCatalogItemUseCase: ArchiveRewardCatalogItemUseCase,
  ) {}

  @Get('catalog')
  @RequiredPermissions('reinforcement.rewards.view')
  listCatalog(@Query() query: ListRewardCatalogQueryDto) {
    return this.listRewardCatalogUseCase.execute(query);
  }

  @Get('catalog/:rewardId')
  @RequiredPermissions('reinforcement.rewards.view')
  getCatalogItem(@Param('rewardId', new ParseUUIDPipe()) rewardId: string) {
    return this.getRewardCatalogItemUseCase.execute(rewardId);
  }

  @Post('catalog')
  @RequiredPermissions('reinforcement.rewards.manage')
  createCatalogItem(@Body() dto: CreateRewardCatalogItemDto) {
    return this.createRewardCatalogItemUseCase.execute(dto);
  }

  @Patch('catalog/:rewardId')
  @RequiredPermissions('reinforcement.rewards.manage')
  updateCatalogItem(
    @Param('rewardId', new ParseUUIDPipe()) rewardId: string,
    @Body() dto: UpdateRewardCatalogItemDto,
  ) {
    return this.updateRewardCatalogItemUseCase.execute(rewardId, dto);
  }

  @Post('catalog/:rewardId/publish')
  @RequiredPermissions('reinforcement.rewards.manage')
  publishCatalogItem(@Param('rewardId', new ParseUUIDPipe()) rewardId: string) {
    return this.publishRewardCatalogItemUseCase.execute(rewardId);
  }

  @Post('catalog/:rewardId/archive')
  @RequiredPermissions('reinforcement.rewards.manage')
  archiveCatalogItem(
    @Param('rewardId', new ParseUUIDPipe()) rewardId: string,
    @Body() dto: ArchiveRewardCatalogItemDto,
  ) {
    return this.archiveRewardCatalogItemUseCase.execute(rewardId, dto ?? {});
  }
}
