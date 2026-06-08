import { Injectable } from '@nestjs/common';
import {
  AuditOutcome,
  MembershipStatus,
  OrganizationStatus,
  Prisma,
  SchoolLoginSettingsStatus,
  SchoolStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { PlatformScope } from '../../../common/decorators/platform-scope.decorator';
import { platformBypassScope } from '../../../infrastructure/database/platform-bypass.helper';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type {
  PlatformSchoolProvisioningCredentialDeliveryMode,
  PlatformSchoolProvisioningCredentialStatus,
  PlatformSchoolProvisioningOrganizationMode,
} from '../dto/platform-admin-school-provisioning.dto';

const ORGANIZATION_SELECT = Prisma.validator<Prisma.OrganizationSelect>()({
  id: true,
  name: true,
  slug: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
});

const SCHOOL_SELECT = Prisma.validator<Prisma.SchoolSelect>()({
  id: true,
  organizationId: true,
  name: true,
  slug: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  organization: {
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
    },
  },
});

const PROVISIONING_ORGANIZATION_SELECT =
  Prisma.validator<Prisma.OrganizationSelect>()({
    id: true,
    name: true,
    slug: true,
    status: true,
  });

const PROVISIONING_SCHOOL_SELECT = Prisma.validator<Prisma.SchoolSelect>()({
  id: true,
  organizationId: true,
  name: true,
  slug: true,
  status: true,
});

const PROVISIONING_LOGIN_SETTINGS_SELECT =
  Prisma.validator<Prisma.SchoolLoginSettingsSelect>()({
    id: true,
    schoolId: true,
    loginDomain: true,
    status: true,
  });

const PROVISIONING_PRIMARY_ADMIN_SELECT = Prisma.validator<Prisma.UserSelect>()(
  {
    id: true,
    email: true,
    username: true,
    contactEmail: true,
    phone: true,
    firstName: true,
    lastName: true,
    userType: true,
    status: true,
    mustChangePassword: true,
    passwordProvisionedAt: true,
    credentialVersion: true,
  },
);

const PROVISIONING_MEMBERSHIP_SELECT =
  Prisma.validator<Prisma.MembershipSelect>()({
    id: true,
    userId: true,
    organizationId: true,
    schoolId: true,
    roleId: true,
    userType: true,
    status: true,
    role: {
      select: {
        id: true,
        key: true,
        name: true,
      },
    },
  });

export type PlatformOrganizationBaseRecord = Prisma.OrganizationGetPayload<{
  select: typeof ORGANIZATION_SELECT;
}>;

export type PlatformOrganizationRecord = PlatformOrganizationBaseRecord & {
  schoolsCount: number;
  activeSchoolsCount: number;
};

export type PlatformSchoolRecord = Prisma.SchoolGetPayload<{
  select: typeof SCHOOL_SELECT;
}>;

export type PlatformProvisioningOrganizationRecord =
  Prisma.OrganizationGetPayload<{
    select: typeof PROVISIONING_ORGANIZATION_SELECT;
  }>;

export type PlatformProvisioningSchoolRecord = Prisma.SchoolGetPayload<{
  select: typeof PROVISIONING_SCHOOL_SELECT;
}>;

export type PlatformProvisioningLoginSettingsRecord =
  Prisma.SchoolLoginSettingsGetPayload<{
    select: typeof PROVISIONING_LOGIN_SETTINGS_SELECT;
  }>;

export type PlatformProvisioningPrimaryAdminRecord = Prisma.UserGetPayload<{
  select: typeof PROVISIONING_PRIMARY_ADMIN_SELECT;
}>;

export type PlatformProvisioningMembershipRecord = Prisma.MembershipGetPayload<{
  select: typeof PROVISIONING_MEMBERSHIP_SELECT;
}>;

