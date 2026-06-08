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
| `iam.user.username_taken`        | 409  | Username is already taken                               |
| `iam.user.username_invalid`      | 422  | Username is invalid                                     |
| `iam.user.login_domain_missing`  | 422  | School login domain is not configured                   |
| `iam.user.login_domain_invalid`  | 422  | Login domain is invalid                                 |
| `iam.user.login_email_taken`     | 409  | Generated login email is already taken                  |
| `iam.user.contact_email_invalid` | 400  | Contact email is invalid                                |
| `iam.user.not_invitable`         | 409  | User cannot be re-invited in the current state          |
| `iam.permission.unknown`         | 400  | Unknown permission code                                 |
| `iam.membership.teacher_conflict`| 409  | Teacher already has an active membership at another school |
| `iam.credentials.password_policy_failed` | 422 | Password does not meet credential policy       |
| `iam.credentials.missing_password` | 409 | User does not have a password credential                |
| `iam.credentials.already_set`    | 409  | User credentials are already set                         |
| `iam.credentials.bulk_too_large` | 422  | Credential bulk operation is too large                   |
| `iam.credentials.no_eligible_users` | 422 | No eligible users matched the credential operation     |
| `iam.credentials.current_password_invalid` | 401 | Current password is invalid                     |
| `iam.credentials.user_not_manageable` | 409 | User credentials cannot be managed in the current state |
| `iam.credentials.temporary_password_unavailable` | 409 | Temporary password is unavailable             |

### Platform Admin

| Code                                             | HTTP | Message                                            |
| ------------------------------------------------ | ---- | -------------------------------------------------- |
| `platform.organization.not_found`                | 404  | Organization was not found                         |
| `platform.organization.slug_taken`               | 409  | Organization slug is already taken                 |
| `platform.organization.invalid_status_transition`| 409  | Organization status transition is invalid          |
| `platform.organization.archived`                 | 409  | Organization is archived                           |
| `platform.school.not_found`                      | 404  | School was not found                               |
| `platform.school.slug_taken`                     | 409  | School slug is already taken in this organization  |
| `platform.school.invalid_status_transition`      | 409  | School status transition is invalid                |
| `platform.school.archived`                       | 409  | School is archived                                 |
| `platform.school_provisioning.invalid_organization_mode` | 422  | School provisioning organization mode is invalid |
| `platform.school_provisioning.organization_required` | 422  | School provisioning organization data is required |
| `platform.school_provisioning.login_domain_taken` | 409  | Login domain is already configured for another school |
| `platform.school_provisioning.login_domain_invalid` | 422  | Login domain is invalid |
| `platform.school_provisioning.primary_admin_login_taken` | 409  | Primary admin login email is already taken |
| `platform.school_provisioning.school_admin_role_missing` | 422  | School admin role is missing |

### Settings

| Code                                     | HTTP | Message                                           |
| ---------------------------------------- | ---- | ------------------------------------------------- |
| `settings.login_identity.not_configured` | 404  | School login identity settings are not configured |
| `settings.login_identity.domain_invalid` | 422  | Login identity domain is invalid                  |
| `settings.email.connection_missing`      | 404  | School email connection is not configured         |
| `settings.email.connection_not_verified` | 409  | School email connection must be verified first    |
| `settings.email.connection_test_failed`  | 422  | School email connection test failed               |
| `settings.email.secret_encryption_failed`| 500  | School email secret encryption failed             |
| `settings.email.template_invalid`        | 422  | School email template is invalid                  |
| `settings.email.delivery_connection_inactive` | 409 | School email delivery connection is not active |
| `settings.email.delivery_template_missing` | 404 | School email delivery template is missing or inactive |
| `settings.email.delivery_no_recipients`  | 422  | No eligible email delivery recipients were found  |
| `settings.email.delivery_batch_not_found`| 404  | Email delivery batch was not found                |
| `settings.email.delivery_batch_not_cancelable` | 409 | Email delivery batch cannot be cancelled in its current state |
| `settings.email.delivery_too_many_recipients` | 422 | Email delivery recipient limit exceeded      |
| `settings.email.delivery_recipient_invalid` | 422 | Email delivery recipient is invalid            |
| `settings.email.delivery_send_failed`    | 422  | Email delivery send failed                        |
| `settings.email.campaign_invalid`        | 422  | School email campaign is invalid                  |
| `settings.email.campaign_credential_variables_forbidden` | 422 | Credential variables are not allowed in general email campaigns |

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
| `students.account.already_linked`            | 409  | Student account is already linked                |
| `students.account.user_already_linked`       | 409  | User is already linked to another account        |
| `students.account.user_type_mismatch`        | 422  | User type does not match the requested account link |
| `students.account.student_role_missing`      | 422  | Student role is missing or invalid               |
| `students.account.parent_role_missing`       | 422  | Parent role is missing or invalid                |
| `students.guardian.account_already_linked`   | 409  | Guardian account is already linked               |

