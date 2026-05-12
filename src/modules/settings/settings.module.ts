import { Module } from '@nestjs/common';
import { BrandingModule } from './branding/branding.module';
import { RolesModule } from './roles/roles.module';
import { PermissionsModule } from './permissions/permissions.module';
import { UsersModule } from './users/users.module';
import { SecurityModule } from './security/security.module';
import { OverviewModule } from './overview/overview.module';
import { LoginIdentityModule } from './login-identity/login-identity.module';
import { EmailModule } from './email/email.module';

@Module({
  imports: [
    BrandingModule,
    RolesModule,
    PermissionsModule,
    UsersModule,
    SecurityModule,
    LoginIdentityModule,
    EmailModule,
    OverviewModule,
  ],
})
export class SettingsModule {}
