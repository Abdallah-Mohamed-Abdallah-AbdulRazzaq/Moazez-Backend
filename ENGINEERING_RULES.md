# Engineering Rules

## Core Rules

1. No business logic in controllers.
2. No direct Prisma usage in controllers.
3. No local file storage in production.
4. No schema changes outside migrations.
5. No out-of-scope implementation without approval.
6. No breaking adapter-backed API contracts.
7. No microservices in V1.
8. No bypassing authorization and scope checks.

## Database Rules

- PostgreSQL is the source of persistence truth.
- Prisma is the primary access layer.
- Raw SQL is allowed when needed for advanced database behavior.
- Keep storage normalized.
- Build response aggregation in services/presenters.
- Use UUIDs.
- Use ISO dates and timestamps.
- Keep auditability in mind for all critical actions.

## File Rules

- Files are uploaded to object storage.
- Database stores file metadata only.
- Access to private files must be authorized.
- Use signed URLs when appropriate.

## API Rules

- Use DTOs for input and output contracts.
- Use consistent response shapes.
- Use clear module boundaries.
- Keep adapter-backed paths stable.

## Security Rules

- Always resolve current actor and scope.
- Validate school/organization ownership.
- Guard sensitive endpoints.
- Rate limit auth-sensitive routes.
- Log security-sensitive changes.

## Testing Rules

- Add tests for critical business flows.
- Prioritize:
  - auth
  - permissions
  - admissions
  - enrollments
  - attendance
  - grades
  - reinforcement approvals

## Logging Rules

Use structured logs for:
- request context
- actor id
- organization id
- school id
- module
- action
- outcome

## Background Jobs

Use queues for:
- notifications
- emails
- sms
- exports
- imports
- heavy reports
- cleanup jobs