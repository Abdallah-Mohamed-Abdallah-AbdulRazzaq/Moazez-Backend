export class TeacherSettingsAppDto {
  name!: 'Moazez';
  version!: string | null;
  environment!: string | null;
}

export class TeacherSettingsSchoolDisplayDto {
  name!: string | null;
  logoUrl!: string | null;
}

export class TeacherSettingsLegalDto {
  termsUrl!: string | null;
  privacyUrl!: string | null;
  status!: 'not_configured';
}

export class TeacherSettingsUnsupportedDto {
  privacySettings!: true;
  appPreferences!: true;
  supportTickets!: true;
  rating!: true;
}

export class TeacherSettingsAboutResponseDto {
  app!: TeacherSettingsAppDto;
  school!: TeacherSettingsSchoolDisplayDto;
  legal!: TeacherSettingsLegalDto;
  unsupported!: TeacherSettingsUnsupportedDto;
}

export class TeacherSettingsContactSchoolDto {
  name!: string | null;
  email!: string | null;
  phone!: string | null;
  address!: string | null;
}

export class TeacherSettingsSupportDto {
  email!: string | null;
  phone!: string | null;
  status!: 'not_configured';
}

export class TeacherSettingsContactResponseDto {
  school!: TeacherSettingsContactSchoolDto;
  support!: TeacherSettingsSupportDto;
}
