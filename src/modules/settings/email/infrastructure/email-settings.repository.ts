import {
  MembershipStatus,
  Prisma,
  SchoolEmailConnection,
  SchoolEmailConnectionStatus,
  SchoolEmailProviderType,
  SchoolEmailTemplate,
  SchoolEmailTemplateKey,
} from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

export interface SaveEmailConnectionData {
  providerType: SchoolEmailProviderType;
  fromName: string;
  fromEmail: string;
  replyToEmail?: string | null;
  host?: string | null;
  port?: number | null;
  secure: boolean;
  username?: string | null;
  encryptedPassword?: string | null;
  encryptedApiKey?: string | null;
  status: SchoolEmailConnectionStatus;
  lastTestedAt?: Date | null;
  verifiedAt?: Date | null;
  failureReason?: string | null;
}

export interface SaveEmailTemplateData {
  subject: string;
  preheader?: string | null;
  title?: string | null;
  subtitle?: string | null;
  bodyHtml: string;
  bodyText?: string | null;
  footerHtml?: string | null;
  logoFileId?: string | null;
  supportEmail?: string | null;
  supportPhone?: string | null;
  socialLinks?: Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue;
  isActive: boolean;
}

@Injectable()
export class EmailSettingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  findConnection(): Promise<SchoolEmailConnection | null> {
    return this.scopedPrisma.schoolEmailConnection.findFirst({
      where: {},
    });
  }

  async saveConnection(
    schoolId: string,
    data: SaveEmailConnectionData,
  ): Promise<SchoolEmailConnection> {
    const existing = await this.findConnection();

    if (existing) {
      await this.scopedPrisma.schoolEmailConnection.updateMany({
        where: { id: existing.id },
        data,
      });

      return this.scopedPrisma.schoolEmailConnection.findFirstOrThrow({
        where: { id: existing.id },
      });
    }

    return this.scopedPrisma.schoolEmailConnection.create({
      data: {
        schoolId,
        ...data,
      },
    });
  }

  async updateConnectionState(
    id: string,
    data: {
      status: SchoolEmailConnectionStatus;
      lastTestedAt?: Date | null;
      verifiedAt?: Date | null;
      failureReason?: string | null;
    },
  ): Promise<SchoolEmailConnection> {
    await this.scopedPrisma.schoolEmailConnection.updateMany({
      where: { id },
      data,
    });

    return this.scopedPrisma.schoolEmailConnection.findFirstOrThrow({
      where: { id },
    });
  }

  listTemplates(): Promise<SchoolEmailTemplate[]> {
    return this.scopedPrisma.schoolEmailTemplate.findMany({
      where: {},
      orderBy: { key: 'asc' },
    });
  }

  findTemplate(
    key: SchoolEmailTemplateKey,
  ): Promise<SchoolEmailTemplate | null> {
    return this.scopedPrisma.schoolEmailTemplate.findFirst({
      where: { key },
    });
  }

  async saveTemplate(
    schoolId: string,
    key: SchoolEmailTemplateKey,
    data: SaveEmailTemplateData,
  ): Promise<SchoolEmailTemplate> {
    const existing = await this.findTemplate(key);

    if (existing) {
      await this.scopedPrisma.schoolEmailTemplate.updateMany({
        where: { id: existing.id },
        data,
      });

      return this.scopedPrisma.schoolEmailTemplate.findFirstOrThrow({
        where: { id: existing.id },
      });
    }

    return this.scopedPrisma.schoolEmailTemplate.create({
      data: {
        schoolId,
        key,
        ...data,
      },
    });
  }

  async deleteTemplate(key: SchoolEmailTemplateKey): Promise<number> {
    const result = await this.scopedPrisma.schoolEmailTemplate.deleteMany({
      where: { key },
    });

    return result.count;
  }

  async findSchoolBranding(schoolId: string): Promise<{
    name: string;
    logoUrl: string | null;
    supportEmail: string | null;
    supportPhone: string | null;
  }> {
    const [school, profile, securityEmail] = await Promise.all([
      this.prisma.school.findUnique({
        where: { id: schoolId },
        select: { name: true },
      }),
      this.scopedPrisma.schoolProfile.findFirst({
        where: {},
        select: { schoolName: true, logoUrl: true },
      }),
      this.prisma.user.findFirst({
        where: {
          memberships: {
            some: {
              schoolId,
              status: MembershipStatus.ACTIVE,
              role: { key: 'school_admin' },
            },
          },
          deletedAt: null,
        },
        select: { contactEmail: true, email: true, phone: true },
      }),
    ]);

    return {
      name: profile?.schoolName ?? school?.name ?? 'School',
      logoUrl: profile?.logoUrl ?? null,
      supportEmail: securityEmail?.contactEmail ?? securityEmail?.email ?? null,
      supportPhone: securityEmail?.phone ?? null,
    };
  }
}