### Academics

| Code                              | HTTP | Message                                          |
| --------------------------------- | ---- | ------------------------------------------------ |
| `academics.year.overlapping`      | 409  | Academic year dates overlap with an existing year |
| `academics.year.has_enrollments`  | 409  | Cannot delete year with active enrollments       |
| `academics.structure.child_exists`| 409  | Cannot delete a structure node with children     |
| `academics.section.capacity_invalid`| 422| Invalid section capacity                         |
| `academics.timetable.config_not_found` | 404 | Timetable config was not found or is outside scope |
| `academics.timetable.period_not_found` | 404 | Timetable period was not found or is outside scope |
| `academics.timetable.entry_not_found` | 404 | Timetable entry was not found or is outside scope |
| `academics.timetable.invalid_day` | 422 | Timetable entry day is not active for this config |
| `academics.timetable.period_not_in_config` | 422 | Timetable period does not belong to this config |
| `academics.timetable.classroom_not_found` | 404 | Timetable classroom was not found or is outside scope |
| `academics.timetable.classroom_scope_mismatch` | 422 | Classroom is outside this timetable config scope |
| `academics.timetable.allocation_not_found` | 404 | Timetable teacher allocation was not found or is outside scope |
| `academics.timetable.allocation_mismatch` | 422 | Teacher allocation does not match this timetable entry |
| `academics.timetable.room_not_found` | 404 | Timetable room was not found or is outside scope |
| `academics.timetable.entry_not_mutable` | 409 | Timetable entry cannot be changed in its current state |
| `academics.timetable.invalid_time_range` | 422 | Timetable period time range is invalid         |
| `academics.timetable.period_overlap` | 409 | Timetable period overlaps another period        |
| `academics.timetable.period_index_taken` | 409 | Timetable period index is already taken      |
| `academics.timetable.period_in_use` | 409 | Timetable period is used by timetable entries   |
| `academics.timetable.closed_term` | 409 | Term is closed for timetable changes             |
| `academics.timetable.published_locked` | 409 | Published timetable config cannot be changed directly |
| `academics.timetable.publish_blocked` | 409 | Timetable publish is blocked by validation failures |
| `academics.timetable.no_periods` | 409 | Timetable config must include at least one instructional period |
| `academics.timetable.no_entries` | 409 | Timetable config must include at least one timetable entry |
| `academics.timetable.not_draft` | 409 | Only draft timetable configs can be published |
| `academics.timetable.publication_not_found` | 404 | Timetable publication was not found or is outside scope |
| `academics.timetable.entry_conflict` | 409 | Timetable entry has a scheduling conflict       |
| `academics.timetable.teacher_conflict` | 409 | Teacher is already scheduled in this period   |
| `academics.timetable.room_conflict` | 409 | Room is already scheduled in this period       |
| `academics.curriculum.not_found` | 404 | Curriculum was not found or is outside scope |
| `academics.curriculum.duplicate` | 409 | Curriculum already exists for this academic scope |
| `academics.curriculum.invalid_scope` | 422 | Curriculum academic scope is invalid |
| `academics.curriculum.read_only` | 409 | Curriculum is read-only in its current state |
| `academics.curriculum.activation_incomplete` | 409 | Curriculum must include at least one unit and lesson before activation |
| `academics.curriculum.unit_not_found` | 404 | Curriculum unit was not found or is outside scope |
| `academics.curriculum.lesson_not_found` | 404 | Curriculum lesson was not found or is outside scope |
| `academics.curriculum.invalid_reorder` | 422 | Curriculum reorder target is invalid |
| `academics.lesson_content.not_found` | 404 | Lesson content item was not found or is outside scope |
| `academics.lesson_content.invalid_scope` | 422 | Lesson content scope is invalid |
| `academics.lesson_content.invalid_type_payload` | 422 | Lesson content payload does not match its type |
| `academics.lesson_content.invalid_url` | 422 | Lesson content URL is invalid or unsafe |
| `academics.lesson_content.file_not_found` | 404 | Lesson content file was not found or is outside scope |
| `academics.lesson_content.read_only` | 409 | Lesson content cannot be changed for an archived curriculum |
| `academics.lesson_plan.not_found` | 404 | Lesson plan was not found or is outside scope |
| `academics.lesson_plan.duplicate` | 409 | A lesson plan already exists for this teacher allocation and week |
| `academics.lesson_plan.invalid_scope` | 422 | Lesson plan academic scope is invalid |
| `academics.lesson_plan.read_only` | 409 | Lesson plan is read-only in its current state |
| `academics.lesson_plan.invalid_transition` | 409 | Lesson plan status transition is invalid |
| `academics.lesson_plan.item_not_found` | 404 | Lesson plan item was not found or is outside scope |
| `academics.lesson_plan.invalid_item_scope` | 422 | Lesson plan item scope is invalid |
| `academics.lesson_plan.item_invalid_transition` | 409 | Lesson plan item status transition is invalid |

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

