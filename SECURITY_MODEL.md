# Security Model

This document is the authoritative source for how authentication, authorization, tenancy, and scope are enforced in the Moazez backend.

## 1. Core Principle

Every request that touches persisted data must resolve and enforce, in this order:

1. Authenticated actor (who is making the request)
2. User type (platform_user, organization_user, school_user, teacher, parent, student, applicant, pickup_delegate, service_account)
3. Active membership and scope (which school, which organization, which academic context)
4. Permission check (does the resolved actor have the right to perform this action)
5. Resource ownership check (does the resolved actor's scope allow accessing the specific row)

No layer of the stack is permitted to skip these checks.

## 2. Tenancy Enforcement Strategy

The approved strategy is **application-level enforcement via Prisma middleware + mandatory scope guards**.

We do NOT rely on PostgreSQL Row-Level Security (RLS) in V1. See `adr/ADR-0001-multi-tenancy-enforcement.md` for rationale.

### Implementation rules

- Every tenant-scoped Prisma model must include `schoolId` (and/or `organizationId` for cross-school data).
- A global Prisma extension (`schoolScope`) automatically injects `schoolId = currentContext.schoolId` into every `findMany`, `findFirst`, `findUnique`, `count`, `update`, `delete`, `aggregate`, `groupBy`.
- Any repository method that needs to bypass this (platform-level queries) must use the `platformBypassScope()` helper and must be annotated with `@PlatformScope()` on the calling service.
- Code review rejects any Prisma call that hand-crafts `where: { schoolId: req.schoolId }` — if it needs hand-crafting, the extension was bypassed.

### Request context

A `RequestContext` object is built in middleware and attached to the request via AsyncLocalStorage. It contains:

- actor: `{ id, userType }`
- activeMembership: `{ schoolId, organizationId, roleId, scope }`
- permissions: array of permission strings resolved for the active membership
- academicContext: `{ academicYearId, termId }` resolved from header or default

Services consume `RequestContext` via dependency injection (`@Inject(REQUEST_CONTEXT)`), never by reading `req.*` directly.

## 3. User Type Constraints

| User type          | Membership cardinality                                            |
| ------------------ | ----------------------------------------------------------------- |
| platform_user      | Platform-wide, no school membership required                      |
| organization_user  | One organization; may access all schools under it                 |
| school_user        | Exactly one school                                                |
| teacher            | **Exactly one school** (enforced by DB UNIQUE constraint)         |
| parent             | Any number of children across schools within the same organization |
| student            | Exactly one active enrollment at any time                         |
| applicant          | Pre-admission, no school membership yet                           |
| pickup_delegate    | Scoped to specific student(s), not a school                       |
| service_account    | System-level, scope defined per account                           |

## 4. Guard Hierarchy

All authenticated controllers apply guards in this order:

1. `JwtAuthGuard` — verifies token, attaches actor
2. `ScopeResolverGuard` — resolves active membership and school context
3. `PermissionsGuard` — checks `@RequiredPermissions()` decorator
4. `ResourceOwnershipGuard` (route-specific) — verifies the resolved actor owns or can access the specific resource id in the URL

Controllers that skip any of these guards without explicit `@PublicRoute()` annotation are rejected in code review.

## 5. Permission Model

- Permissions are strings in the format `module.resource.action` (e.g., `settings.users.manage`, `attendance.sessions.submit`).
- A permission catalog is seeded and versioned. New permissions require a migration.
- Roles are compositions of permissions, scoped to a school.
- System roles (`isSystem: true`) cannot be deleted or have their permissions removed; they can only be cloned.
- Custom roles are always school-scoped.

## 6. Audit Logging

The approved strategy is **service-level explicit audit calls** for V1. No automatic middleware audit.

Rules:

- Services that mutate sensitive resources call `auditLog.record({...})` explicitly.
- Every audit record includes: `actorId`, `userType`, `schoolId`, `organizationId`, `module`, `action`, `resourceType`, `resourceId`, `before` (optional), `after` (optional), `outcome`, `timestamp`.
- Sensitive actions that MUST be audited:
  - `auth.login.success`, `auth.login.failure`, `auth.password.reset`
  - `iam.role.create`, `iam.role.update`, `iam.role.delete`, `iam.role.permissions.change`
  - `iam.user.create`, `iam.user.status.change`
  - `admissions.application.decision`
  - `students.enrollment.create`, `students.enrollment.transfer`, `students.enrollment.withdraw`
  - `attendance.session.submit`, `attendance.session.unsubmit`
  - `grades.assessment.publish`, `grades.assessment.approve`, `grades.assessment.lock`, `grades.item.bulk_enter`
  - `reinforcement.review.approve`, `reinforcement.review.reject`
  - `settings.security.change`, `settings.integrations.connect`

## 7. Rate Limiting

Applied per-route via interceptor with Redis-backed bucket.

Baselines:

- Auth endpoints: 5 requests / minute / IP
- Password reset: 3 requests / hour / email
- Upload endpoints: 30 requests / hour / user
- Chat send: 60 messages / minute / user
- Generic authenticated API: 300 requests / minute / user
- Public endpoints: 60 requests / minute / IP

## 8. File Access

- All file URLs are **signed URLs** by default (expiry: 15 minutes).
- Permanent-public files (school logo, branding assets) use a separate public-bucket strategy.
- Private file access always resolves through `/api/v1/files/:id/download` which re-checks authorization before issuing the signed URL.
- Direct S3/MinIO URLs are never returned in API responses.

## 9. Auth Specifics

- Password hashing: argon2id (memory=19MB, iterations=2, parallelism=1).
- JWT access token TTL: 15 minutes. Refresh token TTL: 7 days. Refresh rotation on every use.
- Sessions table tracks active refresh tokens. Revocation is supported.
- 2FA is scaffolded in schema but NOT enforced in V1.

## 10. Smart Pickup / Geofence (V1 Basic)

- Geofence enforcement is server-side: client-sent coordinates are validated against `allowedRadiusMeters`.
- A `geofenceSpoofingRiskScore` is attached based on velocity and timing heuristics.
- Every pickup request is logged with `parentLocation`, `serverTime`, `childId`, `riskScore`.
- Advanced anti-spoofing (biometric gate, rotating QR, GPS-mock detection) is out of V1 scope per `V1_SCOPE.md`.

## 11. Input Validation

- All request bodies validated via DTOs + class-validator decorators at controller layer.
- All path params validated via pipes.
- All external inputs (file content, parsed CSV, webhooks) re-validated at the service layer.
- HTML-bearing fields (announcements, chat messages, notes) are sanitized with a whitelist sanitizer before persistence.

## 12. Sensitive Data

- PII fields (phone, email, national ID) are logged only as redacted (`ph***33`) in application logs.
- Audit logs may include PII but are not accessible via regular endpoints.
- Database backups must be encrypted at rest.
