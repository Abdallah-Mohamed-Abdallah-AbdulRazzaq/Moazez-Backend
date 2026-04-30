import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../common/decorators/required-permissions.decorator';
import {
  CreateBehaviorCategoryUseCase,
  DeleteBehaviorCategoryUseCase,
  GetBehaviorCategoryUseCase,
  ListBehaviorCategoriesUseCase,
  UpdateBehaviorCategoryUseCase,
} from '../application/behavior-categories.use-cases';
import {
  CreateBehaviorCategoryDto,
  ListBehaviorCategoriesQueryDto,
  UpdateBehaviorCategoryDto,
} from '../dto/behavior-category.dto';

@ApiTags('behavior')
@ApiBearerAuth()
@Controller('behavior')
export class BehaviorCategoriesController {
  constructor(
    private readonly listBehaviorCategoriesUseCase: ListBehaviorCategoriesUseCase,
    private readonly getBehaviorCategoryUseCase: GetBehaviorCategoryUseCase,
    private readonly createBehaviorCategoryUseCase: CreateBehaviorCategoryUseCase,
    private readonly updateBehaviorCategoryUseCase: UpdateBehaviorCategoryUseCase,
    private readonly deleteBehaviorCategoryUseCase: DeleteBehaviorCategoryUseCase,
  ) {}

  @Get('categories')
  @RequiredPermissions('behavior.categories.view')
  listCategories(@Query() query: ListBehaviorCategoriesQueryDto) {
    return this.listBehaviorCategoriesUseCase.execute(query);
  }

  @Get('categories/:categoryId')
  @RequiredPermissions('behavior.categories.view')
  getCategory(@Param('categoryId', new ParseUUIDPipe()) categoryId: string) {
    return this.getBehaviorCategoryUseCase.execute(categoryId);
  }

  @Post('categories')
  @RequiredPermissions('behavior.categories.manage')
  createCategory(@Body() dto: CreateBehaviorCategoryDto) {
    return this.createBehaviorCategoryUseCase.execute(dto);
  }

  @Patch('categories/:categoryId')
  @RequiredPermissions('behavior.categories.manage')
  updateCategory(
    @Param('categoryId', new ParseUUIDPipe()) categoryId: string,
    @Body() dto: UpdateBehaviorCategoryDto,
  ) {
    return this.updateBehaviorCategoryUseCase.execute(categoryId, dto);
  }

  @Delete('categories/:categoryId')
  @RequiredPermissions('behavior.categories.manage')
  deleteCategory(@Param('categoryId', new ParseUUIDPipe()) categoryId: string) {
    return this.deleteBehaviorCategoryUseCase.execute(categoryId);
  }
}
