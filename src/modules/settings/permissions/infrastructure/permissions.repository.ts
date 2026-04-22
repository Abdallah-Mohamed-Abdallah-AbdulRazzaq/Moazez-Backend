import { Injectable } from '@nestjs/common';
import { Permission } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

@Injectable()
export class PermissionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  listPermissions(): Promise<Permission[]> {
    return this.prisma.permission.findMany({
      orderBy: [
        { module: 'asc' },
        { resource: 'asc' },
        { action: 'asc' },
      ],
    });
  }
}
