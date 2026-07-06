import { Injectable } from '@nestjs/common';
import { UserType } from '@prisma/client';
import { getRequestContext } from '../../../../common/context/request-context';
import { ParentSmartPickupReadinessResponseDto } from '../dto/parent-smart-pickup.dto';
import { ParentSmartPickupReadAdapter } from '../infrastructure/parent-smart-pickup-read.adapter';
import { ParentSmartPickupPresenter } from '../presenter/parent-smart-pickup.presenter';
import {
  ParentSmartPickupInvalidActorTypeException,
  ParentSmartPickupParentContextNotFoundException,
  ParentSmartPickupSchoolContextRequiredException,
} from './parent-smart-pickup.errors';
import {
  calculateParentSmartPickupWindow,
  ParentSmartPickupClock,
} from './parent-smart-pickup-window';

@Injectable()
export class GetParentSmartPickupReadinessUseCase {
  constructor(
    private readonly readAdapter: ParentSmartPickupReadAdapter,
    private readonly clock: ParentSmartPickupClock,
  ) {}

  async execute(): Promise<ParentSmartPickupReadinessResponseDto> {
    const context = getRequestContext();
    if (!context?.actor) {
      throw new ParentSmartPickupInvalidActorTypeException({
        reason: 'actor_missing',
      });
    }
    if (context.actor.userType !== UserType.PARENT) {
      throw new ParentSmartPickupInvalidActorTypeException({
        reason: 'actor_not_parent',
        userType: context.actor.userType,
      });
    }
    if (!context.activeMembership?.schoolId) {
      throw new ParentSmartPickupSchoolContextRequiredException({
        reason: 'active_school_missing',
      });
    }

    const guardians = await this.readAdapter.listCurrentSchoolGuardians(
      context.actor.id,
    );
    if (guardians.length === 0) {
      throw new ParentSmartPickupParentContextNotFoundException({
        reason: 'current_school_guardian_missing',
      });
    }

    const guardianIds = guardians.map((guardian) => guardian.id);
    const links = await this.readAdapter.listLinkedChildren(guardianIds);
    const studentIds = [...new Set(links.map((link) => link.studentId))];

    const [settings, schoolProfile, enrollments, gates, activeRequests] =
      await Promise.all([
        this.readAdapter.findSettings(),
        this.readAdapter.findSchoolProfile(),
        this.readAdapter.listActiveEnrollments(studentIds),
        this.readAdapter.listAvailableGates(),
        this.readAdapter.listActiveRequestsForStudents(studentIds),
      ]);
    const timezone =
      settings?.timezone ?? schoolProfile?.timezone ?? 'Africa/Cairo';
    const window = calculateParentSmartPickupWindow({
      startLocal: settings?.requestWindowStartLocal ?? null,
      endLocal: settings?.requestWindowEndLocal ?? null,
      timezone,
      now: this.clock.now(),
    });

    return ParentSmartPickupPresenter.present({
      settings,
      schoolProfile,
      guardians,
      links,
      enrollments,
      gates,
      activeRequests,
      window,
    });
  }
}
