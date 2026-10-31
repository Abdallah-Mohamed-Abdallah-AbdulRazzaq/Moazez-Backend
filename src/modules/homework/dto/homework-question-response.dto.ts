import type { ResponseConfigV1 } from '../../../common/assessment-answer/response-config';
import { RESPONSE_CONFIG_OPENAPI } from '../../../common/assessment-answer/response-config.openapi';
import type {
  RichQuestionContent,
  RichOptionContent,
} from '../../../common/rich-content/rich-content.types';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  HomeworkPrivateAnswerKey,
  HomeworkPublicDefinition,
} from '../domain/homework-typed-contract';

export class HomeworkQuestionOptionResponseDto {
  @ApiPropertyOptional({
    type: Object,
    description:
      'Validated, authorized V1 option display. Omitted for absent or withheld content.',
  })
  richContent?: RichOptionContent;
  optionId!: string;
  questionId!: string;
  text!: string;
  isCorrect?: boolean;
  sortOrder!: number;
  createdAt!: string;
  updatedAt!: string;
}

export class HomeworkQuestionResponseDto {
  @ApiPropertyOptional(RESPONSE_CONFIG_OPENAPI)
  responseConfig?: ResponseConfigV1;
  @ApiPropertyOptional({
    type: Object,
    description:
      'Closed versioned public definition for Fill, Matching, MEDIA, Ordering, Numeric or Math Expression.',
  })
  metadata?: HomeworkPublicDefinition;
  @ApiPropertyOptional({
    type: Object,
    nullable: true,
    description:
      'Only on the explicitly authorized author surface; absent for view/review-only actors.',
  })
  answerKey?: HomeworkPrivateAnswerKey | null;
  @ApiPropertyOptional({
    type: Object,
    description:
      'Validated, authorized V1 question display. Omitted for absent or withheld content.',
  })
  richContent?: RichQuestionContent;
  questionId!: string;
  homeworkId!: string;
  type!: string;
  prompt!: string;
  instructions!: string | null;
  points!: number;
  sortOrder!: number;
  isRequired!: boolean;
  expectedAnswer?: string | null;
  @ApiProperty({ type: () => [HomeworkQuestionOptionResponseDto] })
  options!: HomeworkQuestionOptionResponseDto[];
  createdAt!: string;
  updatedAt!: string;
}

export class HomeworkQuestionsListResponseDto {
  @ApiProperty({ type: () => [HomeworkQuestionResponseDto] })
  items!: HomeworkQuestionResponseDto[];
}

export class HomeworkQuestionDetailResponseDto {
  @ApiProperty({ type: () => HomeworkQuestionResponseDto })
  question!: HomeworkQuestionResponseDto;
}
