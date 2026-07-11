# DASHBOARD-TODOS-1A Closeout

## Sprint identity

- Sprint: `DASHBOARD-TODOS-1A`
- Branch: `feat/dashboard-todos-1a`
- Base HEAD: `be01504ea0cfc62a15c626646926c32a5ff5d086`
- Base source: `origin/main`

## Closeout summary

Dashboard Todos is complete within the approved sprint scope. The feature adds
school-scoped, authenticated-owner Todo persistence to the Dashboard Light Mode
Dropdown, with dedicated CRUD routes, normalized storage, scoped authorization,
presenter-controlled response shapes, and complete migration, security, E2E,
and regression verification.

No unresolved runtime, migration, security, or E2E defects remain within the
sprint scope.

## Canonical migration state

Canonical baseline:

```text
prisma/migrations/20260710135222_baseline_v1/migration.sql
```

Dashboard Todos migration:

```text
prisma/migrations/20260711162248_dashboard_todos/migration.sql
```

Migration inventory and verification:

- Active migrations: 2
- New migrations versus `origin/main`: 1
- Rebaseline authorization: off
- Migration governance tests: 39/39 PASS
- Database schema: up to date
- First migration deployment: PASS
- Second deployment: no pending migrations
- Prisma Client generation: PASS

The Dashboard Todos migration contains only:

- `dashboard_todo_status` enum
- `dashboard_todo_priority` enum
- `dashboard_todos` table
- three Dashboard Todo indexes
- School foreign key
- User/owner foreign key

No existing canonical migration was modified.

## Fresh-database replay

An isolated disposable PostgreSQL database was created and verified with the
complete canonical migration path:

1. `20260710135222_baseline_v1` applied.
2. `20260711162248_dashboard_todos` applied.
3. A second deployment reported no pending migrations.
4. Seed completed successfully.
5. The database schema reported up to date.
6. The disposable database was removed.

```text
FRESH DATABASE REPLAY: PASS
```

## Seed and permission state

```text
Global permission catalog: 234 unique permissions
```

Added permissions:

- `dashboard.todos.view`
- `dashboard.todos.manage`

Accepted app-facing role posture:

- Teacher: 54 unique permissions
- Parent: 46 unique permissions
- Student: 57 unique permissions

Teacher, Parent, and Student explicitly exclude both Dashboard Todo
permissions. The permissions are available through the accepted
school-management role inheritance only.

## Controller architecture

`DashboardController` remains the read-only Dashboard aggregation controller
with 13 accepted read-only methods.

`DashboardTodosController` owns exactly the four Todo CRUD handlers:

- `listLightModeDropdownTodos`
- `createLightModeDropdownTodo`
- `updateLightModeDropdownTodo`
- `deleteLightModeDropdownTodo`

Both controllers are registered in `DashboardModule`. The controller split
preserved the existing read-only Dashboard security contracts.

## Public routes and permissions

```text
GET    /api/v1/dashboard/light-mode-dropdown/todos
        dashboard.todos.view

POST   /api/v1/dashboard/light-mode-dropdown/todos
        dashboard.todos.manage

PATCH  /api/v1/dashboard/light-mode-dropdown/todos/:todoId
        dashboard.todos.manage

DELETE /api/v1/dashboard/light-mode-dropdown/todos/:todoId
        dashboard.todos.manage
```

`DashboardTodosController` is protected by the accepted school-management-only
boundary.

The existing composed route remains independently protected:

```text
GET /api/v1/dashboard/light-mode-dropdown
Permission: dashboard.light_mode_dropdown.view
```

Todo permissions alone do not authorize the composed LightModeDropdown route.

## Runtime, ownership, and response behavior

- Active scope is resolved from the authenticated request context.
- Client-supplied school overrides are ignored.
- School isolation is enforced.
- Authenticated owner isolation is enforced.
- Cross-school and cross-owner IDs resolve as not found.
- Soft-deleted rows are excluded.
- Todo persistence is composed into LightModeDropdown.
- `meta.todosStatus = persisted` reports the persisted composition state.

Presenters do not expose:

- `schoolId`
- `organizationId`
- `ownerUserId`
- `membershipId`
- `roleId`
- `deletedAt`
- raw Prisma fields

## Static verification

```text
npx prisma validate: PASS
npx prisma generate: PASS
npm run build: PASS
npx tsc -p tsconfig.build.json --noEmit: PASS
git diff --check: PASS
```

LF-to-CRLF messages are informational working-copy warnings and are not
diff-check failures.

## Focused verification

```text
Dashboard unit:
32/32 suites
177/177 tests

Dashboard security:
10/10 suites
42/42 tests

Teacher security:
1/1 suite
55/55 tests

Dashboard E2E:
10/10 suites
55/55 tests

Dashboard Todo CRUD E2E:
1/1 suite
5/5 tests

Teacher final E2E:
1/1 suite
8/8 tests
```

All focused processes exited naturally without open-handle warnings.

## Canonical regression

The final canonical `npm run test:regression` result is:

```text
Unit:
440/440 suites
2,559/2,559 tests

Security:
84/84 suites
1,089/1,089 tests

E2E directory:
101/101 suites
483/483 tests

Root E2E:
1/1 suite
1/1 test

Configured test files:
186/186

Aggregate:
626/626 suites
4,132/4,132 tests
```

The canonical regression completed with:

- natural process exits;
- no open-handle warning;
- no forced-exit workaround;
- no retries used to manufacture a pass.

## Findings and repairs

Chronology:

1. Restored Dashboard Todos work from the safety stash onto current main.
2. Replaced the pre-rebaseline migration with a new canonical migration.
3. Verified empty-database replay.
4. Split Todo CRUD from the read-only Dashboard controller.
5. Corrected UUID security fixtures.
6. Corrected stale permission catalog expectations.
7. Corrected the LightModeDropdown E2E permission fixture.
8. Completed the canonical regression successfully.

Repaired finding classifications:

- migration-history compatibility
- controller responsibility regression
- stale permission catalog assertions
- invalid UUID test fixture
- E2E authorization fixture mismatch

No unresolved runtime, migration, security, or E2E defects remain within the
sprint scope.

## Repository safety

- No Live deployment or Live database access.
- No staged files during verification.
- No commit or push during validation phases.
- Safety stash retained.
- The branch is not claimed as committed or pushed.

## Final verdict

```text
DASHBOARD-TODOS-1A: CLOSED
```

```text
Migration gate: PASS
Security gate: PASS
Focused E2E gate: PASS
Canonical regression gate: PASS
Ready for staging: YES
Ready for commit: after final diff and scope audit
```
