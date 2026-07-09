# DASHBOARD-LIGHT-MODE-DROPDOWN-1A Closeout

## Sprint name

`DASHBOARD-LIGHT-MODE-DROPDOWN-1A`

## Baseline commit

- Expected HEAD: `d3233348 feat: add dashboard module pages foundation`
- Actual HEAD: `d3233348 feat: add dashboard module pages foundation`
- Initial `git status --short --untracked-files=all`: clean
- Initial `npx prisma validate`: passed
- `DIRECTORY_STRUCTURE.md` was absent; `DIRECTORY_STRUCTURE_VISUAL.md` was used.
- `light-mode-dropdown-backend-contract.md` was not present in the repository; the attached sprint request and prior dashboard audit contract section were used as the runtime contract source.

## Files changed

Runtime:

- `src/modules/dashboard/application/get-dashboard-light-mode-dropdown.use-case.ts`
- `src/modules/dashboard/controller/dashboard.controller.ts`
- `src/modules/dashboard/dashboard.module.ts`
- `src/modules/dashboard/dto/dashboard-light-mode-dropdown.dto.ts`
- `src/modules/dashboard/infrastructure/dashboard-light-mode-dropdown.repository.ts`
- `src/modules/dashboard/presenters/dashboard-light-mode-dropdown.presenter.ts`

Seeds:

- `prisma/seeds/01-permissions.seed.ts`

Tests:

- `src/modules/dashboard/tests/dashboard-light-mode-dropdown.use-case.spec.ts`
- `src/modules/dashboard/tests/dashboard-light-mode-dropdown.presenter.spec.ts`
- `test/e2e/dashboard-light-mode-dropdown-foundation.e2e-spec.ts`
- `test/security/tenancy.dashboard-light-mode-dropdown.spec.ts`
- Existing dashboard E2E/security route inventories updated for the new route.

Docs:

- `docs/sprint-dashboard-light-mode-dropdown-1a-closeout.md`

## Schema changes

None.

## Migration changes

None.

## Seed changes

Added permission catalog entry:

```text
dashboard.light_mode_dropdown.view
```

System role inheritance remains unchanged:

- `platform_super_admin` receives it through `ALL`.
- `organization_admin` receives it through `NON_PLATFORM`.
- `school_admin` receives it through `SCHOOL_LEVEL`.
- `teacher`, `parent`, and `student` explicit permission arrays do not include it.

## Runtime changes

Added a read-only Dashboard LightModeDropdown contract foundation:

- `GetDashboardLightModeDropdownUseCase`
- `DashboardLightModeDropdownRepository`
- `presentDashboardLightModeDropdown`
- LightModeDropdown query/response DTOs

The use case resolves active dashboard school scope through `requireDashboardScope()`. The controller remains thin and delegates directly to the use case.

## Route changes

Added:

```text
GET /api/v1/dashboard/light-mode-dropdown
```

No todo CRUD, weather-provider, planner integration, alert lifecycle, realtime, export, or report routes were added.

## Permission changes

The new route requires:

```text
dashboard.light_mode_dropdown.view
```

## API contract added

`GET /api/v1/dashboard/light-mode-dropdown` supports:

- `locale=en|ar`, default `en`
- `timezone=<valid IANA timezone>`, default school profile timezone, then `UTC`
- `units=metric|imperial`, default `metric`
- `date=YYYY-MM-DD`, default today in the resolved timezone

The response includes:

- `generatedAt`
- `location`
- `weather`
- `hints`
- `highlights`
- `cities`
- `forecast`
- `planner`
- `meta`

## LightModeDropdown response summary

The foundation response is stable and frontend-friendly. It returns semantic `iconKey` strings only and does not return React, JSX, SVG, raw provider payloads, or internal tenant identifiers.

## Weather/provider status

No external weather provider calls were added.

Default behavior:

- `weather.status = provider_not_configured` when a school display location exists.
- `weather.status = location_missing` when no profile city, country, or formatted address exists.
- temperatures, observed time, forecast, highlights, and other cities remain empty/null.
- `meta.deferred.weatherProvider = deferred`
- `meta.deferred.weatherCache = deferred`

## Planner/todos status

Planner is foundation-only:

- `planner.date` uses the resolved date.
- `planner.timezone` uses the resolved timezone.
- `planner.eventDates = []`
- `planner.events = []`
- `planner.todos = []`
- `meta.todosStatus = not_persisted`

No todo persistence or todo CRUD routes were added.

## Location/timezone behavior

Location is resolved from the active school context only. The repository reads safe display fields from `SchoolProfile` through scoped Prisma:

- `timezone`
- `formattedAddress`
- `city`
- `country`

`latitude` and `longitude` are not selected and are not exposed.

Timezone resolution order:

1. valid query timezone
2. valid school profile timezone
3. `UTC`

`schoolId`, `organizationId`, membership, owner, role, and provider override-shaped input are not accepted by the HTTP DTO and are ignored by the use case when called directly in tests.

## Security/no-leak posture

- Route requires `dashboard.light_mode_dropdown.view`.
- Active dashboard school scope is required.
- School A cannot observe School B dropdown location/timezone data.
- Response excludes tenant/internal identifiers, user ids, actor ids, role ids, membership ids, raw rows, raw provider payloads, storage internals, provider secrets, SMTP secrets, latitude, and longitude.
- Teacher, parent, and student system role permission arrays remain excluded from the new dashboard permission.

## Tests added/updated

Added:

- `src/modules/dashboard/tests/dashboard-light-mode-dropdown.use-case.spec.ts`
- `src/modules/dashboard/tests/dashboard-light-mode-dropdown.presenter.spec.ts`
- `test/e2e/dashboard-light-mode-dropdown-foundation.e2e-spec.ts`
- `test/security/tenancy.dashboard-light-mode-dropdown.spec.ts`

Updated:

- dashboard E2E route inventory tests
- dashboard security controller/permission inventory tests

## Verification commands

Passed:

```text
npx prisma validate
npx prisma generate
npm run build
npx tsc -p tsconfig.build.json --noEmit
npx jest --runInBand src/modules/dashboard/tests/dashboard-light-mode-dropdown.use-case.spec.ts
npx jest --runInBand src/modules/dashboard/tests/dashboard-light-mode-dropdown.presenter.spec.ts
npm run test -- dashboard --runInBand
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dashboard-light-mode-dropdown-foundation.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dashboard-module-pages-foundation.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dashboard-analytics-data-pack-foundation.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dashboard-analytics-catalog-foundation.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dashboard-widgets-foundation.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dashboard-command-center-foundation.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dashboard-summary-foundation.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dashboard-alerts-foundation.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/dashboard-activity-feed-foundation.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dashboard-light-mode-dropdown.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dashboard-modules.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dashboard-analytics-data.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dashboard-analytics.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dashboard-widgets.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dashboard-command-center.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dashboard.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dashboard-alerts.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dashboard-activity-feed.spec.ts
```

## Known issues

- `light-mode-dropdown-backend-contract.md` was not present in the repository.
- Git prints local LF/CRLF warnings for touched files on Windows; `git diff --check` remains the authoritative whitespace gate.

## Final verdict

READY FOR REVIEW
