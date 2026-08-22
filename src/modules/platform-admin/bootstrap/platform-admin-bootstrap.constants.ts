export const PLATFORM_ADMIN_ROLE_CODE = 'platform_super_admin' as const;

export const PLATFORM_ADMIN_BOOTSTRAP_AUDIT_MODULE = 'iam' as const;
export const PLATFORM_ADMIN_BOOTSTRAP_AUDIT_ACTION =
  'iam.platform_administrator.bootstrap' as const;

export const PLATFORM_ADMIN_BOOTSTRAP_ENVIRONMENTS = [
  'staging',
  'production',
] as const;

export type PlatformAdminBootstrapEnvironment =
  (typeof PLATFORM_ADMIN_BOOTSTRAP_ENVIRONMENTS)[number];

const PLATFORM_ADMIN_BOOTSTRAP_ENVIRONMENT_SET = new Set<string>(
  PLATFORM_ADMIN_BOOTSTRAP_ENVIRONMENTS,
);

export function isPlatformAdminBootstrapEnvironment(
  value: unknown,
): value is PlatformAdminBootstrapEnvironment {
  return (
    typeof value === 'string' &&
    PLATFORM_ADMIN_BOOTSTRAP_ENVIRONMENT_SET.has(value)
  );
}

export const PLATFORM_ADMIN_BOOTSTRAP_MAX_TRANSACTION_ATTEMPTS = 4;
