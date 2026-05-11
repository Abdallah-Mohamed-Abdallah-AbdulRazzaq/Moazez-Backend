import { SchoolLoginSettings, SchoolLoginSettingsStatus } from '@prisma/client';
import {
  DEFAULT_ALLOWED_CHARACTERS,
  DEFAULT_RESERVED_USERNAMES,
  DEFAULT_USERNAME_MAX_LENGTH,
  DEFAULT_USERNAME_MIN_LENGTH,
  parseReservedUsernames,
} from '../domain/login-identity.policy';
import { LoginIdentitySettingsResponseDto } from '../dto/login-identity.dto';

export function presentLoginIdentitySettings(
  settings: SchoolLoginSettings | null,
): LoginIdentitySettingsResponseDto {
  if (!settings) {
    return {
      configured: false,
      loginDomain: null,
      usernameMinLength: DEFAULT_USERNAME_MIN_LENGTH,
      usernameMaxLength: DEFAULT_USERNAME_MAX_LENGTH,
      allowedCharacters: DEFAULT_ALLOWED_CHARACTERS,
      reservedUsernames: [...DEFAULT_RESERVED_USERNAMES],
      status: 'disabled',
    };
  }

  return {
    configured: true,
    loginDomain: settings.loginDomain,
    usernameMinLength: settings.usernameMinLength,
    usernameMaxLength: settings.usernameMaxLength,
    allowedCharacters: settings.allowedCharacters ?? DEFAULT_ALLOWED_CHARACTERS,
    reservedUsernames: [
      ...new Set([
        ...DEFAULT_RESERVED_USERNAMES,
        ...parseReservedUsernames(settings.reservedUsernames),
      ]),
    ],
    status:
      settings.status === SchoolLoginSettingsStatus.ACTIVE
        ? 'active'
        : 'disabled',
  };
}
