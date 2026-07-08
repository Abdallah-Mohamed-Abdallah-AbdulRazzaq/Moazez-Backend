# DISMISSAL-FINAL-DOCS-REFRESH-1A Closeout

## Sprint name

DISMISSAL-FINAL-DOCS-REFRESH-1A - Refresh Final Acceptance Baseline After IAM Settings Fix

## Baseline commit

Expected and actual HEAD matched:

```text
adcf4b34 fix: expose dismissal staff role in settings
```

## Reason for refresh

The final acceptance docs were created before the Settings IAM bridge fix. This refresh updates the final Dismissal / Smart Pickup V1 acceptance baseline to include `adcf4b34 fix: expose dismissal staff role in settings`.

## Files changed

- `docs/dismissal-final-acceptance-v1.md`
- `docs/dismissal-production-readiness-audit-v1.md`
- `docs/sprint-dismissal-final-docs-refresh-1a-closeout.md`

## Schema changes

None.

## Migration changes

None.

## Seed changes

None.

## Route changes

None.

## Runtime source changes

None.

## Docs updated

- `docs/dismissal-final-acceptance-v1.md`
- `docs/dismissal-production-readiness-audit-v1.md`

## Tests added

None.

## Commands run

Pre-change:

```text
git status --short --untracked-files=all
git log --oneline -15
npx prisma validate
```

Post-change:

```text
npx prisma validate
npm run build
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.settings-dismissal-staff-role.spec.ts
```

All post-change verification commands passed.

## Known issues

None for this docs refresh.

## Final verdict

READY FOR REVIEW