### Homework

| Code                                      | HTTP | Message                                      |
| ----------------------------------------- | ---- | -------------------------------------------- |
| `homework.assignment.not_found`           | 404  | Homework assignment was not found            |
| `homework.assignment.not_mutable`         | 409  | Homework assignment cannot be changed        |
| `homework.assignment.not_publishable`     | 422  | Homework assignment cannot be published      |
| `homework.assignment.already_published`   | 409  | Homework assignment is already published     |
| `homework.assignment.already_closed`      | 409  | Homework assignment is already closed        |
| `homework.assignment.cancelled`           | 409  | Homework assignment is cancelled             |
| `homework.assignment.schedule_mismatch`   | 422  | Homework schedule context is invalid         |
| `homework.assignment.allocation_mismatch` | 422  | Homework allocation context is invalid       |
| `homework.assignment.due_date_invalid`    | 422  | Homework due date is invalid                 |
| `homework.assignment.target_required`     | 422  | Homework target selection is required        |
| `homework.assignment.no_eligible_targets` | 422  | Homework has no eligible targets             |
| `homework.assignment.target_conflict`     | 409  | Homework target selection is invalid         |
| `homework.assignment.validation_failed`   | 422  | Homework assignment validation failed        |
| `homework.assignment.invalid_question_structure` | 422 | Homework assignment question structure is invalid |
| `homework.question.not_found`             | 404  | Homework question was not found              |
| `homework.question.invalid_type_payload`  | 422  | Homework question payload does not match its type |
| `homework.question.invalid_options`       | 422  | Homework question options are invalid        |
| `homework.question.read_only`             | 409  | Homework question cannot be changed for this assignment |
| `homework.question.option_not_found`      | 404  | Homework question option was not found       |
| `homework.question.invalid_reorder`       | 422  | Homework question reorder target is invalid  |
| `homework.attachment.not_found`           | 404  | Homework assignment attachment was not found |
| `homework.attachment.file_not_found`      | 404  | Homework attachment file was not found       |
| `homework.attachment.read_only`           | 409  | Homework attachment cannot be changed for this assignment |
| `homework.attachment.invalid_reorder`     | 422  | Homework attachment reorder target is invalid |
| `homework.answer.not_found`               | 404  | Homework answer was not found                |
| `homework.answer.invalid_payload`         | 422  | Homework answer payload is invalid           |
| `homework.answer.invalid_option`          | 422  | Homework answer option is invalid            |
| `homework.answer.missing_required`        | 422  | Required homework answer is missing          |
| `homework.answer.read_only`               | 409  | Homework answer cannot be changed in this submission state |
| `homework.answer.invalid_submission_scope` | 404 | Homework answer submission scope was not found |
| `homework.answer_review.not_found` | 404 | Homework answer review target was not found |
| `homework.answer_review.invalid_scope` | 404 | Homework answer review scope is invalid |
| `homework.answer_review.not_submitted` | 409 | Homework answer cannot be reviewed before submission |
| `homework.answer_review.invalid_points` | 422 | Homework answer review points are invalid |
| `homework.answer_review.exceeds_question_points` | 422 | Homework answer review points exceed question points |
| `homework.answer_review.exceeds_assignment_marks` | 422 | Homework answer review total exceeds assignment marks |
| `homework.answer_review.read_only` | 409 | Homework answer review is read-only in this submission state |
| `homework.answer_review.incomplete_required_answers` | 422 | Required homework answers are not fully reviewed |
| `homework.grade_sync.not_linked` | 409 | Homework assignment is not linked to a grade assessment |
| `homework.grade_sync.invalid_assessment` | 422 | Grade assessment is not compatible with homework sync |
| `homework.grade_sync.incompatible_scope` | 422 | Grade assessment scope is incompatible with homework |
| `homework.grade_sync.assessment_locked` | 409 | Grade assessment is locked for homework sync |
| `homework.grade_sync.submission_not_reviewed` | 409 | Homework submission is not reviewed for grade sync |
| `homework.grade_sync.missing_score` | 422 | Reviewed homework submission has no awarded marks |
| `homework.grade_sync.score_exceeds_homework_marks` | 422 | Homework score exceeds homework total marks |
| `homework.grade_sync.score_exceeds_assessment_marks` | 422 | Homework score exceeds grade assessment marks |
| `homework.grade_sync.duplicate_link` | 409 | Homework assignment already has a grade assessment link |
| `homework.grade_sync.unlink_not_allowed` | 409 | Homework grade assessment link cannot be removed safely |
| `homework.grade_sync.failed` | 409 | Homework grade sync failed |
| `homework.submission_attachment.not_found` | 404 | Homework submission attachment was not found |
| `homework.submission_attachment.file_not_found` | 404 | Homework submission attachment file was not found |
| `homework.submission_attachment.read_only` | 409 | Homework submission attachment cannot be changed in this submission state |
| `homework.submission_attachment.invalid_reorder` | 422 | Homework submission attachment reorder target is invalid |
| `homework.submission.target_not_found`    | 404  | Homework submission target was not found     |
| `homework.submission.not_found`           | 404  | Homework submission was not found            |
| `homework.submission.not_submittable`     | 409  | Homework submission is not allowed in the current state |
| `homework.submission.already_submitted`   | 409  | Homework submission is already submitted     |
| `homework.submission.not_reviewable`      | 409  | Homework submission cannot be reviewed in the current state |
| `homework.submission.already_reviewed`    | 409  | Homework submission is already reviewed      |
| `homework.submission.review_invalid`      | 422  | Homework submission review is invalid        |

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
| `reinforcement.hero.mission.invalid_status_transition` | 409 | Hero mission status transition is invalid |
| `reinforcement.hero.mission.not_published` | 409 | Hero mission must be published first |
| `reinforcement.hero.mission.archived` | 409 | Hero mission is archived |
| `reinforcement.hero.mission.points_invalid` | 422 | Hero mission XP points are invalid |
| `reinforcement.hero.objective.invalid_order` | 422 | Hero mission objective order is invalid |
| `reinforcement.hero.progress.already_completed` | 409 | Hero mission progress is already completed |
| `reinforcement.hero.progress.objective_not_completed` | 409 | Required Hero mission objective is not completed |
| `reinforcement.hero.badge.duplicate_slug` | 409 | A Hero badge with this slug already exists |
| `reinforcement.hero.xp.duplicate_grant` | 409 | Hero mission XP has already been granted |
| `reinforcement.reward.invalid_status_transition` | 409 | Reward status transition is invalid |
| `reinforcement.reward.not_published` | 409 | Reward catalog item must be published first |
| `reinforcement.reward.archived` | 409 | Reward catalog item is archived |
| `reinforcement.reward.out_of_stock` | 409 | Reward catalog item is out of stock |
| `reinforcement.reward.insufficient_xp` | 422 | Student does not meet the XP eligibility requirement |
| `reinforcement.reward.duplicate_redemption` | 409 | Student already has an open redemption for this reward |
| `reinforcement.redemption.not_requested` | 409 | Reward redemption must be requested first |
| `reinforcement.redemption.not_approved` | 409 | Reward redemption must be approved first |
| `reinforcement.redemption.terminal` | 409 | Reward redemption is already in a terminal state |
| `reinforcement.redemption.invalid_source` | 422 | Reward redemption request source is invalid |

