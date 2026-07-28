import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RequestContextMiddleware } from './common/context/context.middleware';
import { ApplicationLifecycleModule } from './bootstrap/application-lifecycle.module';
import {
  HttpLifecycleAdmissionGuard,
  HttpLifecycleCompletionInterceptor,
} from './bootstrap/http-drain.middleware';
import { GlobalExceptionFilter } from './common/exceptions/global-exception.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { OrganizationScopeGuard } from './common/guards/organization-scope.guard';
import { ScopeResolverGuard } from './common/guards/scope-resolver.guard';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './infrastructure/database/prisma.module';
import { RealtimeModule } from './infrastructure/realtime/realtime.module';
import { AcademicsModule } from './modules/academics/academics.module';
import { AdmissionsModule } from './modules/admissions/admissions.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { BehaviorModule } from './modules/behavior/behavior.module';
import { CommunicationModule } from './modules/communication/communication.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { DismissalModule } from './modules/dismissal/dismissal.module';
import { FilesModule } from './modules/files/files.module';
import { GradesModule } from './modules/grades/grades.module';
import { HealthModule } from './modules/health/health.module';
import { HomeworkModule } from './modules/homework/homework.module';
import { ApplicantPortalModule } from './modules/applicant-portal/applicant-portal.module';
import { IamModule } from './modules/iam/iam.module';
import { ParentAppModule } from './modules/parent-app/parent-app.module';
import { PlatformAdminModule } from './modules/platform-admin/platform-admin.module';
import { ReinforcementModule } from './modules/reinforcement/reinforcement.module';
import { SettingsModule } from './modules/settings/settings.module';
import { SchoolSupportModule } from './modules/school-support/school-support.module';
import { StudentAppModule } from './modules/student-app/student-app.module';
import { StudentsModule } from './modules/students/students.module';
import { TeacherAppModule } from './modules/teacher-app/teacher-app.module';
import { TeachersModule } from './modules/teachers/teachers.module';
import { OrganizationAdminModule } from './modules/organization-admin/organization-admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    ApplicationLifecycleModule,
    PrismaModule,
    RealtimeModule,
    HealthModule,
    IamModule,
    ApplicantPortalModule,
    PlatformAdminModule,
    OrganizationAdminModule,
    SettingsModule,
    AcademicsModule,
    FilesModule,
    AdmissionsModule,
    StudentsModule,
    AttendanceModule,
    GradesModule,
    HomeworkModule,
    ReinforcementModule,
    BehaviorModule,
    DismissalModule,
    CommunicationModule,
    SchoolSupportModule,
    DashboardModule,
    TeacherAppModule,
    TeachersModule,
    StudentAppModule,
    ParentAppModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpLifecycleCompletionInterceptor,
    },
    // Lifecycle admission must precede authentication and every other
    // resource-using guard.
    { provide: APP_GUARD, useClass: HttpLifecycleAdmissionGuard },
    // Order matters: authenticate, resolve Membership, establish any exact
    // Organization scope, then enforce route permissions.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ScopeResolverGuard },
    { provide: APP_GUARD, useClass: OrganizationScopeGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('{*path}');
  }
}
