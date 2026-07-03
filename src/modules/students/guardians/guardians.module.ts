import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import type { NextFunction, Request } from 'express';
import { AuthModule } from '../../iam/auth/auth.module';
import { UsersModule } from '../../settings/users/users.module';
import { CreateOrLinkGuardianAccountUseCase } from './application/create-or-link-guardian-account.use-case';
import { CreateGuardianUseCase } from './application/create-guardian.use-case';
import { GetGuardianStudentsUseCase } from './application/get-guardian-students.use-case';
import { GetGuardianUseCase } from './application/get-guardian.use-case';
import { GetPrimaryStudentGuardiansUseCase } from './application/get-primary-student-guardians.use-case';
import { LinkGuardianToStudentUseCase } from './application/link-guardian-to-student.use-case';
import { ListGuardiansUseCase } from './application/list-guardians.use-case';
import { ListStudentGuardiansUseCase } from './application/list-student-guardians.use-case';
import { UnlinkGuardianFromStudentUseCase } from './application/unlink-guardian-from-student.use-case';
import { UpdateGuardianUseCase } from './application/update-guardian.use-case';
import { UpdateStudentGuardianLinkUseCase } from './application/update-student-guardian-link.use-case';
import {
  GuardianAccountsController,
  GuardiansController,
  LegacyGuardiansController,
} from './controller/guardians.controller';
import { StudentGuardiansController } from './controller/student-guardians.controller';
import { GuardiansRepository } from './infrastructure/guardians.repository';

const LEGACY_GUARDIANS_ROUTE_SEGMENT =
  '/students-guardians/students/guardians';
const CANONICAL_GUARDIANS_ROUTE_SEGMENT = '/students-guardians/guardians';

function rewriteLegacyGuardiansRoute(
  request: Request,
  _response: unknown,
  next: NextFunction,
): void {
  const originalUrl = request.originalUrl ?? request.url;
  const legacyRouteStart = originalUrl.indexOf(LEGACY_GUARDIANS_ROUTE_SEGMENT);

  if (legacyRouteStart === -1) {
    next();
    return;
  }

  const suffix = originalUrl.slice(
    legacyRouteStart + LEGACY_GUARDIANS_ROUTE_SEGMENT.length,
  );
  if (suffix && !suffix.startsWith('/') && !suffix.startsWith('?')) {
    next();
    return;
  }

  const prefix = originalUrl.slice(0, legacyRouteStart);
  request.url = `${prefix}${CANONICAL_GUARDIANS_ROUTE_SEGMENT}${suffix}`;
  next();
}

@Module({
  imports: [AuthModule, UsersModule],
  controllers: [
    GuardiansController,
    LegacyGuardiansController,
    GuardianAccountsController,
    StudentGuardiansController,
  ],
  providers: [
    GuardiansRepository,
    ListGuardiansUseCase,
    CreateGuardianUseCase,
    CreateOrLinkGuardianAccountUseCase,
    GetGuardianUseCase,
    UpdateGuardianUseCase,
    GetGuardianStudentsUseCase,
    ListStudentGuardiansUseCase,
    GetPrimaryStudentGuardiansUseCase,
    LinkGuardianToStudentUseCase,
    UpdateStudentGuardianLinkUseCase,
    UnlinkGuardianFromStudentUseCase,
  ],
  exports: [GuardiansRepository, CreateOrLinkGuardianAccountUseCase],
})
export class GuardiansModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(rewriteLegacyGuardiansRoute).forRoutes(
      {
        path: 'students-guardians/students/guardians',
        method: RequestMethod.ALL,
      },
      {
        path: 'students-guardians/students/guardians/{*path}',
        method: RequestMethod.ALL,
      },
    );
  }
}
