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
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { CreateClassroomUseCase } from '../application/create-classroom.use-case';
import { CreateGradeUseCase } from '../application/create-grade.use-case';
import { CreateSectionUseCase } from '../application/create-section.use-case';
import { CreateStageUseCase } from '../application/create-stage.use-case';
import { CreateTermUseCase } from '../application/create-term.use-case';
import { CreateYearUseCase } from '../application/create-year.use-case';
import { DeleteClassroomUseCase } from '../application/delete-classroom.use-case';
import { DeleteGradeUseCase } from '../application/delete-grade.use-case';
import { DeleteSectionUseCase } from '../application/delete-section.use-case';
import { DeleteStageUseCase } from '../application/delete-stage.use-case';
import { GetTreeUseCase } from '../application/get-tree.use-case';
import { ListTermsUseCase } from '../application/list-terms.use-case';
import { ListYearsUseCase } from '../application/list-years.use-case';
import { ReorderClassroomUseCase } from '../application/reorder-classroom.use-case';
import { ReorderGradeUseCase } from '../application/reorder-grade.use-case';
import { ReorderSectionUseCase } from '../application/reorder-section.use-case';
import { ReorderStageUseCase } from '../application/reorder-stage.use-case';
import { UpdateClassroomUseCase } from '../application/update-classroom.use-case';
import { UpdateGradeUseCase } from '../application/update-grade.use-case';
import { UpdateSectionUseCase } from '../application/update-section.use-case';
import { UpdateStageUseCase } from '../application/update-stage.use-case';
import { UpdateTermUseCase } from '../application/update-term.use-case';
import { UpdateYearUseCase } from '../application/update-year.use-case';
import { UpdateAcademicYearDto, CreateAcademicYearDto } from '../dto/academic-year.dto';
import { CreateClassroomDto, UpdateClassroomDto } from '../dto/classroom.dto';
import { CreateGradeDto, UpdateGradeDto } from '../dto/grade.dto';
import { ReorderNodeDto } from '../dto/reorder-node.dto';
import { CreateSectionDto, UpdateSectionDto } from '../dto/section.dto';
import { CreateStageDto, UpdateStageDto } from '../dto/stage.dto';
import {
  AcademicYearResponseDto,
  AcademicYearsListResponseDto,
  ClassroomResponseDto,
  DeleteStructureNodeResponseDto,
  GradeResponseDto,
  SectionResponseDto,
  StageResponseDto,
  StructureTreeResponseDto,
  TermResponseDto,
  TermsListResponseDto,
} from '../dto/structure-response.dto';
import { ListTermsQueryDto } from '../dto/list-terms-query.dto';
import { CreateTermDto, UpdateTermDto } from '../dto/term.dto';
import { TreeQueryDto } from '../dto/tree-query.dto';

@ApiTags('academics-structure')
@ApiBearerAuth()
@Controller('academics/structure')
export class StructureController {
  constructor(
    private readonly listYearsUseCase: ListYearsUseCase,
    private readonly createYearUseCase: CreateYearUseCase,
    private readonly updateYearUseCase: UpdateYearUseCase,
    private readonly listTermsUseCase: ListTermsUseCase,
    private readonly createTermUseCase: CreateTermUseCase,
    private readonly updateTermUseCase: UpdateTermUseCase,
    private readonly getTreeUseCase: GetTreeUseCase,
    private readonly createStageUseCase: CreateStageUseCase,
    private readonly updateStageUseCase: UpdateStageUseCase,
    private readonly deleteStageUseCase: DeleteStageUseCase,
    private readonly reorderStageUseCase: ReorderStageUseCase,
    private readonly createGradeUseCase: CreateGradeUseCase,
    private readonly updateGradeUseCase: UpdateGradeUseCase,
    private readonly deleteGradeUseCase: DeleteGradeUseCase,
    private readonly reorderGradeUseCase: ReorderGradeUseCase,
    private readonly createSectionUseCase: CreateSectionUseCase,
    private readonly updateSectionUseCase: UpdateSectionUseCase,
    private readonly deleteSectionUseCase: DeleteSectionUseCase,
    private readonly reorderSectionUseCase: ReorderSectionUseCase,
    private readonly createClassroomUseCase: CreateClassroomUseCase,
    private readonly updateClassroomUseCase: UpdateClassroomUseCase,
    private readonly deleteClassroomUseCase: DeleteClassroomUseCase,
    private readonly reorderClassroomUseCase: ReorderClassroomUseCase,
  ) {}

  @Get('years')
  @RequiredPermissions('academics.structure.view')
  listYears(): Promise<AcademicYearsListResponseDto> {
    return this.listYearsUseCase.execute();
  }

  @Post('years')
  @RequiredPermissions('academics.structure.manage')
  createYear(
    @Body() dto: CreateAcademicYearDto,
  ): Promise<AcademicYearResponseDto> {
    return this.createYearUseCase.execute(dto);
  }

