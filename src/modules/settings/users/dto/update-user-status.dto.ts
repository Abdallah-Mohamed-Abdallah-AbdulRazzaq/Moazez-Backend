import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class UpdateUserStatusDto {
  @ApiProperty({
    description: 'User account status managed by the school dashboard.',
    enum: ['active', 'inactive'],
    example: 'active',
  })
  @IsIn(['active', 'inactive'])
  status!: 'active' | 'inactive';
}
