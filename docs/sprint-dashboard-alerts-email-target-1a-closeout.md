# DASHBOARD-ALERTS-EMAIL-TARGET-1A Closeout

## Sprint name

DASHBOARD-ALERTS-EMAIL-TARGET-1A

## Baseline commit

Expected and actual HEAD before changes:

```text
9b68e27a fix: clarify academics subject catalog contract
```

## Files changed

```text
src/modules/dashboard/application/list-dashboard-alerts.use-case.ts
src/modules/dashboard/tests/dashboard-alerts.use-case.spec.ts
test/e2e/dashboard-alerts-foundation.e2e-spec.ts
docs/sprint-dashboard-alerts-email-target-1a-closeout.md
```

## Schema changes

None.

## Migration changes

None.

## Seed changes

None.

## Route changes

None.

## Permission changes

None.

## Runtime contract change

`settings.email_connection_missing` now returns:

```json
{
  "action": {
    "label": "Configure email",
    "target": "/settings/email/connection"
  }
}
```

The previous target `/settings/email` is no longer returned for that alert.

## Bug fixed

Fixed the dashboard alert action target for missing or inactive school email connection settings so it matches the existing frontend path and backend controller path:

```text
/settings/email/connection
```

## Tests added/updated

- Added a focused `buildDashboardAlerts(...)` unit regression for `settings.email_connection_missing`.
- Updated the existing dashboard alerts e2e contract test to assert `GET /api/v1/dashboard/alerts?source=settings&includeZeroCount=true` returns the corrected action target.

## Verification commands

Pre-change:

```text
git status --short --untracked-files=all
PASS: clean output

git log --oneline -15
PASS: HEAD was 9b68e27a fix: clarify academics subject catalog contract

npx prisma validate
PASS: The schema at prisma\schema.prisma is valid
```

Post-change:

```text
npx prisma validate
PASS: The schema at prisma\schema.prisma is valid

npx prisma generate
PASS: Generated Prisma Client (v6.19.3)

npm run build
PASS: nest build

npx tsc -p tsconfig.build.json --noEmit
PASS: no output

npx jest --runInBand src/modules/dashboard/tests/dashboard-alerts.use-case.spec.ts
PASS: Test Suites: 1 passed, Tests: 8 passed

npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dashboard-alerts-foundation.e2e-spec.ts
PASS: Test Suites: 1 passed, Tests: 6 passed

npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dashboard-summary-foundation.e2e-spec.ts
PASS: Test Suites: 1 passed, Tests: 2 passed

npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dashboard.spec.ts
PASS: Test Suites: 1 passed, Tests: 6 passed

npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dashboard-alerts.spec.ts
PASS: Test Suites: 1 passed, Tests: 3 passed
```

Final git checks:

```text
git diff --name-only
PASS:
src/modules/dashboard/application/list-dashboard-alerts.use-case.ts
src/modules/dashboard/tests/dashboard-alerts.use-case.spec.ts
test/e2e/dashboard-alerts-foundation.e2e-spec.ts

git diff --stat
PASS:
3 files changed, 37 insertions(+), 1 deletion(-)

git diff --check
PASS: exit code 0; no whitespace errors
NOTE: Git emitted LF-to-CRLF conversion warnings for the three tracked files because local core.autocrlf is true.

git status --short --untracked-files=all
PASS:
 M src/modules/dashboard/application/list-dashboard-alerts.use-case.ts
 M src/modules/dashboard/tests/dashboard-alerts.use-case.spec.ts
 M test/e2e/dashboard-alerts-foundation.e2e-spec.ts
?? docs/sprint-dashboard-alerts-email-target-1a-closeout.md
```

## Known issues

- `DIRECTORY_STRUCTURE.md` is not present in the repo; `DIRECTORY_STRUCTURE_VISUAL.md` was read as the closest relevant guide.
- `src/modules/dashboard/controller/dashboard-alerts.controller.ts` is not present; the actual dashboard alerts controller is `src/modules/dashboard/controller/dashboard.controller.ts`.
- No runtime or verification blockers found.

## Final verdict

READY FOR REVIEW
