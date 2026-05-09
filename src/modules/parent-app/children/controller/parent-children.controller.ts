import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { GetParentChildUseCase } from '../application/get-parent-child.use-case';
import { ListParentChildrenUseCase } from '../application/list-parent-children.use-case';
import {
  ParentChildCardDto,
  ParentChildDetailResponseDto,
} from '../dto/parent-children.dto';
import type { ParentChildrenListResponseDto } from '../dto/parent-children.dto';

@ApiTags('parent-app')
@ApiBearerAuth()
@Controller('parent/children')
export class ParentChildrenController {
  constructor(
    private readonly listParentChildrenUseCase: ListParentChildrenUseCase,
    private readonly getParentChildUseCase: GetParentChildUseCase,
  ) {}

  @Get()
  @ApiOkResponse({ type: ParentChildCardDto, isArray: true })
  listChildren(): Promise<ParentChildrenListResponseDto> {
    return this.listParentChildrenUseCase.execute();
  }

  @Get(':studentId')
  @ApiOkResponse({ type: ParentChildDetailResponseDto })
  getChild(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
  ): Promise<ParentChildDetailResponseDto> {
    return this.getParentChildUseCase.execute(studentId);
  }
}
