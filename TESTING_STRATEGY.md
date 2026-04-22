# Testing Strategy

## 1. Philosophy

Tests exist to protect tenancy, correctness, and refactorability — in that order. We do NOT chase coverage targets as a vanity metric. We test the things that break production.

## 2. Test Pyramid

```
       /\
      /  \       E2E (few, critical flows)
     /────\
    /      \     Integration (moderate, module-level)
   /────────\
  /          \   Unit (many, fast, cheap)
 /────────────\
```

- **Unit tests** — pure logic, no I/O. Domain services, presenters, validators.
- **Integration tests** — module-level, hit real DB (test database). Repositories, use-cases.
- **E2E tests** — full HTTP stack, real Docker services, seeded data. Critical user flows only.
- **Security tests** — tenancy isolation, permission enforcement. Live in `test/security/`.

## 3. Coverage Targets

- No blanket coverage target.
- **Mandatory test coverage** (must have tests):
  - Every auth flow (login, refresh, logout, me).
  - Every permission check.
  - Every admissions decision path.
  - Every enrollment transition (create, transfer, withdraw).
  - Every attendance session submit/unsubmit.
  - Every grade publish/approve/lock.
  - Every reinforcement approval/rejection.
  - Every tenancy boundary (cross-school access attempt).
- **Best-effort coverage**: everything else.

## 4. Directory Layout

```
test/
├── unit/                 # fast, no DB
├── integration/          # module-level, test DB
├── e2e/                  # full HTTP, test DB, seeded data
├── security/             # tenancy + permission isolation
└── fixtures/             # reusable test data builders
```

Additionally, module-local tests live in `src/modules/<module>/<submodule>/tests/` for tightly coupled specs.

## 5. Test Database

- Separate database: `moazez_test`.
- Reset between test suites via `prisma migrate reset --force --skip-seed`.
- Use transactional fixtures where possible — wrap each test in a transaction that rolls back.
- For E2E, use a clean DB per test file (slower but safer).

## 6. Test Data

Fixtures live in `test/fixtures/` and are reusable builders:

```typescript
const schoolA = await schoolFixture.build({ name: 'School A' });
const schoolB = await schoolFixture.build({ name: 'School B' });
const adminA = await userFixture.buildSchoolAdmin(schoolA.id);
```

Fixtures must NOT share state between tests.

## 7. Tenancy Isolation Tests (Non-Negotiable)

Every module that stores tenant-scoped data must have a test in `test/security/tenancy.<module>.spec.ts` that:

1. Creates two schools with distinct data.
2. Logs in as school A admin.
3. Attempts every GET/POST/PATCH/DELETE endpoint with school B's resource IDs.
4. Expects 404 (not 403, to avoid leaking existence).

This test is mandatory before a module is considered done.

## 8. Test Naming

- File names: `<subject>.<kind>.spec.ts`, e.g., `login.use-case.spec.ts`, `auth.e2e-spec.ts`.
- `describe` block names the subject: `describe('LoginUseCase', ...)`.
- `it` blocks describe the expected behavior: `it('rejects invalid password with auth.credentials.invalid', ...)`.

## 9. Tools

- **Jest** — the Nest default, kept as-is.
- **Supertest** — for HTTP e2e.
- **@nestjs/testing** — TestModule for integration.
- **testcontainers** (optional, V2) — for ephemeral DB per test.

## 10. What We Don't Test

- Library internals (Prisma, NestJS, argon2). Trust the library.
- Pure DTOs without logic.
- Generated code.
- Trivial getters/setters.

## 11. CI Rules

- All tests run on every PR.
- Failing tests block merge.
- Flaky tests are quarantined (moved to `test/quarantine/`) within 24 hours and fixed within one week.
- Test suite must finish in under 5 minutes for Sprint 1. Over 10 minutes → optimize or parallelize.

## 12. Agent Instructions for Writing Tests

When Claude Code writes a test, it must:

1. Use existing fixtures from `test/fixtures/`. Create new ones if needed.
2. Test happy path + error path + tenancy boundary (when applicable).
3. Reference error codes from `ERROR_CATALOG.md`. Never match on error message text.
4. Use meaningful assertions. `expect(result).toBeDefined()` is not a test.
5. Clean up after itself. No lingering data.
