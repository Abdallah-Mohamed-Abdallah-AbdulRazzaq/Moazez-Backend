# API Contract Rules

## Source of Truth

Frontend contract documents are the current source of truth for backend endpoint design.

## URL Versioning (Mandatory)

All API endpoints are prefixed with `/api/v1/`. No exceptions.

### What this means for existing contracts

The current contract documents (`sis_dashboard-*-backend_handoff_spec.md`, `student_*`, `teacher_*`, `parent_*`) use paths like `/api/admissions/applications`. These must be read as if they are prefixed with `/api/v1/`.

Example transformation:
- Contract says: `GET /api/admissions/applications`
- Actual implementation: `GET /api/v1/admissions/applications`

### Setup

NestJS global prefix + URI versioning:

```typescript
app.setGlobalPrefix('api/v1');
// or equivalently:
app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
app.setGlobalPrefix('api');
````

Use one of the two, not both.

### Breaking changes policy

* Breaking changes to `/api/v1/*` are forbidden after a path is shipped.
* Breaking changes require a new `/api/v2/*` namespace.
* `/api/v1/*` is supported for at least 12 months after `v2` GA.

## Contract Types

### Adapter-backed

These paths already exist in frontend adapters and must be implemented exactly as documented.

### Service-derived

These are inferred contracts and should be implemented as documented unless an explicit decision changes them.

## Response Rules

Supported success shapes:

* raw JSON
* `{ data: ... }`

Supported failure shape:

* `{ error: string, message?: string }`

## General Conventions

* use bearer auth
* use UUIDs
* use ISO date strings
* use JSON for standard requests
* use multipart/form-data for uploads
* return arrays directly for V1 when contracts expect arrays
* avoid forced pagination unless necessary for stability

## Stability Rules

Do not change:

* adapter-backed base paths
* adapter-backed HTTP methods
* response property names expected by the frontend
  without an explicit approved change.

## Aggregation Rule

When frontend expects nested cards or screen-specific structures:

* compose them in the application/presenter layer
* do not denormalize the database just to match UI shape

## Scope Rule

Endpoints must resolve the proper scope when relevant:

* academicYearId
* yearId
* termId
* schoolId
* sectionId
* classroomId
* studentId
* teacherId

## Upload Rule

Uploads must:

* validate file type
* validate file size
* store externally
* save metadata internally