### Behavior

| Code                                             | HTTP | Message                                                |
| ------------------------------------------------ | ---- | ------------------------------------------------------ |
| `behavior.category.in_use`                       | 409  | Behavior category is in use                            |
| `behavior.category.inactive`                     | 409  | Behavior category is inactive                          |
| `behavior.record.invalid_status_transition`      | 409  | Behavior record status transition is invalid           |
| `behavior.record.already_submitted`              | 409  | Behavior record is already submitted                   |
| `behavior.record.not_submitted`                  | 409  | Behavior record must be submitted first                |
| `behavior.record.already_reviewed`               | 409  | Behavior record is already reviewed                    |
| `behavior.record.not_approved`                   | 409  | Behavior record must be approved first                 |
| `behavior.record.cancelled`                      | 409  | Behavior record is cancelled                           |
| `behavior.record.points_invalid`                 | 422  | Behavior record points are invalid                     |
| `behavior.record.type_mismatch`                  | 422  | Behavior record type does not match its category       |
| `behavior.record.outside_term`                   | 422  | Behavior record date is outside the selected term      |
| `behavior.points.duplicate_source`               | 409  | Behavior points have already been recorded for source  |
| `behavior.scope.invalid`                         | 422  | Behavior scope is invalid                              |

### Files

| Code                          | HTTP | Message                              |
| ----------------------------- | ---- | ------------------------------------ |
| `files.upload.size_exceeded`  | 413  | File size exceeds allowed limit      |
| `files.upload.mime_not_allowed`| 415 | File type is not allowed             |
| `files.not_found`             | 404  | File not found or not accessible     |