  @Patch('years/:id')
  @RequiredPermissions('academics.structure.manage')
  updateYear(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateAcademicYearDto,
  ): Promise<AcademicYearResponseDto> {
    return this.updateYearUseCase.execute(id, dto);
  }

  @Get('terms')
  @RequiredPermissions('academics.structure.view')
  listTerms(@Query() query: ListTermsQueryDto): Promise<TermsListResponseDto> {
    return this.listTermsUseCase.execute(query);
  }

  @Post('terms')
  @RequiredPermissions('academics.structure.manage')
  createTerm(@Body() dto: CreateTermDto): Promise<TermResponseDto> {
    return this.createTermUseCase.execute(dto);
  }

  @Patch('terms/:id')
  @RequiredPermissions('academics.structure.manage')
  updateTerm(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateTermDto,
  ): Promise<TermResponseDto> {
    return this.updateTermUseCase.execute(id, dto);
  }

  @Get('tree')
  @RequiredPermissions('academics.structure.view')
  getTree(@Query() query: TreeQueryDto): Promise<StructureTreeResponseDto> {
    return this.getTreeUseCase.execute(query);
  }

  @Post('stages')
  @RequiredPermissions('academics.structure.manage')
  createStage(@Body() dto: CreateStageDto): Promise<StageResponseDto> {
    return this.createStageUseCase.execute(dto);
  }

  @Patch('stages/:id')
  @RequiredPermissions('academics.structure.manage')
  updateStage(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateStageDto,
  ): Promise<StageResponseDto> {
    return this.updateStageUseCase.execute(id, dto);
  }

  @Delete('stages/:id')
  @RequiredPermissions('academics.structure.manage')
  deleteStage(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<DeleteStructureNodeResponseDto> {
    return this.deleteStageUseCase.execute(id);
  }

  @Patch('stages/:id/reorder')
  @RequiredPermissions('academics.structure.manage')
  reorderStage(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReorderNodeDto,
  ): Promise<StageResponseDto> {
    return this.reorderStageUseCase.execute(id, dto);
  }

  @Post('grades')
  @RequiredPermissions('academics.structure.manage')
  createGrade(@Body() dto: CreateGradeDto): Promise<GradeResponseDto> {
    return this.createGradeUseCase.execute(dto);
  }

  @Patch('grades/:id')
  @RequiredPermissions('academics.structure.manage')
  updateGrade(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateGradeDto,
  ): Promise<GradeResponseDto> {
    return this.updateGradeUseCase.execute(id, dto);
  }

  @Delete('grades/:id')
  @RequiredPermissions('academics.structure.manage')
  deleteGrade(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<DeleteStructureNodeResponseDto> {
    return this.deleteGradeUseCase.execute(id);
  }

  @Patch('grades/:id/reorder')
  @RequiredPermissions('academics.structure.manage')
  reorderGrade(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReorderNodeDto,
  ): Promise<GradeResponseDto> {
    return this.reorderGradeUseCase.execute(id, dto);
  }

  @Post('sections')
  @RequiredPermissions('academics.structure.manage')
  createSection(@Body() dto: CreateSectionDto): Promise<SectionResponseDto> {
    return this.createSectionUseCase.execute(dto);
  }

  @Patch('sections/:id')
  @RequiredPermissions('academics.structure.manage')
  updateSection(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateSectionDto,
  ): Promise<SectionResponseDto> {
    return this.updateSectionUseCase.execute(id, dto);
  }

  @Delete('sections/:id')
  @RequiredPermissions('academics.structure.manage')
  deleteSection(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<DeleteStructureNodeResponseDto> {
    return this.deleteSectionUseCase.execute(id);
  }

  @Patch('sections/:id/reorder')
  @RequiredPermissions('academics.structure.manage')
  reorderSection(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReorderNodeDto,
  ): Promise<SectionResponseDto> {
    return this.reorderSectionUseCase.execute(id, dto);
  }

  @Post('classrooms')
  @RequiredPermissions('academics.structure.manage')
  createClassroom(
    @Body() dto: CreateClassroomDto,
  ): Promise<ClassroomResponseDto> {
    return this.createClassroomUseCase.execute(dto);
  }

  @Patch('classrooms/:id')
  @RequiredPermissions('academics.structure.manage')
  updateClassroom(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateClassroomDto,
  ): Promise<ClassroomResponseDto> {
    return this.updateClassroomUseCase.execute(id, dto);
  }

  @Delete('classrooms/:id')
  @RequiredPermissions('academics.structure.manage')
  deleteClassroom(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<DeleteStructureNodeResponseDto> {
    return this.deleteClassroomUseCase.execute(id);
  }

  @Patch('classrooms/:id/reorder')
  @RequiredPermissions('academics.structure.manage')
  reorderClassroom(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReorderNodeDto,
  ): Promise<ClassroomResponseDto> {
    return this.reorderClassroomUseCase.execute(id, dto);
  }
}