export interface PlatformSchoolProvisioningRecord {
  organization: PlatformProvisioningOrganizationRecord;
  school: PlatformProvisioningSchoolRecord;
  loginSettings: PlatformProvisioningLoginSettingsRecord;
  primaryAdmin: PlatformProvisioningPrimaryAdminRecord;
  membership: PlatformProvisioningMembershipRecord;
  credentials: {
    deliveryMode: PlatformSchoolProvisioningCredentialDeliveryMode;
    status: PlatformSchoolProvisioningCredentialStatus;
  };
}

export interface PlatformStatusCounters {
  total: number;
  active: number;
  suspended: number;
  archived: number;
}

export interface PlatformOverviewCounts {
  organizations: PlatformStatusCounters;
  schools: PlatformStatusCounters;
}

export interface PlatformOrganizationListParams {
  status?: OrganizationStatus;
  search?: string;
  limit: number;
  cursor?: string;
}

export interface PlatformSchoolListParams {
  organizationId?: string;
  status?: SchoolStatus;
  search?: string;
  limit: number;
  cursor?: string;
}

export interface PlatformPageResult<T> {
  items: T[];
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ProvisionPlatformSchoolTransactionData {
  actor: {
    actorId: string;
    userType: UserType;
  };
  organization:
    | {
        mode: Extract<PlatformSchoolProvisioningOrganizationMode, 'create'>;
        name: string;
        slug: string;
      }
    | {
        mode: Extract<PlatformSchoolProvisioningOrganizationMode, 'existing'>;
        organizationId: string;
      };
  school: {
    name: string;
    slug: string;
  };
  loginIdentity: {
    loginDomain: string;
  };
  primaryAdmin: {
    firstName: string;
    lastName: string;
    username: string;
    loginEmail: string;
    contactEmail: string;
    phone?: string | null;
    passwordHash?: string | null;
    mustChangePassword: boolean;
    passwordProvisionedAt?: Date | null;
    credentialVersion: number;
  };
  credentials: {
    deliveryMode: PlatformSchoolProvisioningCredentialDeliveryMode;
    status: PlatformSchoolProvisioningCredentialStatus;
  };
  schoolAdminRoleId: string;
}

@Injectable()
@PlatformScope()
export class PlatformAdminRepository {
  constructor(private readonly prisma: PrismaService) {}

  loadOverviewCounts(): Promise<PlatformOverviewCounts> {
    return platformBypassScope(async () => {
      const [
        organizationsTotal,
        organizationsActive,
        organizationsSuspended,
        organizationsArchived,
        schoolsTotal,
        schoolsActive,
        schoolsSuspended,
        schoolsArchived,
      ] = await Promise.all([
        this.prisma.organization.count({ where: { deletedAt: null } }),
        this.prisma.organization.count({
          where: { deletedAt: null, status: OrganizationStatus.ACTIVE },
        }),
        this.prisma.organization.count({
          where: { deletedAt: null, status: OrganizationStatus.SUSPENDED },
        }),
        this.prisma.organization.count({
          where: { deletedAt: null, status: OrganizationStatus.ARCHIVED },
        }),
        this.prisma.school.count({ where: { deletedAt: null } }),
        this.prisma.school.count({
          where: { deletedAt: null, status: SchoolStatus.ACTIVE },
        }),
        this.prisma.school.count({
          where: { deletedAt: null, status: SchoolStatus.SUSPENDED },
        }),
        this.prisma.school.count({
          where: { deletedAt: null, status: SchoolStatus.ARCHIVED },
        }),
      ]);

      return {
        organizations: {
          total: organizationsTotal,
          active: organizationsActive,
          suspended: organizationsSuspended,
          archived: organizationsArchived,
        },
        schools: {
          total: schoolsTotal,
          active: schoolsActive,
          suspended: schoolsSuspended,
          archived: schoolsArchived,
        },
      };
    });
  }