### Communication

| Code                                                 | HTTP | Message                                           |
| ---------------------------------------------------- | ---- | ------------------------------------------------- |
| `communication.policy.disabled`                      | 403  | Communication policy is disabled                  |
| `communication.policy.not_configured`                | 404  | Communication policy is not configured            |
| `communication.policy.invalid`                       | 422  | Communication policy is invalid                   |
| `communication.conversation.not_member`              | 403  | Not a member of this conversation                 |
| `communication.conversation.archived`                | 409  | Conversation is archived                          |
| `communication.conversation.closed`                  | 409  | Conversation is closed                            |
| `communication.conversation.invalid_type`            | 422  | Conversation type is invalid                      |
| `communication.conversation.direct_duplicate`        | 409  | Direct conversation already exists                |
| `communication.conversation.group_limit_exceeded`    | 409  | Conversation group member limit is exceeded       |
| `communication.participant.already_exists`           | 409  | Participant already exists in this conversation   |
| `communication.participant.not_found`                | 404  | Participant was not found                         |
| `communication.participant.limit_exceeded`           | 409  | Participant limit is exceeded                     |
| `communication.participant.role_forbidden`           | 403  | Participant role is not allowed                   |
| `communication.participant.cannot_remove_owner`      | 409  | Conversation owner cannot be removed              |
| `communication.participant.not_active`               | 409  | Participant is not active                         |
| `communication.invite.invalid_status`                | 409  | Invite status transition is invalid               |
| `communication.invite.duplicate_pending`             | 409  | A pending invite already exists                   |
| `communication.join_request.invalid_status`          | 409  | Join request status transition is invalid         |
| `communication.join_request.duplicate_pending`       | 409  | A pending join request already exists             |
| `communication.message.empty`                        | 422  | Message cannot be empty                           |
| `communication.message.too_long`                     | 422  | Message exceeds maximum length                    |
| `communication.message.hidden`                       | 409  | Message is hidden                                 |
| `communication.message.deleted`                      | 409  | Message is deleted                                |
| `communication.message.not_editable`                 | 409  | Message cannot be edited                          |
| `communication.message.not_sender`                   | 403  | Only the sender can perform this message action   |
| `communication.message.send_forbidden`               | 403  | Sending messages is not allowed                   |
| `communication.message.kind_invalid`                 | 422  | Message kind is invalid                           |
| `communication.receipt.invalid_recipient`            | 422  | Receipt recipient is invalid                      |
| `communication.reaction.duplicate`                   | 409  | Reaction already exists                           |
| `communication.attachment.not_allowed`               | 403  | Attachments are not allowed                       |
| `communication.attachment.invalid_file`              | 422  | Attachment file is invalid                        |
| `communication.report.duplicate`                     | 409  | Message report already exists                     |
| `communication.report.invalid_status`                | 409  | Report status transition is invalid               |
| `communication.moderation.forbidden`                 | 403  | Moderation action is not allowed                  |
| `communication.user.blocked`                         | 403  | User is blocked                                   |
| `communication.user.restricted`                      | 403  | User is restricted                                |
| `communication.user.restriction_conflict`            | 409  | User restriction conflicts with an active state   |
| `communication.scope.invalid`                        | 422  | Communication scope is invalid                    |

