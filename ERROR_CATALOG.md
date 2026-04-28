# Error Catalog

This is the authoritative registry of error codes and response shapes used by the Moazez backend.

## 1. Error Envelope

All error responses follow this shape:

```json
{
  "error": {
    "code": "iam.role.in_use",
    "message": "Role cannot be deleted because users are assigned to it.",
    "details": { "roleId": "role-uuid", "userCount": 3 },
    "traceId": "01HQK..."
  }
}
```

- `code` — stable machine identifier. Never translated.
- `message` — human-readable, translated via `Accept-Language`.
- `details` — optional structured context.
- `traceId` — correlation id for debugging (present in all 5xx, optional in 4xx).

## 2. HTTP Status Mapping

| Status | Meaning               | When to use                                     |
| ------ | --------------------- | ----------------------------------------------- |
| 400    | Bad Request           | Malformed input, validation failure             |
| 401    | Unauthorized          | No token, expired token, invalid token          |
| 403    | Forbidden             | Authenticated but lacks permission or scope     |
| 404    | Not Found             | Resource does not exist or is outside scope     |
| 409    | Conflict              | State conflict (duplicate, in-use, already submitted) |
| 410    | Gone                  | Resource existed but was deleted permanently    |
| 413    | Payload Too Large     | Upload exceeds limit                            |
| 415    | Unsupported Media Type| File mime not allowed                           |
| 422    | Unprocessable Entity  | Semantic validation failure                     |
| 429    | Too Many Requests     | Rate limit exceeded                             |
| 500    | Internal Server Error | Unhandled or unexpected                         |

## 3. Code Naming Convention

`<module>.<resource>.<problem>` in snake_case.

Cross-cutting codes may omit the module segment (e.g., `validation.failed`, `rate_limit.exceeded`).

## 4. Canonical V1 Error Codes

### Auth

| Code                        | HTTP | Message                                    |
| --------------------------- | ---- | ------------------------------------------ |
| `auth.credentials.invalid`  | 401  | Invalid email or password                  |
| `auth.token.expired`        | 401  | Access token expired                       |
| `auth.token.invalid`        | 401  | Invalid or malformed token                 |
| `auth.session.revoked`      | 401  | Session has been revoked                   |
| `auth.account.disabled`     | 403  | Account is disabled                        |
| `auth.scope.missing`        | 403  | Active scope is required for this action   |
| `auth.refresh.rotated`      | 401  | Refresh token already rotated              |

### IAM

| Code                             | HTTP | Message                                                 |
| -------------------------------- | ---- | ------------------------------------------------------- |
| `iam.role.in_use`                | 409  | Role cannot be deleted because users are assigned to it |
| `iam.role.system_cannot_delete`  | 403  | System roles cannot be deleted                          |
| `iam.role.system_cannot_modify`  | 403  | System roles cannot be modified                         |
| `iam.role.name_taken`            | 409  | A role with this name already exists in this school     |
| `iam.user.email_taken`           | 409  | A user with this email already exists                   |
| `iam.user.not_invitable`         | 409  | User cannot be re-invited in the current state          |
| `iam.permission.unknown`         | 400  | Unknown permission code                                 |
| `iam.membership.teacher_conflict`| 409  | Teacher already has an active membership at another school |

### Admissions

| Code                                     | HTTP | Message                                           |
| ---------------------------------------- | ---- | ------------------------------------------------- |
| `admissions.application.already_decided` | 409  | Application already has a decision                |
| `admissions.application.not_accepted`    | 409  | Cannot enroll a non-accepted application          |
| `admissions.document.missing_required`   | 422  | Required admission documents are missing          |
| `admissions.test.already_scheduled`      | 409  | Test already scheduled for this application       |
| `admissions.decision.requires_all_steps` | 422  | Tests and interviews must be completed first      |

### Students

| Code                                         | HTTP | Message                                          |
| -------------------------------------------- | ---- | ------------------------------------------------ |
| `students.enrollment.placement_conflict`     | 409  | Classroom capacity exceeded or placement conflict |
| `students.enrollment.inactive_year`          | 422  | Academic year is not active                      |
| `students.enrollment.already_withdrawn`      | 409  | Student is already withdrawn                     |
| `students.guardian.primary_required`         | 422  | At least one primary guardian is required        |

### Academics

| Code                              | HTTP | Message                                          |
| --------------------------------- | ---- | ------------------------------------------------ |
| `academics.year.overlapping`      | 409  | Academic year dates overlap with an existing year |
| `academics.year.has_enrollments`  | 409  | Cannot delete year with active enrollments       |
| `academics.structure.child_exists`| 409  | Cannot delete a structure node with children     |
| `academics.section.capacity_invalid`| 422| Invalid section capacity                         |

### Attendance

