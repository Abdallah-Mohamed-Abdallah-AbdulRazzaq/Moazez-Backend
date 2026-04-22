import { Injectable } from '@nestjs/common';
import { requireSettingsScope } from '../../settings-context';
import { SecurityResponseDto } from '../dto/security-response.dto';
import { SecurityRepository } from '../infrastructure/security.repository';
import { presentSecurity } from '../presenters/security.presenter';

@Injectable()
export class GetSecurityUseCase {
  constructor(private readonly securityRepository: SecurityRepository) {}

  async execute(): Promise<SecurityResponseDto> {
    const scope = requireSettingsScope();
    const security = await this.securityRepository.findBySchoolId(scope.schoolId);
    return presentSecurity(security);
  }
}