  listOrganizations(
    params: PlatformOrganizationListParams,
  ): Promise<PlatformPageResult<PlatformOrganizationRecord>> {
    return platformBypassScope(async () => {
      const rows = await this.prisma.organization.findMany({
        where: this.buildOrganizationWhere(params),
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: params.limit + 1,
        ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
        select: ORGANIZATION_SELECT,
      });

      const pageRows = rows.slice(0, params.limit);
      const items = await this.attachOrganizationCounts(pageRows);

      return {
        items,
        limit: params.limit,
        hasMore: rows.length > params.limit,
        nextCursor:
          rows.length > params.limit && pageRows.length > 0
            ? pageRows[pageRows.length - 1].id
            : null,
      };
    });
  }

  async findOrganizationById(
    organizationId: string,
  ): Promise<PlatformOrganizationRecord | null> {
    return platformBypassScope(async () => {
      const record = await this.prisma.organization.findFirst({
        where: { id: organizationId, deletedAt: null },
        select: ORGANIZATION_SELECT,
      });

      if (!record) return null;
      const [withCounts] = await this.attachOrganizationCounts([record]);
      return withCounts ?? null;
    });
  }

  findOrganizationBySlug(
    slug: string,
  ): Promise<PlatformOrganizationBaseRecord | null> {
    return platformBypassScope(() =>
      this.prisma.organization.findUnique({
        where: { slug },
        select: ORGANIZATION_SELECT,
      }),
    );
  }

  findLoginSettingsByDomain(loginDomain: string): Promise<{
    id: string;
    schoolId: string;
    loginDomain: string;
  } | null> {
    return platformBypassScope(() =>
      this.prisma.schoolLoginSettings.findFirst({
        where: { loginDomain },
        select: {
          id: true,
          schoolId: true,
          loginDomain: true,
        },
      }),
    );
  }

  findUserByLoginEmail(loginEmail: string): Promise<{
    id: string;
    email: string;
  } | null> {
    return platformBypassScope(() =>
      this.prisma.user.findFirst({
        where: { email: loginEmail, deletedAt: null },
        select: { id: true, email: true },
      }),
    );
  }

  findSystemRoleByKey(roleKey: string): Promise<{
    id: string;
    key: string;
    name: string;
  } | null> {
    return platformBypassScope(() =>
      this.prisma.role.findFirst({
        where: {
          key: roleKey,
          schoolId: null,
          isSystem: true,
          deletedAt: null,
        },
        select: {
          id: true,
          key: true,
          name: true,
        },
      }),
    );
  }

  createOrganization(data: {
    name: string;
    slug: string;
  }): Promise<PlatformOrganizationRecord> {
    return platformBypassScope(async () => {
      const record = await this.prisma.organization.create({
        data: {
          name: data.name,
          slug: data.slug,
          status: OrganizationStatus.ACTIVE,
        },
        select: ORGANIZATION_SELECT,
      });

      return {
        ...record,
        schoolsCount: 0,
        activeSchoolsCount: 0,
      };
    });
  }