| Code                                       | HTTP | Message                                         |
| ------------------------------------------ | ---- | ----------------------------------------------- |
| `attendance.session.already_submitted`     | 409  | Session is already submitted                    |
| `attendance.session.not_submitted`         | 409  | Session is not submitted                        |
| `attendance.policy.conflict`               | 409  | An active policy already exists for this scope  |
| `attendance.entry.requires_excuse_attachment` | 422 | This policy requires an attachment for excuses |
| `attendance.session.outside_term`          | 422  | Date is outside the active term                 |
| `attendance.excuse.invalid_date_range`     | 422  | Invalid attendance excuse date range            |
| `attendance.excuse.already_reviewed`       | 409  | Attendance excuse request is already reviewed   |
| `attendance.excuse.invalid_minutes`        | 422  | Invalid attendance excuse minutes               |
| `attendance.excuse.invalid_period_selection` | 422 | Invalid attendance excuse period selection     |

### Grades

| Code                               | HTTP | Message                                        |
| ---------------------------------- | ---- | ---------------------------------------------- |
| `grades.assessment.locked`         | 409  | Assessment is locked                           |
| `grades.assessment.not_published`  | 409  | Assessment must be published first             |
| `grades.assessment.not_approved`   | 409  | Assessment must be approved first              |
| `grades.assessment.already_published` | 409 | Assessment is already published              |
| `grades.assessment.already_approved` | 409 | Assessment is already approved                |
| `grades.assessment.already_locked` | 409  | Assessment is already locked                   |
| `grades.assessment.invalid_scope`  | 422  | Assessment scope is invalid                    |
| `grades.assessment.invalid_status_transition` | 409 | Assessment status transition is invalid |
| `grades.term.closed`               | 409  | Term is closed for grade modifications         |
| `grades.item.out_of_range`         | 422  | Score is out of the allowed range              |
| `grades.rule.conflict`             | 409  | A grading rule already exists for this scope   |
| `grades.gradebook.no_enrollment`   | 422  | Student has no enrollment for this gradebook context |
| `grades.question.points_mismatch`  | 422  | Total question points do not match assessment total |
| `grades.question.structure_locked` | 409  | Question structure cannot be changed           |
| `grades.question.last_question`    | 409  | Assessment must keep at least one question     |
| `grades.answer.invalid_question`   | 422  | Answer references an invalid question          |
| `grades.answer.invalid_option`     | 422  | Answer references an invalid option            |
| `grades.submission.already_submitted` | 409 | Submission is already submitted              |
| `grades.submission.not_submitted`  | 409  | Submission must be submitted first             |
| `grades.submission.locked`         | 409  | Submission cannot be changed                   |
| `grades.review.already_finalized`  | 409  | Review is already finalized                    |
| `grades.review.pending_answers`    | 409  | Review still has pending answers               |

### Reinforcement

| Code                                 | HTTP | Message                                    |
| ------------------------------------ | ---- | ------------------------------------------ |
| `reinforcement.task.invalid_scope`   | 422  | Reinforcement task target scope is invalid |
| `reinforcement.task.duplicate_target`| 409  | Reinforcement task target is duplicated    |
| `reinforcement.task.cancelled`       | 409  | Reinforcement task is cancelled            |
| `reinforcement.submission.already_submitted` | 409 | Submission is already submitted       |
| `reinforcement.review.not_submitted` | 409  | Submission must be submitted before review |
| `reinforcement.policy.conflict`      | 409  | An active XP policy already exists for this scope |
| `reinforcement.xp.duplicate_source`  | 409  | XP has already been granted for this source |
| `reinforcement.xp.daily_cap_reached` | 429  | Daily XP cap reached for this teacher      |
| `reinforcement.xp.cooldown`          | 429  | XP cooldown in effect for this student     |
| `reinforcement.review.already_reviewed` | 409 | Submission is already reviewed           |

### Files

| Code                          | HTTP | Message                              |
| ----------------------------- | ---- | ------------------------------------ |
| `files.upload.size_exceeded`  | 413  | File size exceeds allowed limit      |
| `files.upload.mime_not_allowed`| 415 | File type is not allowed             |
| `files.not_found`             | 404  | File not found or not accessible     |

### Communication

| Code                                      | HTTP | Message                           |
| ----------------------------------------- | ---- | --------------------------------- |
| `communication.conversation.not_member`   | 403  | Not a member of this conversation |
| `communication.message.too_long`          | 422  | Message exceeds maximum length    |

### Cross-cutting

| Code                  | HTTP | Message                                               |
| --------------------- | ---- | ----------------------------------------------------- |
| `validation.failed`   | 400  | Request validation failed (see details for fields)    |
| `rate_limit.exceeded` | 429  | Too many requests                                     |
| `not_found`           | 404  | Resource not found                                    |
| `internal_error`      | 500  | An unexpected error occurred                          |

## 5. Internationalization

- `message` field is in English by default.
- Clients requesting AR should pass `Accept-Language: ar`; the API returns the Arabic version if available.
- All error messages have AR and EN translations in `src/common/i18n/errors.{ar,en}.json`.
- The `code` field never translates.

## 6. Adding a New Error Code

1. Add entry to this file.
2. Add AR and EN translations to `src/common/i18n/errors.{ar,en}.json`.
3. Add the error class to `src/common/exceptions/domain-exception.ts`.
4. Throw it from the service; the global exception filter formats the response.
5. Add a unit test that verifies the correct code is thrown.
