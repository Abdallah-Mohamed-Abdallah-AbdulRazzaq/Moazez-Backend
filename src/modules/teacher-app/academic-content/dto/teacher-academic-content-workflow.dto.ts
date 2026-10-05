import { ApiProperty, PickType } from '@nestjs/swagger';
import { AcademicContentApprovalHistoryItemDto } from '../../../academics/academic-content/dto/academic-content-review.dto';
export class TeacherAcademicContentApprovalHistoryItemDto extends PickType(
  AcademicContentApprovalHistoryItemDto,
  [
    'roundNumber',
    'revisionId',
    'status',
    'submittedAt',
    'decidedAt',
    'decisionNote',
  ] as const,
) {}
export class TeacherAcademicContentApprovalHistoryDto {
  @ApiProperty({
    type: () => TeacherAcademicContentApprovalHistoryItemDto,
    isArray: true,
  })
  items!: TeacherAcademicContentApprovalHistoryItemDto[];
  @ApiProperty({ type: Number }) page!: number;
  @ApiProperty({ type: Number }) limit!: number;
  @ApiProperty({ type: Number }) total!: number;
}
