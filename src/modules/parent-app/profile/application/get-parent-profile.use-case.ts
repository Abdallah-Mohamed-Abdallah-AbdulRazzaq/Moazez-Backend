import { Injectable } from '@nestjs/common';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import {
  ParentAppChildNotFoundException,
  ParentAppGuardianNotFoundException,
  ParentAppRequiredParentException,
} from '../../shared/parent-app-errors';
import { ParentProfileResponseDto } from '../dto/parent-profile.dto';
import { ParentProfileReadAdapter } from '../infrastructure/parent-profile-read.adapter';
import { ParentProfilePresenter } from '../presenters/parent-profile.presenter';

@Injectable()
export class GetParentProfileUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly readAdapter: ParentProfileReadAdapter,
  ) {}

  async execute(): Promise<ParentProfileResponseDto> {
    const context = await this.accessService.getParentAppContext();

    const [parent, guardians, children, school] = await Promise.all([
      this.readAdapter.findParentIdentity(context),
      this.readAdapter.listGuardians(context),
      this.readAdapter.listChildren(context),
      this.readAdapter.findSchoolDisplay(context),
    ]);

    if (!parent) {
      throw new ParentAppRequiredParentException({
        reason: 'parent_profile_identity_missing',
      });
    }

    if (guardians.length !== context.guardianIds.length) {
      throw new ParentAppGuardianNotFoundException({
        reason: 'parent_profile_guardian_details_missing',
      });
    }

    if (children.length !== context.children.length) {
      throw new ParentAppChildNotFoundException({
        reason: 'parent_profile_child_details_missing',
      });
    }

    return ParentProfilePresenter.present({
      parent,
      guardians,
      children,
      school,
    });
  }
}