  updateOrganization(data: {
    organizationId: string;
    name?: string;
    slug?: string;
    status?: OrganizationStatus;
  }): Promise<PlatformOrganizationRecord> {
    return platformBypassScope(async () => {
      await this.prisma.organization.update({
        where: { id: data.organizationId },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.slug !== undefined ? { slug: data.slug } : {}),
          ...(data.status !== undefined ? { status: data.status } : {}),
        },
      });

      return this.findOrganizationByIdOrThrow(data.organizationId);
    });
  }

  listSchools(
    params: PlatformSchoolListParams,
  ): Promise<PlatformPageResult<PlatformSchoolRecord>> {
    return platformBypassScope(async () => {
      const rows = await this.prisma.school.findMany({
        where: this.buildSchoolWhere(params),
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: params.limit + 1,
        ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
        select: SCHOOL_SELECT,
      });

      const pageRows = rows.slice(0, params.limit);

      return {
        items: pageRows,
        limit: params.limit,
        hasMore: rows.length > params.limit,
        nextCursor:
          rows.length > params.limit && pageRows.length > 0
            ? pageRows[pageRows.length - 1].id
            : null,
      };
    });
  }

  findSchoolById(schoolId: string): Promise<PlatformSchoolRecord | null> {
    return platformBypassScope(() =>
      this.prisma.school.findFirst({
        where: { id: schoolId, deletedAt: null },
        select: SCHOOL_SELECT,
      }),
    );
  }

  findSchoolBySlug(params: {
    organizationId: string;
    slug: string;
  }): Promise<PlatformSchoolRecord | null> {
    return platformBypassScope(() =>
      this.prisma.school.findUnique({
        where: {
          organizationId_slug: {
            organizationId: params.organizationId,
            slug: params.slug,
          },
        },
        select: SCHOOL_SELECT,
      }),
    );
  }

  createSchool(data: {
    organizationId: string;
    name: string;
    slug: string;
  }): Promise<PlatformSchoolRecord> {
    return platformBypassScope(() =>
      this.prisma.school.create({
        data: {
          organizationId: data.organizationId,
          name: data.name,
          slug: data.slug,
          status: SchoolStatus.ACTIVE,
        },
        select: SCHOOL_SELECT,
      }),
    );
  }

  provisionSchool(
    data: ProvisionPlatformSchoolTransactionData,
  ): Promise<PlatformSchoolProvisioningRecord> {
    return platformBypassScope(() =>
      this.prisma.$transaction(async (transaction) => {
        const organization =
          data.organization.mode === 'create'
            ? await transaction.organization.create({
                data: {
                  name: data.organization.name,
                  slug: data.organization.slug,
                  status: OrganizationStatus.ACTIVE,
                },
                select: PROVISIONING_ORGANIZATION_SELECT,
              })
            : await transaction.organization.findFirstOrThrow({
                where: {
                  id: data.organization.organizationId,
                  deletedAt: null,
                },
                select: PROVISIONING_ORGANIZATION_SELECT,
              });

        const school = await transaction.school.create({
          data: {
            organizationId: organization.id,
            name: data.school.name,
            slug: data.school.slug,
            status: SchoolStatus.ACTIVE,
          },
          select: PROVISIONING_SCHOOL_SELECT,
        });

        const loginSettings = await transaction.schoolLoginSettings.create({
          data: {
            schoolId: school.id,
            loginDomain: data.loginIdentity.loginDomain,
            status: SchoolLoginSettingsStatus.ACTIVE,
          },
          select: PROVISIONING_LOGIN_SETTINGS_SELECT,
        });

        const primaryAdmin = await transaction.user.create({
          data: {
            email: data.primaryAdmin.loginEmail,
            username: data.primaryAdmin.username,
            contactEmail: data.primaryAdmin.contactEmail,
            phone: data.primaryAdmin.phone ?? null,
            firstName: data.primaryAdmin.firstName,
            lastName: data.primaryAdmin.lastName,
            userType: UserType.SCHOOL_USER,
            status: UserStatus.ACTIVE,
            passwordHash: data.primaryAdmin.passwordHash ?? null,
            mustChangePassword: data.primaryAdmin.mustChangePassword,
            passwordProvisionedAt:
              data.primaryAdmin.passwordProvisionedAt ?? null,
            passwordChangedAt: null,
            credentialVersion: data.primaryAdmin.credentialVersion,
          },
          select: PROVISIONING_PRIMARY_ADMIN_SELECT,
        });

        const membership = await transaction.membership.create({
          data: {
            userId: primaryAdmin.id,
            organizationId: organization.id,
            schoolId: school.id,
            roleId: data.schoolAdminRoleId,
            userType: UserType.SCHOOL_USER,
            status: MembershipStatus.ACTIVE,
          },
          select: PROVISIONING_MEMBERSHIP_SELECT,
        });

        await this.recordProvisioningAuditEntries(transaction, {
          actor: data.actor,
          organization,
          organizationMode: data.organization.mode,
          school,
          loginSettings,
          primaryAdmin,
          membership,
          credentials: data.credentials,
        });

        return {
          organization,
          school,
          loginSettings,
          primaryAdmin,
          membership,
          credentials: data.credentials,
        };
      }),
    );
  }

  updateSchool(data: {
    schoolId: string;
    name?: string;
    slug?: string;
    status?: SchoolStatus;
  }): Promise<PlatformSchoolRecord> {
    return platformBypassScope(() =>
      this.prisma.school.update({
        where: { id: data.schoolId },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.slug !== undefined ? { slug: data.slug } : {}),
          ...(data.status !== undefined ? { status: data.status } : {}),
        },
        select: SCHOOL_SELECT,
      }),
    );
  }

  private async findOrganizationByIdOrThrow(
    organizationId: string,
  ): Promise<PlatformOrganizationRecord> {
    const record = await this.findOrganizationById(organizationId);
    if (!record) {
      throw new Error(
        `Organization disappeared during update: ${organizationId}`,
      );
    }
    return record;
  }

  private buildOrganizationWhere(
    params: PlatformOrganizationListParams,
  ): Prisma.OrganizationWhereInput {
    return {
      deletedAt: null,
      ...(params.status ? { status: params.status } : {}),
      ...(params.search
        ? {
            OR: [
              { name: { contains: params.search, mode: 'insensitive' } },
              { slug: { contains: params.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  private buildSchoolWhere(
    params: PlatformSchoolListParams,
  ): Prisma.SchoolWhereInput {
    return {
      deletedAt: null,
      ...(params.organizationId
        ? { organizationId: params.organizationId }
        : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.search
        ? {
            OR: [
              { name: { contains: params.search, mode: 'insensitive' } },
              { slug: { contains: params.search, mode: 'insensitive' } },
              {
                organization: {
                  name: { contains: params.search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };
  }

  private async attachOrganizationCounts(
    organizations: PlatformOrganizationBaseRecord[],
  ): Promise<PlatformOrganizationRecord[]> {
    if (organizations.length === 0) return [];

    const organizationIds = organizations.map(
      (organization) => organization.id,
    );
    const schoolCounts = await this.prisma.school.groupBy({
      by: ['organizationId', 'status'],
      where: {
        organizationId: { in: organizationIds },
        deletedAt: null,
      },
      _count: { _all: true },
    });

    const countsByOrganizationId = new Map<
      string,
      { total: number; active: number }
    >();

    for (const row of schoolCounts) {
      const current = countsByOrganizationId.get(row.organizationId) ?? {
        total: 0,
        active: 0,
      };
      current.total += row._count._all;
      if (row.status === SchoolStatus.ACTIVE) {
        current.active += row._count._all;
      }
      countsByOrganizationId.set(row.organizationId, current);
    }

    return organizations.map((organization) => {
      const counts = countsByOrganizationId.get(organization.id);
      return {
        ...organization,
        schoolsCount: counts?.total ?? 0,
        activeSchoolsCount: counts?.active ?? 0,
      };
    });
  }

  private async recordProvisioningAuditEntries(
    transaction: Prisma.TransactionClient,
    input: {
      actor: {
        actorId: string;
        userType: UserType;
      };
      organization: PlatformProvisioningOrganizationRecord;
      organizationMode: PlatformSchoolProvisioningOrganizationMode;
      school: PlatformProvisioningSchoolRecord;
      loginSettings: PlatformProvisioningLoginSettingsRecord;
      primaryAdmin: PlatformProvisioningPrimaryAdminRecord;
      membership: PlatformProvisioningMembershipRecord;
      credentials: {
        deliveryMode: PlatformSchoolProvisioningCredentialDeliveryMode;
        status: PlatformSchoolProvisioningCredentialStatus;
      };
    },
  ): Promise<void> {
    const auditBase = {
      actorId: input.actor.actorId,
      userType: input.actor.userType,
      outcome: AuditOutcome.SUCCESS,
      module: 'platform_admin',
    };

    const organizationAction =
      input.organizationMode === 'create'
        ? 'platform.school_provisioning.organization.create'
        : 'platform.school_provisioning.organization.select';

    await transaction.auditLog.create({
      data: {
        ...auditBase,
        organizationId: input.organization.id,
        schoolId: null,
        action: organizationAction,
        resourceType: 'organization',
        resourceId: input.organization.id,
        after: {
          provisioning: true,
          mode: input.organizationMode,
          organizationId: input.organization.id,
          changedFields:
            input.organizationMode === 'create'
              ? ['name', 'slug', 'status']
              : [],
          status: input.organization.status,
        } satisfies Prisma.InputJsonObject,
      },
    });

    await transaction.auditLog.create({
      data: {
        ...auditBase,
        organizationId: input.organization.id,
        schoolId: input.school.id,
        action: 'platform.school_provisioning.school.create',
        resourceType: 'school',
        resourceId: input.school.id,
        after: {
          provisioning: true,
          organizationId: input.organization.id,
          schoolId: input.school.id,
          changedFields: ['name', 'slug', 'status'],
          status: input.school.status,
        } satisfies Prisma.InputJsonObject,
      },
    });

    await transaction.auditLog.create({
      data: {
        ...auditBase,
        organizationId: input.organization.id,
        schoolId: input.school.id,
        action: 'platform.school_provisioning.login_identity.configure',
        resourceType: 'school_login_settings',
        resourceId: input.loginSettings.id,
        after: {
          provisioning: true,
          schoolId: input.school.id,
          loginDomain: input.loginSettings.loginDomain,
          changedFields: ['loginDomain', 'status'],
          status: input.loginSettings.status,
        } satisfies Prisma.InputJsonObject,
      },
    });

    await transaction.auditLog.create({
      data: {
        ...auditBase,
        organizationId: input.organization.id,
        schoolId: input.school.id,
        action: 'platform.school_provisioning.primary_admin.create',
        resourceType: 'user',
        resourceId: input.primaryAdmin.id,
        after: {
          provisioning: true,
          userId: input.primaryAdmin.id,
          userType: input.primaryAdmin.userType,
          status: input.primaryAdmin.status,
          generatedLoginEmail: true,
          changedFields: [
            'email',
            'username',
            'contactEmail',
            'phone',
            'status',
            'userType',
            'mustChangePassword',
          ],
        } satisfies Prisma.InputJsonObject,
      },
    });

    await transaction.auditLog.create({
      data: {
        ...auditBase,
        organizationId: input.organization.id,
        schoolId: input.school.id,
        action: 'platform.school_provisioning.membership.create',
        resourceType: 'membership',
        resourceId: input.membership.id,
        after: {
          provisioning: true,
          membershipId: input.membership.id,
          userId: input.primaryAdmin.id,
          organizationId: input.organization.id,
          schoolId: input.school.id,
          roleId: input.membership.roleId,
          roleKey: input.membership.role.key,
          userType: input.membership.userType,
          status: input.membership.status,
        } satisfies Prisma.InputJsonObject,
      },
    });

    await transaction.auditLog.create({
      data: {
        ...auditBase,
        organizationId: input.organization.id,
        schoolId: input.school.id,
        action: 'platform.school_provisioning.credentials.provision',
        resourceType: 'user',
        resourceId: input.primaryAdmin.id,
        after: {
          provisioning: true,
          userId: input.primaryAdmin.id,
          deliveryMode: input.credentials.deliveryMode,
          status: input.credentials.status,
          mustChangePassword: input.primaryAdmin.mustChangePassword,
          credentialVersion: input.primaryAdmin.credentialVersion,
        } satisfies Prisma.InputJsonObject,
      },
    });
  }
}
