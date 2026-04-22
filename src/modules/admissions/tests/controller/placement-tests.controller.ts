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
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { CreatePlacementTestUseCase } from '../application/create-placement-test.use-case';
import { GetPlacementTestUseCase } from '../application/get-placement-test.use-case';
import { ListPlacementTestsUseCase } from '../application/list-placement-tests.use-case';
import { UpdatePlacementTestUseCase } from '../application/update-placement-test.use-case';
import {
  CreatePlacementTestDto,
  ListPlacementTestsQueryDto,
  PlacementTestResponseDto,
  PlacementTestsListResponseDto,
  UpdatePlacementTestDto,
} from '../dto/placement-test.dto';

@ApiTags('admissions-tests')
@ApiBearerAuth()
@Controller('admissions/tests')
export class PlacementTestsController {
  constructor(
    private readonly listPlacementTestsUseCase: ListPlacementTestsUseCase,
    private readonly createPlacementTestUseCase: CreatePlacementTestUseCase,
    private readonly getPlacementTestUseCase: GetPlacementTestUseCase,
    private readonly updatePlacementTestUseCase: UpdatePlacementTestUseCase,
  ) {}

  @Get()
  @ApiOkResponse({ type: PlacementTestsListResponseDto })
  @RequiredPermissions('admissions.tests.view')
  listPlacementTests(
    @Query() query: ListPlacementTestsQueryDto,
  ): Promise<PlacementTestsListResponseDto> {
    return this.listPlacementTestsUseCase.execute(query);
  }

  @Post()
  @ApiCreatedResponse({ type: PlacementTestResponseDto })
  @RequiredPermissions('admissions.tests.manage')
  createPlacementTest(
    @Body() dto: CreatePlacementTestDto,
  ): Promise<PlacementTestResponseDto> {
    return this.createPlacementTestUseCase.execute(dto);
  }

  @Get(':id')
  @ApiOkResponse({ type: PlacementTestResponseDto })
  @RequiredPermissions('admissions.tests.view')
  getPlacementTest(
    @Param('id', new ParseUUIDPipe()) placementTestId: string,
  ): Promise<PlacementTestResponseDto> {
    return this.getPlacementTestUseCase.execute(placementTestId);
  }

  @Patch(':id')
  @ApiOkResponse({ type: PlacementTestResponseDto })
  @RequiredPermissions('admissions.tests.manage')
  updatePlacementTest(
    @Param('id', new ParseUUIDPipe()) placementTestId: string,
    @Body() dto: UpdatePlacementTestDto,
  ): Promise<PlacementTestResponseDto> {
    return this.updatePlacementTestUseCase.execute(placementTestId, dto);
  }
}
