import { withBypassSchoolScope } from '../../common/context/request-context';

/**
 * Runs the given query function outside of the Prisma schoolScope extension.
 *
 * Use for platform-level queries that must see across every school — e.g.
 * org-onboarding reads, billing aggregates, audit-log admin views. The
 * calling service must be annotated with @PlatformScope() so reviewers can
 * easily audit every bypass.
 */
export function platformBypassScope<T>(fn: () => Promise<T>): Promise<T> {
  return withBypassSchoolScope(fn);
}