### Teacher App

| Code                                      | HTTP | Message                                           |
| ----------------------------------------- | ---- | ------------------------------------------------- |
| `teacher_app.actor.required_teacher`      | 403  | Teacher App requires an active teacher membership |
| `teacher_app.allocation.not_found`        | 404  | Teacher App class allocation was not found        |
| `teacher_app.allocation.forbidden`        | 403  | Teacher does not own this class allocation        |

### Student App

| Code                                      | HTTP | Message                                          |
| ----------------------------------------- | ---- | ------------------------------------------------ |
| `student_app.actor.required_student`      | 403  | Student App requires an active student membership |
| `student_app.student.not_found`           | 404  | Student App student was not found                |
| `student_app.enrollment.not_found`        | 404  | Student App active enrollment was not found      |
| `student_app.classroom.not_found`         | 404  | Student App classroom was not found              |

### Parent App

| Code                                      | HTTP | Message                                         |
| ----------------------------------------- | ---- | ----------------------------------------------- |
| `parent_app.actor.required_parent`        | 403  | Parent App requires an active parent membership |
| `parent_app.guardian.not_found`           | 404  | Parent App guardian was not found               |
| `parent_app.child.not_found`              | 404  | Parent App child was not found                  |
| `parent_app.enrollment.not_found`         | 404  | Parent App active enrollment was not found      |
| `parent_app.classroom.not_found`          | 404  | Parent App classroom was not found              |

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
