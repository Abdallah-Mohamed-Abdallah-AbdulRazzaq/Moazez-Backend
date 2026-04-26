import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RequestContextMiddleware } from './common/context/context.middleware';
import { GlobalExceptionFilter } from './common/exceptions/global-exception.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { ScopeResolverGuard } from './common/guards/scope-resolver.guard';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './infrastructure/database/prisma.module';
import { AcademicsModule } from './modules/academics/academics.module';
import { AdmissionsModule } from './modules/admissions/admissions.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { FilesModule } from './modules/files/files.module';
import { HealthModule } from './modules/health/health.module';
import { IamModule } from './modules/iam/iam.module';
import { SettingsModule } from './modules/settings/settings.module';
import { StudentsModule } from './modules/students/students.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    PrismaModule,
    HealthModule,
    IamModule,
    SettingsModule,
    AcademicsModule,
    FilesModule,
    AdmissionsModule,
    StudentsModule,
    AttendanceModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    // Order matters: Jwt authenticates, Scope loads membership, Permissions
    // enforces @RequiredPermissions. Guards run in the order they are
    // registered here.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ScopeResolverGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('{*path}');
  }
}
