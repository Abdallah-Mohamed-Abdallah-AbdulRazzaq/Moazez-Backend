import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { CreateSubjectUseCase } from '../application/create-subject.use-case';
import { DeleteSubjectUseCase } from '../application/delete-subject.use-case';
import { ListSubjectsUseCase } from '../application/list-subjects.use-case';
import { UpdateSubjectUseCase } from '../application/update-subject.use-case';
import { CreateSubjectDto, UpdateSubjectDto } from '../dto/subject.dto';
import {
  DeleteSubjectResponseDto,
  SubjectResponseDto,
  SubjectsListResponseDto,
} from '../dto/subject-response.dto';

@ApiTags('academics-subjects')
@ApiBearerAuth()
@Controller('academics/subjects')
export class SubjectsController {
  constructor(
    private readonly listSubjectsUseCase: ListSubjectsUseCase,
    private readonly createSubjectUseCase: CreateSubjectUseCase,
    private readonly updateSubjectUseCase: UpdateSubjectUseCase,
    private readonly deleteSubjectUseCase: DeleteSubjectUseCase,
  ) {}

  @Get()
  @RequiredPermissions('academics.subjects.view')
  listSubjects(): Promise<SubjectsListResponseDto> {
    return this.listSubjectsUseCase.execute();
  }

  @Post()
  @RequiredPermissions('academics.subjects.manage')
  createSubject(@Body() dto: CreateSubjectDto): Promise<SubjectResponseDto> {
    return this.createSubjectUseCase.execute(dto);
  }

  @Patch(':id')
  @RequiredPermissions('academics.subjects.manage')
  updateSubject(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateSubjectDto,
  ): Promise<SubjectResponseDto> {
    return this.updateSubjectUseCase.execute(id, dto);
  }

  @Delete(':id')
  @RequiredPermissions('academics.subjects.manage')
  deleteSubject(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<DeleteSubjectResponseDto> {
    return this.deleteSubjectUseCase.execute(id);
  }
}
