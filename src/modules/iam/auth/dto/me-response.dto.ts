import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserStatus, UserType } from '@prisma/client';

export class ActiveMembershipDto {
  @ApiProperty() membershipId!: string;
  @ApiProperty() organizationId!: string;
  @ApiPropertyOptional({ nullable: true }) schoolId!: string | null;
  @ApiProperty() roleId!: string;
  @ApiProperty() roleKey!: string;
  @ApiProperty({ type: [String] }) permissions!: string[];
}

export class MeResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiPropertyOptional({ nullable: true }) username!: string | null;
  @ApiProperty() loginEmail!: string;
  @ApiPropertyOptional({ nullable: true }) contactEmail!: string | null;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiProperty({ enum: UserType }) userType!: UserType;
  @ApiProperty({ enum: UserStatus }) status!: UserStatus;
  @ApiProperty() mustChangePassword!: boolean;
  @ApiPropertyOptional({ type: ActiveMembershipDto, nullable: true })
  activeMembership!: ActiveMembershipDto | null;
}
