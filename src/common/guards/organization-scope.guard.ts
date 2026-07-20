import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  MembershipStatus,
  OrganizationStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import {
  getRequestContext,
  setOrganizationScope,
} from '../context/request-context';
import { ORGANIZATION_MANAGEMENT_ONLY_METADATA } from '../decorators/organization-management-only.decorator';
import { PUBLIC_ROUTE_METADATA } from '../decorators/public-route.decorator';
import { ScopeMissingException } from '../../modules/iam/auth/domain/auth.exceptions';
import { AuthRepository } from '../../modules/iam/auth/infrastructure/auth.repository';

const REQUIRED_PERMISSION = 'teachers.records.manage';

@Injectable()
export class OrganizationScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authRepository: AuthRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      PUBLIC_ROUTE_METADATA,
      [context.getHandler(), context.getClass()],
    );
    const organizationOnly = this.reflector.getAllAndOverride<boolean>(
      ORGANIZATION_MANAGEMENT_ONLY_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic || !organizationOnly) return true;

    const requestContext = getRequestContext();
    if (
      !requestContext?.actor ||
      requestContext.actor.userType !== UserType.ORGANIZATION_USER
    ) {
      throw new ScopeMissingException();
    }

    const projection =
      await this.authRepository.findOrganizationManagementScope(
        requestContext.actor.id,
      );
    if (
      !projection ||
      projection.userType !== UserType.ORGANIZATION_USER ||
      projection.status !== UserStatus.ACTIVE ||
      projection.deletedAt !== null ||
      projection.memberships.length !== 1
    ) {
      throw new ScopeMissingException();
    }

    const membership = projection.memberships[0];
    const resolved = requestContext.activeMembership;
    const permissions = membership.role.rolePermissions.map(
      ({ permission }) => permission.code,
    );
    if (
      membership.userId !== projection.id ||
      membership.userType !== UserType.ORGANIZATION_USER ||
      membership.status !== MembershipStatus.ACTIVE ||
      membership.endedAt !== null ||
      membership.deletedAt !== null ||
      membership.schoolId !== null ||
      membership.organization.status !== OrganizationStatus.ACTIVE ||
      membership.organization.deletedAt !== null ||
      membership.role.key !== 'organization_admin' ||
      !membership.role.isSystem ||
      membership.role.schoolId !== null ||
      membership.role.deletedAt !== null ||
      !resolved ||
      resolved.membershipId !== membership.id ||
      resolved.organizationId !== membership.organizationId ||
      resolved.schoolId !== null ||
      resolved.roleId !== membership.roleId ||
      !permissions.includes(REQUIRED_PERMISSION)
    ) {
      throw new ScopeMissingException();
    }

    setOrganizationScope({
      actorId: projection.id,
      membershipId: membership.id,
      organizationId: membership.organizationId,
      roleId: membership.roleId,
    });
    return true;
  }
}
