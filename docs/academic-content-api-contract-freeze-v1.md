# Academic Content V1 API contract freeze

Verified against authoritative base `ed8c48ab7acb682e9dd66bdec97b4c63dff123bd` and the ACC-12 feature changes. Controller and request/response declarations are unchanged by OBS-02. This is Backend contract evidence; Student, Parent, Teacher and School frontend acceptance remains pending.

The complete inventory is 135 routes: 96 Academic Content, 30 app notification, 7 Core Communication notification and 2 generic file routes. Management analytics routes are absent. Their implementation is deferred for this execution; their final V1 disposition requires an explicit Owner decision. No analytics route is invented here.

## Cross-route contracts

All routes use `/api/v1`, real JWT/session authentication, server-resolved scope and declared permissions. Actor checks and domain ownership still apply when a grant exists. A DTO type is declared only where source supplies one; otherwise the resolved TypeScript return shape is explicitly source-inferred. Dates serialize as ISO strings and bigint counts/bytes use decimal strings where the source presenter says so.

Errors retain the GlobalExceptionFilter envelope: `error.code`, `error.message`, optional `error.details` and `traceId`. Authentication is 401, actor/scope/grant denial 403, strict DTO/UUID rejection 400 and concealed unavailable ownership 404 when the corresponding path applies. Listed profile conflicts apply only to the actual lifecycle/transaction path. Engagement/ACK admission emits 429 `rate_limit.exceeded` with `Retry-After: 60`; operational failures retain sanitized 503 `service_unavailable`. Analytics unexpected query failures retain the existing sanitized HTTP 500 `internal_error` envelope. None of these statuses is a blanket guarantee for every route.

Recipient detail uses immutable current Publication/Revision identity plus current enrollment/guardian authority, never historical audience as ACL. Explicit Engagement and ACK require the exact current `expectedPublicationId`; a stale identity returns concealed 404. GET/read/detail never records Engagement, acknowledges or infers attendance. ACK retries preserve the original durable identity/date. A successor creates a separate obligation and preserves predecessor history.

Teacher analytics requires both view and analytics-own grants, creator ownership and every immutable/current target's live allocation. Fixed ranges are 7d, 30d and 90d (default 30d); one database clock defines a UTC half-open window. Counts are nonnegative decimal strings, without student identities, denominator percentages or participation/comprehension claims. Small-cohort policy remains an Owner decision.

Private file access returns 307 and a short-lived provider capability only after current resource authorization. The source signs inline preview or attachment download with 15-minute default TTL; the capability is private and must not be persisted or logged. Upload capability expiry is persisted as a deadline; the signed upload URL is not persisted. Provider stat size/MIME and byte signature verification precede File/Asset creation. Browser-to-GCS resumable/CORS acceptance remains external DevOps evidence.

Caching, paging, versioning and idempotency below are endpoint-specific. Absence of an explicit Cache-Control decorator is recorded as absence, without inventing middleware behavior. Parameter and request DTO declarations are linked for frontend implementation; downstream application checks remain authoritative.

## Complete route inventory

### GET `/api/v1/academics/academic-content/settings/file-policy`

Source: [AcademicContentFilePolicyController.get](../src/modules/academics/academic-content/controller/academic-content-file-policy.controller.ts#L29). Actor: **SCHOOL_USER or ORGANIZATION_USER**. Success: **200**.

Permissions: `academics.academic_content.view`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-declared response: `Promise<AcademicContentFilePolicyResponseDto>`.

Ownership: SchoolManagementOnly plus server-resolved School/Organization and required permission; parent Content and all referenced academic resources must belong to that same active scope. Specialized management.analytics APIs are absent.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Authoring is mutable only in permitted lifecycle states; review captures exact Revision V2. Scheduling freezes an exact Revision/Targets; publication creates immutable historical audience. Revise cancels the predecessor and starts successor authoring, with no zero-downtime guarantee.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: GetAcademicContentFilePolicyUseCase.execute. [GetAcademicContentFilePolicyUseCase.execute](../src/modules/academics/academic-content/files/application/academic-content-file-policy.use-cases.ts#L17)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### PATCH `/api/v1/academics/academic-content/settings/file-policy`

Source: [AcademicContentFilePolicyController.update](../src/modules/academics/academic-content/controller/academic-content-file-policy.controller.ts#L39). Actor: **SCHOOL_USER or ORGANIZATION_USER**. Success: **200**.

Permissions: `academics.academic_content.settings.manage`.

Request: Body: `UpdateAcademicContentFilePolicyDto`. Source-declared response: `Promise<AcademicContentFilePolicyResponseDto>`.

Ownership: SchoolManagementOnly plus server-resolved School/Organization and required permission; parent Content and all referenced academic resources must belong to that same active scope. Specialized management.analytics APIs are absent.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Authoring is mutable only in permitted lifecycle states; review captures exact Revision V2. Scheduling freezes an exact Revision/Targets; publication creates immutable historical audience. Revise cancels the predecessor and starts successor authoring, with no zero-downtime guarantee.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: UpdateAcademicContentFilePolicyUseCase.execute. [UpdateAcademicContentFilePolicyUseCase.execute](../src/modules/academics/academic-content/files/application/academic-content-file-policy.use-cases.ts#L29)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### GET `/api/v1/academics/academic-content/settings/notification-policy`

Source: [AcademicContentNotificationPolicyController.get](../src/modules/academics/academic-content/controller/academic-content-notification-policy.controller.ts#L30). Actor: **SCHOOL_USER or ORGANIZATION_USER**. Success: **200**.

Permissions: `academics.academic_content.view`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-declared response: `Promise<AcademicContentNotificationPolicyResponseDto>`.

Ownership: SchoolManagementOnly plus server-resolved School/Organization and required permission; parent Content and all referenced academic resources must belong to that same active scope. Specialized management.analytics APIs are absent.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Authoring is mutable only in permitted lifecycle states; review captures exact Revision V2. Scheduling freezes an exact Revision/Targets; publication creates immutable historical audience. Revise cancels the predecessor and starts successor authoring, with no zero-downtime guarantee.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: GetAcademicContentNotificationPolicyUseCase.execute. [GetAcademicContentNotificationPolicyUseCase.execute](../src/modules/academics/academic-content/application/academic-content-notification-policy.use-cases.ts#L16)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### PATCH `/api/v1/academics/academic-content/settings/notification-policy`

Source: [AcademicContentNotificationPolicyController.update](../src/modules/academics/academic-content/controller/academic-content-notification-policy.controller.ts#L40). Actor: **SCHOOL_USER or ORGANIZATION_USER**. Success: **200**.

Permissions: `academics.academic_content.settings.manage`.

Request: Body: `UpdateAcademicContentNotificationPolicyDto`. Source-declared response: `Promise<AcademicContentNotificationPolicyResponseDto>`.

Ownership: SchoolManagementOnly plus server-resolved School/Organization and required permission; parent Content and all referenced academic resources must belong to that same active scope. Specialized management.analytics APIs are absent.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Authoring is mutable only in permitted lifecycle states; review captures exact Revision V2. Scheduling freezes an exact Revision/Targets; publication creates immutable historical audience. Revise cancels the predecessor and starts successor authoring, with no zero-downtime guarantee.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: UpdateAcademicContentNotificationPolicyUseCase.execute. [UpdateAcademicContentNotificationPolicyUseCase.execute](../src/modules/academics/academic-content/application/academic-content-notification-policy.use-cases.ts#L32)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### GET `/api/v1/academics/academic-content/templates/preparation`

Source: [AcademicContentPreparationTemplateController.list](../src/modules/academics/academic-content/controller/academic-content-preparation-template.controller.ts#L45). Actor: **SCHOOL_USER or ORGANIZATION_USER**. Success: **200**.

Permissions: `academics.academic_content.view`.

Request: Query: `ListAcademicContentPreparationTemplatesQueryDto`. Source-declared response: `{ type: AcademicContentPreparationTemplateListResponseDto }`.

Ownership: SchoolManagementOnly plus server-resolved School/Organization and required permission; parent Content and all referenced academic resources must belong to that same active scope. Specialized management.analytics APIs are absent.

Cache: no-store, private, max-age=0. Pagination: page default 1; limit default 50, maximum 100. Use the exact scoped repository ordering.

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Authoring is mutable only in permitted lifecycle states; review captures exact Revision V2. Scheduling freezes an exact Revision/Targets; publication creates immutable historical audience. Revise cancels the predecessor and starts successor authoring, with no zero-downtime guarantee.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: AcademicContentPreparationTemplateUseCases.list. [AcademicContentPreparationTemplateUseCases.list](../src/modules/academics/academic-content/application/academic-content-preparation-template.use-cases.ts#L57)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### GET `/api/v1/academics/academic-content/templates/preparation/:templateId`

Source: [AcademicContentPreparationTemplateController.detail](../src/modules/academics/academic-content/controller/academic-content-preparation-template.controller.ts#L54). Actor: **SCHOOL_USER or ORGANIZATION_USER**. Success: **200**.

Permissions: `academics.academic_content.view`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-declared response: `{ type: AcademicContentPreparationTemplateDetailDto }`.

Ownership: SchoolManagementOnly plus server-resolved School/Organization and required permission; parent Content and all referenced academic resources must belong to that same active scope. Specialized management.analytics APIs are absent.

Cache: no-store, private, max-age=0. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Authoring is mutable only in permitted lifecycle states; review captures exact Revision V2. Scheduling freezes an exact Revision/Targets; publication creates immutable historical audience. Revise cancels the predecessor and starts successor authoring, with no zero-downtime guarantee.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: AcademicContentPreparationTemplateUseCases.detail. [AcademicContentPreparationTemplateUseCases.detail](../src/modules/academics/academic-content/application/academic-content-preparation-template.use-cases.ts#L90)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### POST `/api/v1/academics/academic-content/templates/preparation`

Source: [AcademicContentPreparationTemplateController.create](../src/modules/academics/academic-content/controller/academic-content-preparation-template.controller.ts#L64). Actor: **SCHOOL_USER or ORGANIZATION_USER**. Success: **201**.

Permissions: `academics.academic_content.settings.manage`.

Request: Body: `CreateAcademicContentPreparationTemplateDto`. Source-declared response: `{ type: AcademicContentPreparationTemplateDetailDto }`.

Ownership: SchoolManagementOnly plus server-resolved School/Organization and required permission; parent Content and all referenced academic resources must belong to that same active scope. Specialized management.analytics APIs are absent.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Authoring is mutable only in permitted lifecycle states; review captures exact Revision V2. Scheduling freezes an exact Revision/Targets; publication creates immutable historical audience. Revise cancels the predecessor and starts successor authoring, with no zero-downtime guarantee.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: AcademicContentPreparationTemplateUseCases.create. [AcademicContentPreparationTemplateUseCases.create](../src/modules/academics/academic-content/application/academic-content-preparation-template.use-cases.ts#L97)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### PATCH `/api/v1/academics/academic-content/templates/preparation/:templateId`

Source: [AcademicContentPreparationTemplateController.update](../src/modules/academics/academic-content/controller/academic-content-preparation-template.controller.ts#L73). Actor: **SCHOOL_USER or ORGANIZATION_USER**. Success: **200**.

Permissions: `academics.academic_content.settings.manage`.

Request: Body: `UpdateAcademicContentPreparationTemplateDto`. Source-declared response: `{ type: AcademicContentPreparationTemplateDetailDto }`.

Ownership: SchoolManagementOnly plus server-resolved School/Organization and required permission; parent Content and all referenced academic resources must belong to that same active scope. Specialized management.analytics APIs are absent.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Authoring is mutable only in permitted lifecycle states; review captures exact Revision V2. Scheduling freezes an exact Revision/Targets; publication creates immutable historical audience. Revise cancels the predecessor and starts successor authoring, with no zero-downtime guarantee.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: AcademicContentPreparationTemplateUseCases.update. [AcademicContentPreparationTemplateUseCases.update](../src/modules/academics/academic-content/application/academic-content-preparation-template.use-cases.ts#L104)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### DELETE `/api/v1/academics/academic-content/templates/preparation/:templateId`

Source: [AcademicContentPreparationTemplateController.delete](../src/modules/academics/academic-content/controller/academic-content-preparation-template.controller.ts#L86). Actor: **SCHOOL_USER or ORGANIZATION_USER**. Success: **200**.

Permissions: `academics.academic_content.settings.manage`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-declared response: `{ type: AcademicContentPreparationTemplateDeleteResponseDto }`.

Ownership: SchoolManagementOnly plus server-resolved School/Organization and required permission; parent Content and all referenced academic resources must belong to that same active scope. Specialized management.analytics APIs are absent.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Authoring is mutable only in permitted lifecycle states; review captures exact Revision V2. Scheduling freezes an exact Revision/Targets; publication creates immutable historical audience. Revise cancels the predecessor and starts successor authoring, with no zero-downtime guarantee.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: AcademicContentPreparationTemplateUseCases.delete. [AcademicContentPreparationTemplateUseCases.delete](../src/modules/academics/academic-content/application/academic-content-preparation-template.use-cases.ts#L118)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### GET `/api/v1/academics/academic-content/settings/workflow-policy`

Source: [AcademicContentWorkflowPolicyController.get](../src/modules/academics/academic-content/controller/academic-content-workflow-policy.controller.ts#L30). Actor: **SCHOOL_USER or ORGANIZATION_USER**. Success: **200**.

Permissions: `academics.academic_content.view`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-declared response: `Promise<AcademicContentWorkflowPolicyResponseDto>`.

Ownership: SchoolManagementOnly plus server-resolved School/Organization and required permission; parent Content and all referenced academic resources must belong to that same active scope. Specialized management.analytics APIs are absent.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Authoring is mutable only in permitted lifecycle states; review captures exact Revision V2. Scheduling freezes an exact Revision/Targets; publication creates immutable historical audience. Revise cancels the predecessor and starts successor authoring, with no zero-downtime guarantee.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: GetAcademicContentWorkflowPolicyUseCase.execute. [GetAcademicContentWorkflowPolicyUseCase.execute](../src/modules/academics/academic-content/application/academic-content-workflow-policy.use-cases.ts#L13)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### PATCH `/api/v1/academics/academic-content/settings/workflow-policy`

Source: [AcademicContentWorkflowPolicyController.update](../src/modules/academics/academic-content/controller/academic-content-workflow-policy.controller.ts#L40). Actor: **SCHOOL_USER or ORGANIZATION_USER**. Success: **200**.

Permissions: `academics.academic_content.settings.manage`.

Request: Body: `UpdateAcademicContentWorkflowPolicyDto`. Source-declared response: `Promise<AcademicContentWorkflowPolicyResponseDto>`.

Ownership: SchoolManagementOnly plus server-resolved School/Organization and required permission; parent Content and all referenced academic resources must belong to that same active scope. Specialized management.analytics APIs are absent.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Authoring is mutable only in permitted lifecycle states; review captures exact Revision V2. Scheduling freezes an exact Revision/Targets; publication creates immutable historical audience. Revise cancels the predecessor and starts successor authoring, with no zero-downtime guarantee.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: UpdateAcademicContentWorkflowPolicyUseCase.execute. [UpdateAcademicContentWorkflowPolicyUseCase.execute](../src/modules/academics/academic-content/application/academic-content-workflow-policy.use-cases.ts#L29)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### GET `/api/v1/academics/academic-content/review-queue`

Source: [AcademicContentWorkflowController.reviewQueue](../src/modules/academics/academic-content/controller/academic-content-workflow.controller.ts#L62). Actor: **SCHOOL_USER or ORGANIZATION_USER**. Success: **200**.

Permissions: `academics.academic_content.approve`.

Request: Query: `AcademicContentReviewQueueQueryDto`. Source-declared response: `Promise<AcademicContentReviewQueueResponseDto>`.

Ownership: SchoolManagementOnly plus server-resolved School/Organization and required permission; parent Content and all referenced academic resources must belong to that same active scope. Specialized management.analytics APIs are absent.

Cache: no-store, private, max-age=0. Pagination: page default 1; limit default 50, maximum 100. Use the exact scoped repository ordering.

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Authoring is mutable only in permitted lifecycle states; review captures exact Revision V2. Scheduling freezes an exact Revision/Targets; publication creates immutable historical audience. Revise cancels the predecessor and starts successor authoring, with no zero-downtime guarantee.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: ListAcademicContentReviewQueueUseCase.execute. [ListAcademicContentReviewQueueUseCase.execute](../src/modules/academics/academic-content/application/academic-content-review.use-cases.ts#L32)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### GET `/api/v1/academics/academic-content/:contentId/approvals`

Source: [AcademicContentWorkflowController.approvals](../src/modules/academics/academic-content/controller/academic-content-workflow.controller.ts#L75). Actor: **SCHOOL_USER or ORGANIZATION_USER**. Success: **200**.

Permissions: `academics.academic_content.view`.

Request: Query: `AcademicContentPaginationQueryDto`. Source-declared response: `Promise<AcademicContentApprovalHistoryResponseDto>`.

Ownership: SchoolManagementOnly plus server-resolved School/Organization and required permission; parent Content and all referenced academic resources must belong to that same active scope. Specialized management.analytics APIs are absent.

Cache: no-store, private, max-age=0. Pagination: page default 1; limit default 50, maximum 100. Use the exact scoped repository ordering.

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Authoring is mutable only in permitted lifecycle states; review captures exact Revision V2. Scheduling freezes an exact Revision/Targets; publication creates immutable historical audience. Revise cancels the predecessor and starts successor authoring, with no zero-downtime guarantee.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: ListAcademicContentApprovalHistoryUseCase.execute. [ListAcademicContentApprovalHistoryUseCase.execute](../src/modules/academics/academic-content/application/academic-content-review.use-cases.ts#L48)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### POST `/api/v1/academics/academic-content/:contentId/submit`

Source: [AcademicContentWorkflowController.submit](../src/modules/academics/academic-content/controller/academic-content-workflow.controller.ts#L90). Actor: **SCHOOL_USER or ORGANIZATION_USER**. Success: **200**.

Permissions: `academics.academic_content.manage`.

Request: Body: `AcademicContentEmptyWorkflowBodyDto`. Source-declared response: `Promise<AcademicContentTransitionResponseDto>`.

Ownership: SchoolManagementOnly plus server-resolved School/Organization and required permission; parent Content and all referenced academic resources must belong to that same active scope. Specialized management.analytics APIs are absent.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Authoring is mutable only in permitted lifecycle states; review captures exact Revision V2. Scheduling freezes an exact Revision/Targets; publication creates immutable historical audience. Revise cancels the predecessor and starts successor authoring, with no zero-downtime guarantee.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: SubmitAcademicContentUseCase.execute. [SubmitAcademicContentUseCase.execute](../src/modules/academics/academic-content/application/academic-content-workflow.use-cases.ts#L25)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### POST `/api/v1/academics/academic-content/:contentId/approve`

Source: [AcademicContentWorkflowController.approve](../src/modules/academics/academic-content/controller/academic-content-workflow.controller.ts#L110). Actor: **SCHOOL_USER or ORGANIZATION_USER**. Success: **200**.

Permissions: `academics.academic_content.approve`.

Request: Body: `AcademicContentEmptyWorkflowBodyDto`. Source-declared response: `Promise<AcademicContentTransitionResponseDto>`.

Ownership: SchoolManagementOnly plus server-resolved School/Organization and required permission; parent Content and all referenced academic resources must belong to that same active scope. Specialized management.analytics APIs are absent.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Authoring is mutable only in permitted lifecycle states; review captures exact Revision V2. Scheduling freezes an exact Revision/Targets; publication creates immutable historical audience. Revise cancels the predecessor and starts successor authoring, with no zero-downtime guarantee.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: ApproveAcademicContentUseCase.execute. [ApproveAcademicContentUseCase.execute](../src/modules/academics/academic-content/application/academic-content-workflow.use-cases.ts#L60)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### POST `/api/v1/academics/academic-content/:contentId/request-changes`

Source: [AcademicContentWorkflowController.request](../src/modules/academics/academic-content/controller/academic-content-workflow.controller.ts#L128). Actor: **SCHOOL_USER or ORGANIZATION_USER**. Success: **200**.

Permissions: `academics.academic_content.approve`.

Request: Body: `AcademicContentRequestChangesDto`. Source-declared response: `Promise<AcademicContentTransitionResponseDto>`.

Ownership: SchoolManagementOnly plus server-resolved School/Organization and required permission; parent Content and all referenced academic resources must belong to that same active scope. Specialized management.analytics APIs are absent.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Authoring is mutable only in permitted lifecycle states; review captures exact Revision V2. Scheduling freezes an exact Revision/Targets; publication creates immutable historical audience. Revise cancels the predecessor and starts successor authoring, with no zero-downtime guarantee.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: RequestAcademicContentChangesUseCase.execute. [RequestAcademicContentChangesUseCase.execute](../src/modules/academics/academic-content/application/academic-content-workflow.use-cases.ts#L92)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### POST `/api/v1/academics/academic-content`

Source: [AcademicContentController.create](../src/modules/academics/academic-content/controller/academic-content.controller.ts#L178). Actor: **SCHOOL_USER or ORGANIZATION_USER**. Success: **201**.

Permissions: `academics.academic_content.manage`.

Request: Body: `CreateAcademicContentDto`. Source-declared response: `Promise<AcademicContentResponseDto>`.

Ownership: SchoolManagementOnly plus server-resolved School/Organization and required permission; parent Content and all referenced academic resources must belong to that same active scope. Specialized management.analytics APIs are absent.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Authoring is mutable only in permitted lifecycle states; review captures exact Revision V2. Scheduling freezes an exact Revision/Targets; publication creates immutable historical audience. Revise cancels the predecessor and starts successor authoring, with no zero-downtime guarantee.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: CreateAcademicContentUseCase.execute. [CreateAcademicContentUseCase.execute](../src/modules/academics/academic-content/application/create-academic-content.use-case.ts#L34)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### GET `/api/v1/academics/academic-content`

Source: [AcademicContentController.list](../src/modules/academics/academic-content/controller/academic-content.controller.ts#L189). Actor: **SCHOOL_USER or ORGANIZATION_USER**. Success: **200**.

Permissions: `academics.academic_content.view`.

Request: Query: `ListAcademicContentQueryDto`. Source-declared response: `Promise<AcademicContentListResponseDto>`.

Ownership: SchoolManagementOnly plus server-resolved School/Organization and required permission; parent Content and all referenced academic resources must belong to that same active scope. Specialized management.analytics APIs are absent.

Cache: No explicit handler Cache-Control header. Pagination: page default 1; limit default 50, maximum 100. Use the exact scoped repository ordering.

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Authoring is mutable only in permitted lifecycle states; review captures exact Revision V2. Scheduling freezes an exact Revision/Targets; publication creates immutable historical audience. Revise cancels the predecessor and starts successor authoring, with no zero-downtime guarantee.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: ListAcademicContentForManagementUseCase.execute. [ListAcademicContentForManagementUseCase.execute](../src/modules/academics/academic-content/application/academic-content-management-read.use-cases.ts#L12)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### GET `/api/v1/academics/academic-content/:contentId`

Source: [AcademicContentController.detail](../src/modules/academics/academic-content/controller/academic-content.controller.ts#L201). Actor: **SCHOOL_USER or ORGANIZATION_USER**. Success: **200**.

Permissions: `academics.academic_content.view`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-declared response: `Promise<AcademicContentDetailResponseDto>`.

Ownership: SchoolManagementOnly plus server-resolved School/Organization and required permission; parent Content and all referenced academic resources must belong to that same active scope. Specialized management.analytics APIs are absent.

Cache: no-store, private, max-age=0. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Authoring is mutable only in permitted lifecycle states; review captures exact Revision V2. Scheduling freezes an exact Revision/Targets; publication creates immutable historical audience. Revise cancels the predecessor and starts successor authoring, with no zero-downtime guarantee.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: GetAcademicContentForManagementUseCase.execute. [GetAcademicContentForManagementUseCase.execute](../src/modules/academics/academic-content/application/academic-content-management-read.use-cases.ts#L30)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### GET `/api/v1/academics/academic-content/:contentId/readiness`

Source: [AcademicContentController.readiness](../src/modules/academics/academic-content/controller/academic-content.controller.ts#L215). Actor: **SCHOOL_USER or ORGANIZATION_USER**. Success: **200**.

Permissions: `academics.academic_content.view`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-declared response: `Promise<AcademicContentReadinessResponseDto>`.

Ownership: SchoolManagementOnly plus server-resolved School/Organization and required permission; parent Content and all referenced academic resources must belong to that same active scope. Specialized management.analytics APIs are absent.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Authoring is mutable only in permitted lifecycle states; review captures exact Revision V2. Scheduling freezes an exact Revision/Targets; publication creates immutable historical audience. Revise cancels the predecessor and starts successor authoring, with no zero-downtime guarantee.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: GetAcademicContentReadinessUseCase.execute. [GetAcademicContentReadinessUseCase.execute](../src/modules/academics/academic-content/application/academic-content-readiness.use-case.ts#L19)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### GET `/api/v1/academics/academic-content/:contentId/publication-readiness`

Source: [AcademicContentController.publicationReadiness](../src/modules/academics/academic-content/controller/academic-content.controller.ts#L230). Actor: **SCHOOL_USER or ORGANIZATION_USER**. Success: **200**.

Permissions: `academics.academic_content.view`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-declared response: `Promise<AcademicContentPublicationReadinessResponseDto>`.

Ownership: SchoolManagementOnly plus server-resolved School/Organization and required permission; parent Content and all referenced academic resources must belong to that same active scope. Specialized management.analytics APIs are absent.

Cache: no-store, private, max-age=0. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Authoring is mutable only in permitted lifecycle states; review captures exact Revision V2. Scheduling freezes an exact Revision/Targets; publication creates immutable historical audience. Revise cancels the predecessor and starts successor authoring, with no zero-downtime guarantee.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: GetAcademicContentPublicationReadinessUseCase.execute. [GetAcademicContentPublicationReadinessUseCase.execute](../src/modules/academics/academic-content/application/academic-content-publication.use-cases.ts#L222)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### GET `/api/v1/academics/academic-content/:contentId/audience-preview`

Source: [AcademicContentController.audiencePreview](../src/modules/academics/academic-content/controller/academic-content.controller.ts#L244). Actor: **SCHOOL_USER or ORGANIZATION_USER**. Success: **200**.

Permissions: `academics.academic_content.view`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-declared response: `Promise<AcademicContentAudiencePreviewResponseDto>`.

Ownership: SchoolManagementOnly plus server-resolved School/Organization and required permission; parent Content and all referenced academic resources must belong to that same active scope. Specialized management.analytics APIs are absent.

Cache: no-store, private, max-age=0. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Authoring is mutable only in permitted lifecycle states; review captures exact Revision V2. Scheduling freezes an exact Revision/Targets; publication creates immutable historical audience. Revise cancels the predecessor and starts successor authoring, with no zero-downtime guarantee.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: GetAcademicContentAudiencePreviewUseCase.execute. [GetAcademicContentAudiencePreviewUseCase.execute](../src/modules/academics/academic-content/application/academic-content-publication.use-cases.ts#L299)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### POST `/api/v1/academics/academic-content/:contentId/publications`

Source: [AcademicContentController.createPublication](../src/modules/academics/academic-content/controller/academic-content.controller.ts#L258). Actor: **SCHOOL_USER or ORGANIZATION_USER**. Success: **201**.

Permissions: `academics.academic_content.publish`.

Request: Body: `CreateAcademicContentPublicationDto`. Source-declared response: `Promise<AcademicContentPublicationResponseDto>`.

Ownership: SchoolManagementOnly plus server-resolved School/Organization and required permission; parent Content and all referenced academic resources must belong to that same active scope. Specialized management.analytics APIs are absent.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: Persisted publication clientRequestId/fingerprint: identical retry returns the exact eligible durable intent; contradictory payload conflicts. Retry current authorization and state are rechecked.

Version semantics: Authoring is mutable only in permitted lifecycle states; review captures exact Revision V2. Scheduling freezes an exact Revision/Targets; publication creates immutable historical audience. Revise cancels the predecessor and starts successor authoring, with no zero-downtime guarantee.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: ScheduleAcademicContentPublicationUseCase.execute. [ScheduleAcademicContentPublicationUseCase.execute](../src/modules/academics/academic-content/application/academic-content-publication.use-cases.ts#L28)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### GET `/api/v1/academics/academic-content/:contentId/publications`

Source: [AcademicContentController.publicationHistory](../src/modules/academics/academic-content/controller/academic-content.controller.ts#L290). Actor: **SCHOOL_USER or ORGANIZATION_USER**. Success: **200**.

Permissions: `academics.academic_content.view`.

Request: Query: `AcademicContentPublicationHistoryQueryDto`. Source-declared response: `Promise<AcademicContentPublicationHistoryResponseDto>`.

Ownership: SchoolManagementOnly plus server-resolved School/Organization and required permission; parent Content and all referenced academic resources must belong to that same active scope. Specialized management.analytics APIs are absent.

Cache: no-store, private, max-age=0. Pagination: page default 1; limit default 20, maximum 100. Use the exact scoped repository ordering.

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Authoring is mutable only in permitted lifecycle states; review captures exact Revision V2. Scheduling freezes an exact Revision/Targets; publication creates immutable historical audience. Revise cancels the predecessor and starts successor authoring, with no zero-downtime guarantee.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: ListAcademicContentPublicationHistoryUseCase.execute. [ListAcademicContentPublicationHistoryUseCase.execute](../src/modules/academics/academic-content/application/academic-content-publication.use-cases.ts#L240)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### GET `/api/v1/academics/academic-content/:contentId/publications/:publicationId`

Source: [AcademicContentController.publicationDetail](../src/modules/academics/academic-content/controller/academic-content.controller.ts#L305). Actor: **SCHOOL_USER or ORGANIZATION_USER**. Success: **200**.

Permissions: `academics.academic_content.view`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-declared response: `Promise<AcademicContentPublicationResponseDto>`.

Ownership: SchoolManagementOnly plus server-resolved School/Organization and required permission; parent Content and all referenced academic resources must belong to that same active scope. Specialized management.analytics APIs are absent.

Cache: no-store, private, max-age=0. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Authoring is mutable only in permitted lifecycle states; review captures exact Revision V2. Scheduling freezes an exact Revision/Targets; publication creates immutable historical audience. Revise cancels the predecessor and starts successor authoring, with no zero-downtime guarantee.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: GetAcademicContentPublicationUseCase.execute. [GetAcademicContentPublicationUseCase.execute](../src/modules/academics/academic-content/application/academic-content-publication.use-cases.ts#L270)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### POST `/api/v1/academics/academic-content/:contentId/publications/:publicationId/unschedule`

Source: [AcademicContentController.unschedule](../src/modules/academics/academic-content/controller/academic-content.controller.ts#L321). Actor: **SCHOOL_USER or ORGANIZATION_USER**. Success: **200**.

Permissions: `academics.academic_content.publish`.

Request: Body: `AcademicContentEmptyPublicationBodyDto`. Source-declared response: `Promise<AcademicContentPublicationResponseDto>`.

Ownership: SchoolManagementOnly plus server-resolved School/Organization and required permission; parent Content and all referenced academic resources must belong to that same active scope. Specialized management.analytics APIs are absent.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Authoring is mutable only in permitted lifecycle states; review captures exact Revision V2. Scheduling freezes an exact Revision/Targets; publication creates immutable historical audience. Revise cancels the predecessor and starts successor authoring, with no zero-downtime guarantee.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: UnscheduleAcademicContentPublicationUseCase.execute. [UnscheduleAcademicContentPublicationUseCase.execute](../src/modules/academics/academic-content/application/academic-content-publication.use-cases.ts#L190)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### POST `/api/v1/academics/academic-content/:contentId/publications/:publicationId/cancel`

Source: [AcademicContentController.cancel](../src/modules/academics/academic-content/controller/academic-content.controller.ts#L346). Actor: **SCHOOL_USER or ORGANIZATION_USER**. Success: **200**.

Permissions: `academics.academic_content.publish`.

Request: Body: `AcademicContentEmptyPublicationBodyDto`. Source-declared response: `Promise<AcademicContentPublicationResponseDto>`.

Ownership: SchoolManagementOnly plus server-resolved School/Organization and required permission; parent Content and all referenced academic resources must belong to that same active scope. Specialized management.analytics APIs are absent.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Authoring is mutable only in permitted lifecycle states; review captures exact Revision V2. Scheduling freezes an exact Revision/Targets; publication creates immutable historical audience. Revise cancels the predecessor and starts successor authoring, with no zero-downtime guarantee.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: CancelAcademicContentPublicationUseCase.execute. [CancelAcademicContentPublicationUseCase.execute](../src/modules/academics/academic-content/application/academic-content-publication.use-cases.ts#L120)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### POST `/api/v1/academics/academic-content/:contentId/publications/:publicationId/revise`

Source: [AcademicContentController.revise](../src/modules/academics/academic-content/controller/academic-content.controller.ts#L368). Actor: **SCHOOL_USER or ORGANIZATION_USER**. Success: **200**.

Permissions: `academics.academic_content.manage`, `academics.academic_content.publish`.

Request: Body: `AcademicContentEmptyPublicationBodyDto`. Source-declared response: `Promise<AcademicContentPublicationRevisionStartResponseDto>`.

Ownership: SchoolManagementOnly plus server-resolved School/Organization and required permission; parent Content and all referenced academic resources must belong to that same active scope. Specialized management.analytics APIs are absent.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Authoring is mutable only in permitted lifecycle states; review captures exact Revision V2. Scheduling freezes an exact Revision/Targets; publication creates immutable historical audience. Revise cancels the predecessor and starts successor authoring, with no zero-downtime guarantee.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: StartAcademicContentRevisionUseCase.execute. [StartAcademicContentRevisionUseCase.execute](../src/modules/academics/academic-content/application/academic-content-publication.use-cases.ts#L78)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### PUT `/api/v1/academics/academic-content/:contentId/details/preparation`

Source: [AcademicContentController.replacePreparation](../src/modules/academics/academic-content/controller/academic-content.controller.ts#L393). Actor: **SCHOOL_USER or ORGANIZATION_USER**. Success: **200**.

Permissions: `academics.academic_content.manage`.

Request: Body: `ReplaceAcademicContentPreparationDetailDto`. Source-declared response: `Promise<AcademicContentPreparationDetailResponseDto>`.

Ownership: SchoolManagementOnly plus server-resolved School/Organization and required permission; parent Content and all referenced academic resources must belong to that same active scope. Specialized management.analytics APIs are absent.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Authoring is mutable only in permitted lifecycle states; review captures exact Revision V2. Scheduling freezes an exact Revision/Targets; publication creates immutable historical audience. Revise cancels the predecessor and starts successor authoring, with no zero-downtime guarantee.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: AcademicContentTypeDetailUseCases.replacePreparation. [AcademicContentTypeDetailUseCases.replacePreparation](../src/modules/academics/academic-content/application/academic-content-type-detail.use-cases.ts#L53)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### PUT `/api/v1/academics/academic-content/:contentId/details/weekly-plan`

Source: [AcademicContentController.replaceWeeklyPlan](../src/modules/academics/academic-content/controller/academic-content.controller.ts#L409). Actor: **SCHOOL_USER or ORGANIZATION_USER**. Success: **200**.

Permissions: `academics.academic_content.manage`.

Request: Body: `ReplaceAcademicContentWeeklyPlanDetailDto`. Source-declared response: `Promise<AcademicContentWeeklyPlanDetailResponseDto>`.

Ownership: SchoolManagementOnly plus server-resolved School/Organization and required permission; parent Content and all referenced academic resources must belong to that same active scope. Specialized management.analytics APIs are absent.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Authoring is mutable only in permitted lifecycle states; review captures exact Revision V2. Scheduling freezes an exact Revision/Targets; publication creates immutable historical audience. Revise cancels the predecessor and starts successor authoring, with no zero-downtime guarantee.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: AcademicContentTypeDetailUseCases.replaceWeeklyPlan. [AcademicContentTypeDetailUseCases.replaceWeeklyPlan](../src/modules/academics/academic-content/application/academic-content-type-detail.use-cases.ts#L60)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### PUT `/api/v1/academics/academic-content/:contentId/details/guardian-note`

Source: [AcademicContentController.replaceGuardianNote](../src/modules/academics/academic-content/controller/academic-content.controller.ts#L425). Actor: **SCHOOL_USER or ORGANIZATION_USER**. Success: **200**.

Permissions: `academics.academic_content.manage`.

Request: Body: `ReplaceAcademicContentGuardianNoteDetailDto`. Source-declared response: `Promise<AcademicContentGuardianNoteDetailResponseDto>`.

Ownership: SchoolManagementOnly plus server-resolved School/Organization and required permission; parent Content and all referenced academic resources must belong to that same active scope. Specialized management.analytics APIs are absent.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Authoring is mutable only in permitted lifecycle states; review captures exact Revision V2. Scheduling freezes an exact Revision/Targets; publication creates immutable historical audience. Revise cancels the predecessor and starts successor authoring, with no zero-downtime guarantee.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: AcademicContentTypeDetailUseCases.replaceGuardianNote. [AcademicContentTypeDetailUseCases.replaceGuardianNote](../src/modules/academics/academic-content/application/academic-content-type-detail.use-cases.ts#L63)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### PUT `/api/v1/academics/academic-content/:contentId/details/subject-resource`

Source: [AcademicContentController.replaceSubjectResource](../src/modules/academics/academic-content/controller/academic-content.controller.ts#L441). Actor: **SCHOOL_USER or ORGANIZATION_USER**. Success: **200**.

Permissions: `academics.academic_content.manage`.

Request: Body: `ReplaceAcademicContentSubjectResourceDetailDto`. Source-declared response: `Promise<AcademicContentSubjectResourceDetailResponseDto>`.

Ownership: SchoolManagementOnly plus server-resolved School/Organization and required permission; parent Content and all referenced academic resources must belong to that same active scope. Specialized management.analytics APIs are absent.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Authoring is mutable only in permitted lifecycle states; review captures exact Revision V2. Scheduling freezes an exact Revision/Targets; publication creates immutable historical audience. Revise cancels the predecessor and starts successor authoring, with no zero-downtime guarantee.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: AcademicContentTypeDetailUseCases.replaceSubjectResource. [AcademicContentTypeDetailUseCases.replaceSubjectResource](../src/modules/academics/academic-content/application/academic-content-type-detail.use-cases.ts#L70)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### PUT `/api/v1/academics/academic-content/:contentId/details/online-session`

Source: [AcademicContentController.replaceOnlineSession](../src/modules/academics/academic-content/controller/academic-content.controller.ts#L460). Actor: **SCHOOL_USER or ORGANIZATION_USER**. Success: **200**.

Permissions: `academics.academic_content.manage`.

Request: Body: `ReplaceAcademicContentOnlineSessionDetailDto`. Source-declared response: `Promise<AcademicContentOnlineSessionDetailResponseDto>`.

Ownership: SchoolManagementOnly plus server-resolved School/Organization and required permission; parent Content and all referenced academic resources must belong to that same active scope. Specialized management.analytics APIs are absent.

Cache: no-store, private, max-age=0. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Authoring is mutable only in permitted lifecycle states; review captures exact Revision V2. Scheduling freezes an exact Revision/Targets; publication creates immutable historical audience. Revise cancels the predecessor and starts successor authoring, with no zero-downtime guarantee.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: AcademicContentTypeDetailUseCases.replaceOnlineSession. [AcademicContentTypeDetailUseCases.replaceOnlineSession](../src/modules/academics/academic-content/application/academic-content-type-detail.use-cases.ts#L77)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### PATCH `/api/v1/academics/academic-content/:contentId`

Source: [AcademicContentController.update](../src/modules/academics/academic-content/controller/academic-content.controller.ts#L480). Actor: **SCHOOL_USER or ORGANIZATION_USER**. Success: **200**.

Permissions: `academics.academic_content.manage`.

Request: Body: `UpdateAcademicContentDto`. Source-declared response: `Promise<AcademicContentResponseDto>`.

Ownership: SchoolManagementOnly plus server-resolved School/Organization and required permission; parent Content and all referenced academic resources must belong to that same active scope. Specialized management.analytics APIs are absent.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Authoring is mutable only in permitted lifecycle states; review captures exact Revision V2. Scheduling freezes an exact Revision/Targets; publication creates immutable historical audience. Revise cancels the predecessor and starts successor authoring, with no zero-downtime guarantee.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: AcademicContentLifecycleUseCases.update. [AcademicContentLifecycleUseCases.update](../src/modules/academics/academic-content/application/academic-content-lifecycle.use-cases.ts#L49)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### DELETE `/api/v1/academics/academic-content/:contentId`

Source: [AcademicContentController.delete](../src/modules/academics/academic-content/controller/academic-content.controller.ts#L493). Actor: **SCHOOL_USER or ORGANIZATION_USER**. Success: **200**.

Permissions: `academics.academic_content.manage`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-declared response: `Promise<AcademicContentDeleteResponseDto>`.

Ownership: SchoolManagementOnly plus server-resolved School/Organization and required permission; parent Content and all referenced academic resources must belong to that same active scope. Specialized management.analytics APIs are absent.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Authoring is mutable only in permitted lifecycle states; review captures exact Revision V2. Scheduling freezes an exact Revision/Targets; publication creates immutable historical audience. Revise cancels the predecessor and starts successor authoring, with no zero-downtime guarantee.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: AcademicContentLifecycleUseCases.delete. [AcademicContentLifecycleUseCases.delete](../src/modules/academics/academic-content/application/academic-content-lifecycle.use-cases.ts#L108)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### POST `/api/v1/academics/academic-content/:contentId/archive`

Source: [AcademicContentController.archive](../src/modules/academics/academic-content/controller/academic-content.controller.ts#L505). Actor: **SCHOOL_USER or ORGANIZATION_USER**. Success: **200**.

Permissions: `academics.academic_content.manage`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-declared response: `Promise<AcademicContentResponseDto>`.

Ownership: SchoolManagementOnly plus server-resolved School/Organization and required permission; parent Content and all referenced academic resources must belong to that same active scope. Specialized management.analytics APIs are absent.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Authoring is mutable only in permitted lifecycle states; review captures exact Revision V2. Scheduling freezes an exact Revision/Targets; publication creates immutable historical audience. Revise cancels the predecessor and starts successor authoring, with no zero-downtime guarantee.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: AcademicContentLifecycleUseCases.archive. [AcademicContentLifecycleUseCases.archive](../src/modules/academics/academic-content/application/academic-content-lifecycle.use-cases.ts#L90)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### POST `/api/v1/academics/academic-content/:contentId/restore`

Source: [AcademicContentController.restore](../src/modules/academics/academic-content/controller/academic-content.controller.ts#L517). Actor: **SCHOOL_USER or ORGANIZATION_USER**. Success: **200**.

Permissions: `academics.academic_content.manage`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-declared response: `Promise<AcademicContentResponseDto>`.

Ownership: SchoolManagementOnly plus server-resolved School/Organization and required permission; parent Content and all referenced academic resources must belong to that same active scope. Specialized management.analytics APIs are absent.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Authoring is mutable only in permitted lifecycle states; review captures exact Revision V2. Scheduling freezes an exact Revision/Targets; publication creates immutable historical audience. Revise cancels the predecessor and starts successor authoring, with no zero-downtime guarantee.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: AcademicContentLifecycleUseCases.restore. [AcademicContentLifecycleUseCases.restore](../src/modules/academics/academic-content/application/academic-content-lifecycle.use-cases.ts#L99)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### PUT `/api/v1/academics/academic-content/:contentId/targets`

Source: [AcademicContentController.targets](../src/modules/academics/academic-content/controller/academic-content.controller.ts#L529). Actor: **SCHOOL_USER or ORGANIZATION_USER**. Success: **200**.

Permissions: `academics.academic_content.manage`.

Request: Body: `ReplaceAcademicContentTargetsDto`. Source-declared response: `Promise<AcademicContentTargetsResponseDto>`.

Ownership: SchoolManagementOnly plus server-resolved School/Organization and required permission; parent Content and all referenced academic resources must belong to that same active scope. Specialized management.analytics APIs are absent.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Authoring is mutable only in permitted lifecycle states; review captures exact Revision V2. Scheduling freezes an exact Revision/Targets; publication creates immutable historical audience. Revise cancels the predecessor and starts successor authoring, with no zero-downtime guarantee.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: ReplaceAcademicContentTargetsUseCase.execute. [ReplaceAcademicContentTargetsUseCase.execute](../src/modules/academics/academic-content/application/replace-academic-content-targets.use-case.ts#L28)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### PUT `/api/v1/academics/academic-content/:contentId/links`

Source: [AcademicContentController.links](../src/modules/academics/academic-content/controller/academic-content.controller.ts#L544). Actor: **SCHOOL_USER or ORGANIZATION_USER**. Success: **200**.

Permissions: `academics.academic_content.manage`.

Request: Body: `ReplaceAcademicContentLinksDto`. Source-declared response: `Promise<AcademicContentLinksResponseDto>`.

Ownership: SchoolManagementOnly plus server-resolved School/Organization and required permission; parent Content and all referenced academic resources must belong to that same active scope. Specialized management.analytics APIs are absent.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Authoring is mutable only in permitted lifecycle states; review captures exact Revision V2. Scheduling freezes an exact Revision/Targets; publication creates immutable historical audience. Revise cancels the predecessor and starts successor authoring, with no zero-downtime guarantee.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: ReplaceAcademicContentLinksUseCase.execute. [ReplaceAcademicContentLinksUseCase.execute](../src/modules/academics/academic-content/application/replace-academic-content-links-tags.use-cases.ts#L15)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### PUT `/api/v1/academics/academic-content/:contentId/tags`

Source: [AcademicContentController.tags](../src/modules/academics/academic-content/controller/academic-content.controller.ts#L559). Actor: **SCHOOL_USER or ORGANIZATION_USER**. Success: **200**.

Permissions: `academics.academic_content.manage`.

Request: Body: `ReplaceAcademicContentTagsDto`. Source-declared response: `Promise<AcademicContentTagsResponseDto>`.

Ownership: SchoolManagementOnly plus server-resolved School/Organization and required permission; parent Content and all referenced academic resources must belong to that same active scope. Specialized management.analytics APIs are absent.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Authoring is mutable only in permitted lifecycle states; review captures exact Revision V2. Scheduling freezes an exact Revision/Targets; publication creates immutable historical audience. Revise cancels the predecessor and starts successor authoring, with no zero-downtime guarantee.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: ReplaceAcademicContentTagsUseCase.execute. [ReplaceAcademicContentTagsUseCase.execute](../src/modules/academics/academic-content/application/replace-academic-content-links-tags.use-cases.ts#L32)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### GET `/api/v1/academics/academic-content/:contentId/revisions`

Source: [AcademicContentController.revisions](../src/modules/academics/academic-content/controller/academic-content.controller.ts#L574). Actor: **SCHOOL_USER or ORGANIZATION_USER**. Success: **200**.

Permissions: `academics.academic_content.view`.

Request: Query: `AcademicContentPaginationQueryDto`. Source-declared response: `Promise<AcademicContentRevisionListDto>`.

Ownership: SchoolManagementOnly plus server-resolved School/Organization and required permission; parent Content and all referenced academic resources must belong to that same active scope. Specialized management.analytics APIs are absent.

Cache: No explicit handler Cache-Control header. Pagination: page default 1; limit default 50, maximum 100. Use the exact scoped repository ordering.

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Authoring is mutable only in permitted lifecycle states; review captures exact Revision V2. Scheduling freezes an exact Revision/Targets; publication creates immutable historical audience. Revise cancels the predecessor and starts successor authoring, with no zero-downtime guarantee.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: ListAcademicContentRevisionsUseCase.execute. [ListAcademicContentRevisionsUseCase.execute](../src/modules/academics/academic-content/application/academic-content-revision.use-cases.ts#L26)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### GET `/api/v1/academics/academic-content/:contentId/revisions/:revisionId`

Source: [AcademicContentController.revisionDetail](../src/modules/academics/academic-content/controller/academic-content.controller.ts#L588). Actor: **SCHOOL_USER or ORGANIZATION_USER**. Success: **200**.

Permissions: `academics.academic_content.view`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-declared response: `Promise<AcademicContentRevisionDetailDto>`.

Ownership: SchoolManagementOnly plus server-resolved School/Organization and required permission; parent Content and all referenced academic resources must belong to that same active scope. Specialized management.analytics APIs are absent.

Cache: no-store, private, max-age=0. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Authoring is mutable only in permitted lifecycle states; review captures exact Revision V2. Scheduling freezes an exact Revision/Targets; publication creates immutable historical audience. Revise cancels the predecessor and starts successor authoring, with no zero-downtime guarantee.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: GetAcademicContentRevisionUseCase.execute. [GetAcademicContentRevisionUseCase.execute](../src/modules/academics/academic-content/application/academic-content-revision.use-cases.ts#L58)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### POST `/api/v1/academics/academic-content/:contentId/uploads`

Source: [AcademicContentController.uploadIntent](../src/modules/academics/academic-content/controller/academic-content.controller.ts#L604). Actor: **SCHOOL_USER or ORGANIZATION_USER**. Success: **201**.

Permissions: `academics.academic_content.manage`.

Request: Body: `CreateAcademicContentUploadDto`. Source-declared response: `Promise<AcademicContentUploadIntentResponseDto>`.

Ownership: SchoolManagementOnly plus server-resolved School/Organization and required permission; parent Content and all referenced academic resources must belong to that same active scope. Specialized management.analytics APIs are absent.

Cache: no-store, private, max-age=0. Pagination: Not paginated by this endpoint

Idempotency: Persisted upload-session clientRequestId/fingerprint; identical intent retries reauthorize and return existing eligible session; conflicting payload is 409.

Version semantics: Authoring is mutable only in permitted lifecycle states; review captures exact Revision V2. Scheduling freezes an exact Revision/Targets; publication creates immutable historical audience. Revise cancels the predecessor and starts successor authoring, with no zero-downtime guarantee.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: CreateAcademicContentUploadUseCase.execute. [CreateAcademicContentUploadUseCase.execute](../src/modules/academics/academic-content/files/application/academic-content-upload.use-cases.ts#L88)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership. Origin authority comes only from HTTP Origin header, validated against both app and storage CORS allowlists; never from request JSON. GCS supports resumable uploads; MinIO resumable intent rejects with 409 before persistence.

### POST `/api/v1/academics/academic-content/:contentId/uploads/:uploadId/complete`

Source: [AcademicContentController.uploadComplete](../src/modules/academics/academic-content/controller/academic-content.controller.ts#L627). Actor: **SCHOOL_USER or ORGANIZATION_USER**. Success: **200**.

Permissions: `academics.academic_content.manage`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-declared response: `Promise<AcademicContentUploadCompleteResponseDto>`.

Ownership: SchoolManagementOnly plus server-resolved School/Organization and required permission; parent Content and all referenced academic resources must belong to that same active scope. Specialized management.analytics APIs are absent.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Authoring is mutable only in permitted lifecycle states; review captures exact Revision V2. Scheduling freezes an exact Revision/Targets; publication creates immutable historical audience. Revise cancels the predecessor and starts successor authoring, with no zero-downtime guarantee.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: CompleteAcademicContentUploadUseCase.execute. [CompleteAcademicContentUploadUseCase.execute](../src/modules/academics/academic-content/files/application/academic-content-upload.use-cases.ts#L239)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### POST `/api/v1/academics/academic-content/:contentId/uploads/:uploadId/cancel`

Source: [AcademicContentController.uploadCancel](../src/modules/academics/academic-content/controller/academic-content.controller.ts#L643). Actor: **SCHOOL_USER or ORGANIZATION_USER**. Success: **200**.

Permissions: `academics.academic_content.manage`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-declared response: `Promise<AcademicContentUploadCancelResponseDto>`.

Ownership: SchoolManagementOnly plus server-resolved School/Organization and required permission; parent Content and all referenced academic resources must belong to that same active scope. Specialized management.analytics APIs are absent.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Authoring is mutable only in permitted lifecycle states; review captures exact Revision V2. Scheduling freezes an exact Revision/Targets; publication creates immutable historical audience. Revise cancels the predecessor and starts successor authoring, with no zero-downtime guarantee.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: CancelAcademicContentUploadUseCase.execute. [CancelAcademicContentUploadUseCase.execute](../src/modules/academics/academic-content/files/application/academic-content-upload.use-cases.ts#L417)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### DELETE `/api/v1/academics/academic-content/:contentId/assets/:assetId`

Source: [AcademicContentController.assetUnlink](../src/modules/academics/academic-content/controller/academic-content.controller.ts#L659). Actor: **SCHOOL_USER or ORGANIZATION_USER**. Success: **200**.

Permissions: `academics.academic_content.manage`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-declared response: `Promise<AcademicContentAssetUnlinkResponseDto>`.

Ownership: SchoolManagementOnly plus server-resolved School/Organization and required permission; parent Content and all referenced academic resources must belong to that same active scope. Specialized management.analytics APIs are absent.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Authoring is mutable only in permitted lifecycle states; review captures exact Revision V2. Scheduling freezes an exact Revision/Targets; publication creates immutable historical audience. Revise cancels the predecessor and starts successor authoring, with no zero-downtime guarantee.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: UnlinkAcademicContentAssetUseCase.execute. [UnlinkAcademicContentAssetUseCase.execute](../src/modules/academics/academic-content/files/application/academic-content-upload.use-cases.ts#L467)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### GET `/api/v1/communication/notifications`

Source: [CommunicationNotificationController.listNotifications](../src/modules/communication/controller/communication-notification.controller.ts#L42). Actor: **SCHOOL_USER or ORGANIZATION_USER (CommunicationCoreAccessGuard)**. Success: **200**.

Permissions: `communication.notifications.view`.

Request: Query: `ListCommunicationNotificationsQueryDto`. Source-inferred response (no explicit response DTO): `Promise<{ items: import("src/modules/communication/presenters/communication-notification.presenter").CommunicationNotificationResponse[]; total: number; limit: number; page: number; }>`.

Ownership: Current authenticated app actor and recipient-owned Communication notification/preference/device-token surface; core Communication routes additionally require SCHOOL_USER or ORGANIZATION_USER. Delivery inspection is School-scoped with communication.notifications.manage.

Cache: No explicit handler Cache-Control header. Pagination: page default 1; limit default 50, maximum 100 (source DTO validators and CommunicationNotificationRepository.list/listDeliveries); source repository ordering is retained.

Idempotency: Read/read-all/archive and preference/token state operations follow existing Communication contracts; these are not AcademicContent clientRequestId writes. Notification generation deduplicates by event/recipient/channel.

Version semantics: Communication owns delivery/read/archive facts. ACC deep-link metadata is a historical pointer: follow-up ACC detail must resolve current access/canonical successor. Reading a notification never creates Engagement or ACK.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: ListCommunicationNotificationsUseCase.execute. [ListCommunicationNotificationsUseCase.execute](../src/modules/communication/application/communication-notification.use-cases.ts#L54)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership. No signed capabilities or Online Session join secrets in notification transport. Push/provider and real app receipt need external evidence; Backend doubles do not prove device delivery.

### POST `/api/v1/communication/notifications/read-all`

Source: [CommunicationNotificationController.markAllNotificationsRead](../src/modules/communication/controller/communication-notification.controller.ts#L48). Actor: **SCHOOL_USER or ORGANIZATION_USER (CommunicationCoreAccessGuard)**. Success: **201**.

Permissions: `communication.notifications.view`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-inferred response (no explicit response DTO): `Promise<{ markedCount: number; readAt: string; }>`.

Ownership: Current authenticated app actor and recipient-owned Communication notification/preference/device-token surface; core Communication routes additionally require SCHOOL_USER or ORGANIZATION_USER. Delivery inspection is School-scoped with communication.notifications.manage.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: Read/read-all/archive and preference/token state operations follow existing Communication contracts; these are not AcademicContent clientRequestId writes. Notification generation deduplicates by event/recipient/channel.

Version semantics: Communication owns delivery/read/archive facts. ACC deep-link metadata is a historical pointer: follow-up ACC detail must resolve current access/canonical successor. Reading a notification never creates Engagement or ACK.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: MarkAllCommunicationNotificationsReadUseCase.execute. [MarkAllCommunicationNotificationsReadUseCase.execute](../src/modules/communication/application/communication-notification.use-cases.ts#L170)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership. No signed capabilities or Online Session join secrets in notification transport. Push/provider and real app receipt need external evidence; Backend doubles do not prove device delivery.

### GET `/api/v1/communication/notifications/:notificationId`

Source: [CommunicationNotificationController.getNotification](../src/modules/communication/controller/communication-notification.controller.ts#L54). Actor: **SCHOOL_USER or ORGANIZATION_USER (CommunicationCoreAccessGuard)**. Success: **200**.

Permissions: `communication.notifications.view`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-inferred response (no explicit response DTO): `Promise<import("src/modules/communication/presenters/communication-notification.presenter").CommunicationNotificationDetailResponse>`.

Ownership: Current authenticated app actor and recipient-owned Communication notification/preference/device-token surface; core Communication routes additionally require SCHOOL_USER or ORGANIZATION_USER. Delivery inspection is School-scoped with communication.notifications.manage.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: Read/read-all/archive and preference/token state operations follow existing Communication contracts; these are not AcademicContent clientRequestId writes. Notification generation deduplicates by event/recipient/channel.

Version semantics: Communication owns delivery/read/archive facts. ACC deep-link metadata is a historical pointer: follow-up ACC detail must resolve current access/canonical successor. Reading a notification never creates Engagement or ACK.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: GetCommunicationNotificationUseCase.execute. [GetCommunicationNotificationUseCase.execute](../src/modules/communication/application/communication-notification.use-cases.ts#L116)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership. No signed capabilities or Online Session join secrets in notification transport. Push/provider and real app receipt need external evidence; Backend doubles do not prove device delivery.

### POST `/api/v1/communication/notifications/:notificationId/read`

Source: [CommunicationNotificationController.markNotificationRead](../src/modules/communication/controller/communication-notification.controller.ts#L62). Actor: **SCHOOL_USER or ORGANIZATION_USER (CommunicationCoreAccessGuard)**. Success: **201**.

Permissions: `communication.notifications.view`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-inferred response (no explicit response DTO): `Promise<import("src/modules/communication/presenters/communication-notification.presenter").CommunicationNotificationDetailResponse>`.

Ownership: Current authenticated app actor and recipient-owned Communication notification/preference/device-token surface; core Communication routes additionally require SCHOOL_USER or ORGANIZATION_USER. Delivery inspection is School-scoped with communication.notifications.manage.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: Read/read-all/archive and preference/token state operations follow existing Communication contracts; these are not AcademicContent clientRequestId writes. Notification generation deduplicates by event/recipient/channel.

Version semantics: Communication owns delivery/read/archive facts. ACC deep-link metadata is a historical pointer: follow-up ACC detail must resolve current access/canonical successor. Reading a notification never creates Engagement or ACK.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: MarkCommunicationNotificationReadUseCase.execute. [MarkCommunicationNotificationReadUseCase.execute](../src/modules/communication/application/communication-notification.use-cases.ts#L139)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership. No signed capabilities or Online Session join secrets in notification transport. Push/provider and real app receipt need external evidence; Backend doubles do not prove device delivery.

### POST `/api/v1/communication/notifications/:notificationId/archive`

Source: [CommunicationNotificationController.archiveNotification](../src/modules/communication/controller/communication-notification.controller.ts#L72). Actor: **SCHOOL_USER or ORGANIZATION_USER (CommunicationCoreAccessGuard)**. Success: **201**.

Permissions: `communication.notifications.view`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-inferred response (no explicit response DTO): `Promise<import("src/modules/communication/presenters/communication-notification.presenter").CommunicationNotificationDetailResponse>`.

Ownership: Current authenticated app actor and recipient-owned Communication notification/preference/device-token surface; core Communication routes additionally require SCHOOL_USER or ORGANIZATION_USER. Delivery inspection is School-scoped with communication.notifications.manage.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: Read/read-all/archive and preference/token state operations follow existing Communication contracts; these are not AcademicContent clientRequestId writes. Notification generation deduplicates by event/recipient/channel.

Version semantics: Communication owns delivery/read/archive facts. ACC deep-link metadata is a historical pointer: follow-up ACC detail must resolve current access/canonical successor. Reading a notification never creates Engagement or ACK.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: ArchiveCommunicationNotificationUseCase.execute. [ArchiveCommunicationNotificationUseCase.execute](../src/modules/communication/application/communication-notification.use-cases.ts#L191)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership. No signed capabilities or Online Session join secrets in notification transport. Push/provider and real app receipt need external evidence; Backend doubles do not prove device delivery.

### GET `/api/v1/communication/notification-deliveries`

Source: [CommunicationNotificationController.listNotificationDeliveries](../src/modules/communication/controller/communication-notification.controller.ts#L80). Actor: **SCHOOL_USER or ORGANIZATION_USER (CommunicationCoreAccessGuard)**. Success: **200**.

Permissions: `communication.notifications.manage`.

Request: Query: `ListCommunicationNotificationDeliveriesQueryDto`. Source-inferred response (no explicit response DTO): `Promise<{ items: import("src/modules/communication/presenters/communication-notification-delivery.presenter").CommunicationNotificationDeliveryResponse[]; total: number; limit: number; page: number; }>`.

Ownership: Current authenticated app actor and recipient-owned Communication notification/preference/device-token surface; core Communication routes additionally require SCHOOL_USER or ORGANIZATION_USER. Delivery inspection is School-scoped with communication.notifications.manage.

Cache: No explicit handler Cache-Control header. Pagination: page default 1; limit default 50, maximum 100 (source DTO validators and CommunicationNotificationRepository.list/listDeliveries); source repository ordering is retained.

Idempotency: Read/read-all/archive and preference/token state operations follow existing Communication contracts; these are not AcademicContent clientRequestId writes. Notification generation deduplicates by event/recipient/channel.

Version semantics: Communication owns delivery/read/archive facts. ACC deep-link metadata is a historical pointer: follow-up ACC detail must resolve current access/canonical successor. Reading a notification never creates Engagement or ACK.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: ListCommunicationNotificationDeliveriesUseCase.execute. [ListCommunicationNotificationDeliveriesUseCase.execute](../src/modules/communication/application/communication-notification.use-cases.ts#L222)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership. No signed capabilities or Online Session join secrets in notification transport. Push/provider and real app receipt need external evidence; Backend doubles do not prove device delivery.

### GET `/api/v1/communication/notification-deliveries/:deliveryId`

Source: [CommunicationNotificationController.getNotificationDelivery](../src/modules/communication/controller/communication-notification.controller.ts#L88). Actor: **SCHOOL_USER or ORGANIZATION_USER (CommunicationCoreAccessGuard)**. Success: **200**.

Permissions: `communication.notifications.manage`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-inferred response (no explicit response DTO): `Promise<import("src/modules/communication/presenters/communication-notification-delivery.presenter").CommunicationNotificationDeliveryResponse>`.

Ownership: Current authenticated app actor and recipient-owned Communication notification/preference/device-token surface; core Communication routes additionally require SCHOOL_USER or ORGANIZATION_USER. Delivery inspection is School-scoped with communication.notifications.manage.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: Read/read-all/archive and preference/token state operations follow existing Communication contracts; these are not AcademicContent clientRequestId writes. Notification generation deduplicates by event/recipient/channel.

Version semantics: Communication owns delivery/read/archive facts. ACC deep-link metadata is a historical pointer: follow-up ACC detail must resolve current access/canonical successor. Reading a notification never creates Engagement or ACK.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: GetCommunicationNotificationDeliveryUseCase.execute. [GetCommunicationNotificationDeliveryUseCase.execute](../src/modules/communication/application/communication-notification.use-cases.ts#L274)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership. No signed capabilities or Online Session join secrets in notification transport. Push/provider and real app receipt need external evidence; Backend doubles do not prove device delivery.

### POST `/api/v1/files`

Source: [UploadsController.uploadFile](../src/modules/files/uploads/controller/uploads.controller.ts#L43). Actor: **authenticated scoped actor; use-case ownership applies**. Success: **201**.

Permissions: `files.uploads.manage`.

Request: multipart/form-data; FileInterceptor(file): `UploadFileRequestDto`. Source-declared response: `Promise<FileRecordResponseDto>`.

Ownership: Existing generic File upload permission and scoped use case; distinct from ACC resumable upload intent.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Generic File identity alone is not recipient ACC RevisionAsset authority.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: UploadFileUseCase.execute. [UploadFileUseCase.execute](../src/modules/files/uploads/application/upload-file.use-case.ts#L32)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### GET `/api/v1/files/:id/download`

Source: [UploadsController.downloadFile](../src/modules/files/uploads/controller/uploads.controller.ts#L61). Actor: **SCHOOL_USER or ORGANIZATION_USER**. Success: **307**.

Permissions: `files.downloads.view`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-declared response: `Promise<{ url: string }>`.

Ownership: Method SchoolManagementOnly plus files.downloads.view and scoped same-School File. Teacher/Student/Parent cannot use this as an ACC authorization shortcut, even with a forged permission grant. Management may legitimately download a scoped File.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Generic File identity alone is not recipient ACC RevisionAsset authority.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: GetFileDownloadUrlUseCase.execute. [GetFileDownloadUrlUseCase.execute](../src/modules/files/uploads/application/get-file-download-url.use-case.ts#L14)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership. Authorize exact scoped File/Asset/RevisionAsset before signing. Capability expires within 300 seconds; recipient finite visibleUntil further clips expiry. Issued capability is not retroactively revoked and must not be durably stored.

### GET `/api/v1/parent/children/:studentId/academic-content/:contentId/acknowledgement`

Source: [ParentAcademicContentAcknowledgementController.status](../src/modules/parent-app/academic-content/controller/parent-academic-content-acknowledgement.controller.ts#L57). Actor: **PARENT**. Success: **200**.

Permissions: `academics.academic_content.view`.

Request: Query: `AcademicContentAcknowledgementRequestDto`. Source-declared response: `{ type: AcademicContentAcknowledgementResponseDto }`.

Ownership: Current authenticated Parent, owned Student/Guardian relationship and active child enrollment; exact child context plus eligible visible canonical publication and immutable Revision V2 targets. Historical AudienceRecipient is not ACL.

Cache: no-store, private, max-age=0. Pagination: Not paginated by this endpoint

Idempotency: Read-only status; consumes no shared admission slot and creates no acknowledgement.

Version semantics: Status NOT_REQUIRED/PENDING/ACKNOWLEDGED comes from exact frozen GuardianNote obligation and durable ACK. New canonical publication requires a new ACK; predecessor history is retained.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: ParentAcademicContentAcknowledgementUseCase.execute. [ParentAcademicContentAcknowledgementUseCase.execute](../src/modules/parent-app/academic-content/application/parent-academic-content.use-cases.ts#L53)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership. Existing clients may GET content, authorized files and notifications without reporting Engagement; GET does not create an Engagement event or ACK. Parent must retain child context. revisionLinkId is additive.

### POST `/api/v1/parent/children/:studentId/academic-content/:contentId/acknowledgement`

Source: [ParentAcademicContentAcknowledgementController.record](../src/modules/parent-app/academic-content/controller/parent-academic-content-acknowledgement.controller.ts#L74). Actor: **PARENT**. Success: **200**.

Permissions: `academics.academic_content.view`.

Request: Body: `AcademicContentAcknowledgementRequestDto`; Query: `AcademicContentAcknowledgementEmptyQueryDto`. Source-declared response: `{ type: AcademicContentAcknowledgementResponseDto }`.

Ownership: Current authenticated Parent, owned Student/Guardian relationship and active child enrollment; exact child context plus eligible visible canonical publication and immutable Revision V2 targets. Historical AudienceRecipient is not ACL.

Cache: no-store, private, max-age=0. Pagination: Not paginated by this endpoint

Idempotency: Unique (schoolId, publicationId, studentId, actorUserId); concurrent retry returns one durable ACK after final current eligibility; no clientRequestId contract. Same Parent/different child and different Parents remain distinct.

Version semantics: Status NOT_REQUIRED/PENDING/ACKNOWLEDGED comes from exact frozen GuardianNote obligation and durable ACK. New canonical publication requires a new ACK; predecessor history is retained.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET; rateLimit: 429 with Retry-After: 60; shared Engagement+ACK admission; boundedDatabaseFailure: Sanitized bounded 503; no raw database cause; nonrequired: Non-required Note cannot be written as an ACK; current eligibility enforced after unique arbitration.

Application path: ParentAcademicContentAcknowledgementUseCase.execute. [ParentAcademicContentAcknowledgementUseCase.execute](../src/modules/parent-app/academic-content/application/parent-academic-content.use-cases.ts#L53)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership. Existing clients may GET content, authorized files and notifications without reporting Engagement; GET does not create an Engagement event or ACK. Parent must retain child context. revisionLinkId is additive.

### POST `/api/v1/parent/children/:studentId/academic-content/:contentId/engagement-events`

Source: [ParentAcademicContentEngagementController.record](../src/modules/parent-app/academic-content/controller/parent-academic-content-engagement.controller.ts#L29). Actor: **PARENT**. Success: **200**.

Permissions: `academics.academic_content.view`.

Request: Body: `RecordAcademicContentEngagementDto`. Source-declared response: `Promise<AcademicContentEngagementResponseDto>`.

Ownership: Current authenticated Parent, owned Student/Guardian relationship and active child enrollment; exact child context plus eligible visible canonical publication and immutable Revision V2 targets. Historical AudienceRecipient is not ACL. Write authority rechecks active membership, current grant and final database-time publication/relationship eligibility under ordered row locks; File/RevisionLink must be an exact live immutable reference.

Cache: no-store, private, max-age=0. Pagination: Not paginated by this endpoint

Idempotency: Unique (schoolId, actorUserId, clientRequestId): identical fingerprint returns the durable event; conflicting payload is 409. Parent child context is part of the fingerprint. Every retry reauthorizes current access and uses shared admission.

Version semantics: Only current visible PUBLISHED canonical publication. Exact immutable V2 details, links and assets; cancelled/expired/scheduled/stale predecessors do not grant current access.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET; rateLimit: 429 with Retry-After: 60; 60 admitted writes/60-second School+actor database window shared with ACK POST; denied admission creates no event; boundedDatabaseFailure: 503 sanitized academic-content unavailable response, with private no-store error caching; no raw SQL/provider cause exposed; staleReference: 404 for stale expectedPublicationId or inaccessible exact immutable file/link.

Application path: RecordParentAcademicContentEngagementUseCase.execute. [RecordParentAcademicContentEngagementUseCase.execute](../src/modules/parent-app/academic-content/application/parent-academic-content.use-cases.ts#L89)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership. Existing clients may GET content, authorized files and notifications without reporting Engagement; GET does not create an Engagement event or ACK. Parent must retain child context. revisionLinkId is additive.

### GET `/api/v1/parent/children/:studentId/academic-content`

Source: [ParentAcademicContentController.list](../src/modules/parent-app/academic-content/controller/parent-academic-content.controller.ts#L41). Actor: **PARENT**. Success: **200**.

Permissions: `academics.academic_content.view`.

Request: Query: `ParentAcademicContentQueryDto`. Source-declared response: `Promise<ParentAcademicContentListResponseDto>`.

Ownership: Current authenticated Parent, owned Student/Guardian relationship and active child enrollment; exact child context plus eligible visible canonical publication and immutable Revision V2 targets. Historical AudienceRecipient is not ACL.

Cache: no-store, private, max-age=0. Pagination: page default 1; limit default 20, maximum 100. Stable visibleFrom DESC/publication id DESC canonical recipient paging.

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Only current visible PUBLISHED canonical publication. Exact immutable V2 details, links and assets; cancelled/expired/scheduled/stale predecessors do not grant current access.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: ListParentAcademicContentUseCase.execute. [ListParentAcademicContentUseCase.execute](../src/modules/parent-app/academic-content/application/parent-academic-content.use-cases.ts#L109)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership. Existing clients may GET content, authorized files and notifications without reporting Engagement; GET does not create an Engagement event or ACK. Parent must retain child context. revisionLinkId is additive.

### GET `/api/v1/parent/children/:studentId/academic-content/:contentId`

Source: [ParentAcademicContentController.detail](../src/modules/parent-app/academic-content/controller/parent-academic-content.controller.ts#L51). Actor: **PARENT**. Success: **200**.

Permissions: `academics.academic_content.view`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-declared response: `Promise<ParentAcademicContentDetailResponseDto>`.

Ownership: Current authenticated Parent, owned Student/Guardian relationship and active child enrollment; exact child context plus eligible visible canonical publication and immutable Revision V2 targets. Historical AudienceRecipient is not ACL.

Cache: no-store, private, max-age=0. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Only current visible PUBLISHED canonical publication. Exact immutable V2 details, links and assets; cancelled/expired/scheduled/stale predecessors do not grant current access.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: GetParentAcademicContentUseCase.execute. [GetParentAcademicContentUseCase.execute](../src/modules/parent-app/academic-content/application/parent-academic-content.use-cases.ts#L135)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership. Existing clients may GET content, authorized files and notifications without reporting Engagement; GET does not create an Engagement event or ACK. Parent must retain child context. revisionLinkId is additive.

### GET `/api/v1/parent/academic-content/:contentId/accessible-children`

Source: [ParentAcademicContentController.listAccessibleChildren](../src/modules/parent-app/academic-content/controller/parent-academic-content.controller.ts#L61). Actor: **PARENT**. Success: **200**.

Permissions: `academics.academic_content.view`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-declared response: `Promise<ParentAcademicContentAccessibleChildrenResponseDto>`.

Ownership: Current authenticated Parent, owned Student/Guardian relationship and active child enrollment; exact child context plus eligible visible canonical publication and immutable Revision V2 targets. Historical AudienceRecipient is not ACL.

Cache: no-store, private, max-age=0. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Only current visible PUBLISHED canonical publication. Exact immutable V2 details, links and assets; cancelled/expired/scheduled/stale predecessors do not grant current access.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: ListParentAcademicContentAccessibleChildrenUseCase.execute. [ListParentAcademicContentAccessibleChildrenUseCase.execute](../src/modules/parent-app/academic-content/application/parent-academic-content.use-cases.ts#L156)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership. Existing clients may GET content, authorized files and notifications without reporting Engagement; GET does not create an Engagement event or ACK. Parent must retain child context. revisionLinkId is additive.

### GET `/api/v1/parent/children/:studentId/academic-content/:contentId/assets/:fileId/access`

Source: [ParentAcademicContentController.assetAccess](../src/modules/parent-app/academic-content/controller/parent-academic-content.controller.ts#L71). Actor: **PARENT**. Success: **307**.

Permissions: `academics.academic_content.view`.

Request: Query: `ParentAcademicContentAssetAccessDto`. Source-declared response: `Promise<{ url: string }>`.

Ownership: Current authenticated Parent, owned Student/Guardian relationship and active child enrollment; exact child context plus eligible visible canonical publication and immutable Revision V2 targets. Historical AudienceRecipient is not ACL.

Cache: no-store, private, max-age=0. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Only current visible PUBLISHED canonical publication. Exact immutable V2 details, links and assets; cancelled/expired/scheduled/stale predecessors do not grant current access.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: AccessParentAcademicContentAssetUseCase.execute. [AccessParentAcademicContentAssetUseCase.execute](../src/modules/parent-app/academic-content/application/parent-academic-content.use-cases.ts#L201)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership. Existing clients may GET content, authorized files and notifications without reporting Engagement; GET does not create an Engagement event or ACK. Parent must retain child context. revisionLinkId is additive. Authorize exact scoped File/Asset/RevisionAsset before signing. Capability expires within 300 seconds; recipient finite visibleUntil further clips expiry. Issued capability is not retroactively revoked and must not be durably stored.

### GET `/api/v1/parent/notifications`

Source: [ParentNotificationsController.listNotifications](../src/modules/parent-app/notifications/controller/parent-notifications.controller.ts#L64). Actor: **PARENT**. Success: **200**.

Permissions: `communication.notifications.view`.

Request: Query: `ListParentNotificationsQueryDto`. Source-declared response: `Promise<ParentNotificationsListResponseDto>`.

Ownership: Current authenticated app actor and recipient-owned Communication notification/preference/device-token surface; core Communication routes additionally require SCHOOL_USER or ORGANIZATION_USER. Delivery inspection is School-scoped with communication.notifications.manage.

Cache: No explicit handler Cache-Control header. Pagination: page default 1; limit default 50, maximum 100 (source DTO validators and CommunicationNotificationRepository.list/listDeliveries); source repository ordering is retained.

Idempotency: Read/read-all/archive and preference/token state operations follow existing Communication contracts; these are not AcademicContent clientRequestId writes. Notification generation deduplicates by event/recipient/channel.

Version semantics: Communication owns delivery/read/archive facts. ACC deep-link metadata is a historical pointer: follow-up ACC detail must resolve current access/canonical successor. Reading a notification never creates Engagement or ACK.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: ListParentNotificationsUseCase.execute. [ListParentNotificationsUseCase.execute](../src/modules/parent-app/notifications/application/parent-notifications.use-cases.ts#L32)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership. No signed capabilities or Online Session join secrets in notification transport. Push/provider and real app receipt need external evidence; Backend doubles do not prove device delivery.

### GET `/api/v1/parent/notifications/summary`

Source: [ParentNotificationsController.getSummary](../src/modules/parent-app/notifications/controller/parent-notifications.controller.ts#L73). Actor: **PARENT**. Success: **200**.

Permissions: `communication.notifications.view`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-declared response: `Promise<ParentNotificationsSummaryDto>`.

Ownership: Current authenticated app actor and recipient-owned Communication notification/preference/device-token surface; core Communication routes additionally require SCHOOL_USER or ORGANIZATION_USER. Delivery inspection is School-scoped with communication.notifications.manage.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: Read/read-all/archive and preference/token state operations follow existing Communication contracts; these are not AcademicContent clientRequestId writes. Notification generation deduplicates by event/recipient/channel.

Version semantics: Communication owns delivery/read/archive facts. ACC deep-link metadata is a historical pointer: follow-up ACC detail must resolve current access/canonical successor. Reading a notification never creates Engagement or ACK.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: GetParentNotificationsSummaryUseCase.execute. [GetParentNotificationsSummaryUseCase.execute](../src/modules/parent-app/notifications/application/parent-notifications.use-cases.ts#L70)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership. No signed capabilities or Online Session join secrets in notification transport. Push/provider and real app receipt need external evidence; Backend doubles do not prove device delivery.

### POST `/api/v1/parent/notifications/read-all`

Source: [ParentNotificationsController.markAllRead](../src/modules/parent-app/notifications/controller/parent-notifications.controller.ts#L80). Actor: **PARENT**. Success: **201**.

Permissions: `communication.notifications.read`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-declared response: `Promise<ParentNotificationsReadAllResponseDto>`.

Ownership: Current authenticated app actor and recipient-owned Communication notification/preference/device-token surface; core Communication routes additionally require SCHOOL_USER or ORGANIZATION_USER. Delivery inspection is School-scoped with communication.notifications.manage.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: Read/read-all/archive and preference/token state operations follow existing Communication contracts; these are not AcademicContent clientRequestId writes. Notification generation deduplicates by event/recipient/channel.

Version semantics: Communication owns delivery/read/archive facts. ACC deep-link metadata is a historical pointer: follow-up ACC detail must resolve current access/canonical successor. Reading a notification never creates Engagement or ACK.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: MarkAllParentNotificationsReadUseCase.execute. [MarkAllParentNotificationsReadUseCase.execute](../src/modules/parent-app/notifications/application/parent-notifications.use-cases.ts#L105)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership. No signed capabilities or Online Session join secrets in notification transport. Push/provider and real app receipt need external evidence; Backend doubles do not prove device delivery.

### GET `/api/v1/parent/notifications/preferences`

Source: [ParentNotificationsController.getPreferences](../src/modules/parent-app/notifications/controller/parent-notifications.controller.ts#L87). Actor: **PARENT**. Success: **200**.

Permissions: `communication.notifications.view`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-declared response: `Promise<ParentNotificationPreferencesResponseDto>`.

Ownership: Current authenticated app actor and recipient-owned Communication notification/preference/device-token surface; core Communication routes additionally require SCHOOL_USER or ORGANIZATION_USER. Delivery inspection is School-scoped with communication.notifications.manage.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: Read/read-all/archive and preference/token state operations follow existing Communication contracts; these are not AcademicContent clientRequestId writes. Notification generation deduplicates by event/recipient/channel.

Version semantics: Communication owns delivery/read/archive facts. ACC deep-link metadata is a historical pointer: follow-up ACC detail must resolve current access/canonical successor. Reading a notification never creates Engagement or ACK.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: GetParentNotificationPreferencesUseCase.execute. [GetParentNotificationPreferencesUseCase.execute](../src/modules/parent-app/notifications/application/parent-notifications.use-cases.ts#L140)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership. No signed capabilities or Online Session join secrets in notification transport. Push/provider and real app receipt need external evidence; Backend doubles do not prove device delivery.

### PATCH `/api/v1/parent/notifications/preferences`

Source: [ParentNotificationsController.updatePreferences](../src/modules/parent-app/notifications/controller/parent-notifications.controller.ts#L94). Actor: **PARENT**. Success: **200**.

Permissions: `communication.notifications.preferences.manage`.

Request: Body: `UpdateParentNotificationPreferencesDto`. Source-declared response: `Promise<ParentNotificationPreferencesResponseDto>`.

Ownership: Current authenticated app actor and recipient-owned Communication notification/preference/device-token surface; core Communication routes additionally require SCHOOL_USER or ORGANIZATION_USER. Delivery inspection is School-scoped with communication.notifications.manage.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: Read/read-all/archive and preference/token state operations follow existing Communication contracts; these are not AcademicContent clientRequestId writes. Notification generation deduplicates by event/recipient/channel.

Version semantics: Communication owns delivery/read/archive facts. ACC deep-link metadata is a historical pointer: follow-up ACC detail must resolve current access/canonical successor. Reading a notification never creates Engagement or ACK.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: UpdateParentNotificationPreferencesUseCase.execute. [UpdateParentNotificationPreferencesUseCase.execute](../src/modules/parent-app/notifications/application/parent-notifications.use-cases.ts#L158)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership. No signed capabilities or Online Session join secrets in notification transport. Push/provider and real app receipt need external evidence; Backend doubles do not prove device delivery.

### POST `/api/v1/parent/notifications/device-tokens`

Source: [ParentNotificationsController.registerDeviceToken](../src/modules/parent-app/notifications/controller/parent-notifications.controller.ts#L103). Actor: **PARENT**. Success: **201**.

Permissions: `app.device_tokens.manage`.

Request: Body: `RegisterAppDeviceTokenDto`. Source-declared response: `Promise<AppDeviceTokenDualRegisterResponseDto>`.

Ownership: Current authenticated app actor and recipient-owned Communication notification/preference/device-token surface; core Communication routes additionally require SCHOOL_USER or ORGANIZATION_USER. Delivery inspection is School-scoped with communication.notifications.manage.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: Read/read-all/archive and preference/token state operations follow existing Communication contracts; these are not AcademicContent clientRequestId writes. Notification generation deduplicates by event/recipient/channel.

Version semantics: Communication owns delivery/read/archive facts. ACC deep-link metadata is a historical pointer: follow-up ACC detail must resolve current access/canonical successor. Reading a notification never creates Engagement or ACK.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: RegisterParentDeviceTokenUseCase.execute. [RegisterParentDeviceTokenUseCase.execute](../src/modules/parent-app/notifications/application/parent-notifications.use-cases.ts#L179)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership. No signed capabilities or Online Session join secrets in notification transport. Push/provider and real app receipt need external evidence; Backend doubles do not prove device delivery.

### DELETE `/api/v1/parent/notifications/device-tokens/current`

Source: [ParentNotificationsController.unregisterCurrentDeviceToken](../src/modules/parent-app/notifications/controller/parent-notifications.controller.ts#L112). Actor: **PARENT**. Success: **200**.

Permissions: `app.device_tokens.manage`.

Request: Body: `UnregisterAppDeviceTokenDto`. Source-declared response: `Promise<AppDeviceTokenDualUnregisterResponseDto>`.

Ownership: Current authenticated app actor and recipient-owned Communication notification/preference/device-token surface; core Communication routes additionally require SCHOOL_USER or ORGANIZATION_USER. Delivery inspection is School-scoped with communication.notifications.manage.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: Read/read-all/archive and preference/token state operations follow existing Communication contracts; these are not AcademicContent clientRequestId writes. Notification generation deduplicates by event/recipient/channel.

Version semantics: Communication owns delivery/read/archive facts. ACC deep-link metadata is a historical pointer: follow-up ACC detail must resolve current access/canonical successor. Reading a notification never creates Engagement or ACK.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: UnregisterParentDeviceTokenUseCase.execute. [UnregisterParentDeviceTokenUseCase.execute](../src/modules/parent-app/notifications/application/parent-notifications.use-cases.ts#L201)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership. No signed capabilities or Online Session join secrets in notification transport. Push/provider and real app receipt need external evidence; Backend doubles do not prove device delivery.

### GET `/api/v1/parent/notifications/:notificationId`

Source: [ParentNotificationsController.getNotification](../src/modules/parent-app/notifications/controller/parent-notifications.controller.ts#L121). Actor: **PARENT**. Success: **200**.

Permissions: `communication.notifications.view`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-declared response: `Promise<ParentNotificationResponseDto>`.

Ownership: Current authenticated app actor and recipient-owned Communication notification/preference/device-token surface; core Communication routes additionally require SCHOOL_USER or ORGANIZATION_USER. Delivery inspection is School-scoped with communication.notifications.manage.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: Read/read-all/archive and preference/token state operations follow existing Communication contracts; these are not AcademicContent clientRequestId writes. Notification generation deduplicates by event/recipient/channel.

Version semantics: Communication owns delivery/read/archive facts. ACC deep-link metadata is a historical pointer: follow-up ACC detail must resolve current access/canonical successor. Reading a notification never creates Engagement or ACK.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: GetParentNotificationUseCase.execute. [GetParentNotificationUseCase.execute](../src/modules/parent-app/notifications/application/parent-notifications.use-cases.ts#L52)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership. No signed capabilities or Online Session join secrets in notification transport. Push/provider and real app receipt need external evidence; Backend doubles do not prove device delivery.

### POST `/api/v1/parent/notifications/:notificationId/read`

Source: [ParentNotificationsController.markRead](../src/modules/parent-app/notifications/controller/parent-notifications.controller.ts#L130). Actor: **PARENT**. Success: **201**.

Permissions: `communication.notifications.read`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-declared response: `Promise<ParentNotificationResponseDto>`.

Ownership: Current authenticated app actor and recipient-owned Communication notification/preference/device-token surface; core Communication routes additionally require SCHOOL_USER or ORGANIZATION_USER. Delivery inspection is School-scoped with communication.notifications.manage.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: Read/read-all/archive and preference/token state operations follow existing Communication contracts; these are not AcademicContent clientRequestId writes. Notification generation deduplicates by event/recipient/channel.

Version semantics: Communication owns delivery/read/archive facts. ACC deep-link metadata is a historical pointer: follow-up ACC detail must resolve current access/canonical successor. Reading a notification never creates Engagement or ACK.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: MarkParentNotificationReadUseCase.execute. [MarkParentNotificationReadUseCase.execute](../src/modules/parent-app/notifications/application/parent-notifications.use-cases.ts#L87)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership. No signed capabilities or Online Session join secrets in notification transport. Push/provider and real app receipt need external evidence; Backend doubles do not prove device delivery.

### POST `/api/v1/parent/notifications/:notificationId/archive`

Source: [ParentNotificationsController.archive](../src/modules/parent-app/notifications/controller/parent-notifications.controller.ts#L139). Actor: **PARENT**. Success: **201**.

Permissions: `communication.notifications.archive`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-declared response: `Promise<ParentNotificationResponseDto>`.

Ownership: Current authenticated app actor and recipient-owned Communication notification/preference/device-token surface; core Communication routes additionally require SCHOOL_USER or ORGANIZATION_USER. Delivery inspection is School-scoped with communication.notifications.manage.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: Read/read-all/archive and preference/token state operations follow existing Communication contracts; these are not AcademicContent clientRequestId writes. Notification generation deduplicates by event/recipient/channel.

Version semantics: Communication owns delivery/read/archive facts. ACC deep-link metadata is a historical pointer: follow-up ACC detail must resolve current access/canonical successor. Reading a notification never creates Engagement or ACK.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: ArchiveParentNotificationUseCase.execute. [ArchiveParentNotificationUseCase.execute](../src/modules/parent-app/notifications/application/parent-notifications.use-cases.ts#L122)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership. No signed capabilities or Online Session join secrets in notification transport. Push/provider and real app receipt need external evidence; Backend doubles do not prove device delivery.

### POST `/api/v1/student/academic-content/:contentId/engagement-events`

Source: [StudentAcademicContentEngagementController.record](../src/modules/student-app/academic-content/controller/student-academic-content-engagement.controller.ts#L29). Actor: **STUDENT**. Success: **200**.

Permissions: `academics.academic_content.view`.

Request: Body: `RecordAcademicContentEngagementDto`. Source-declared response: `Promise<AcademicContentEngagementResponseDto>`.

Ownership: Current authenticated linked Student, active enrollment and current School/Organization/academic hierarchy; eligible visible canonical publication and matching immutable Revision V2 targets/positive-hour subject allocation. Historical AudienceRecipient is not ACL. Write authority rechecks active membership, current grant and final database-time publication/relationship eligibility under ordered row locks; File/RevisionLink must be an exact live immutable reference.

Cache: no-store, private, max-age=0. Pagination: Not paginated by this endpoint

Idempotency: Unique (schoolId, actorUserId, clientRequestId): identical fingerprint returns the durable event; conflicting payload is 409. Parent child context is part of the fingerprint. Every retry reauthorizes current access and uses shared admission.

Version semantics: Only current visible PUBLISHED canonical publication. Exact immutable V2 details, links and assets; cancelled/expired/scheduled/stale predecessors do not grant current access.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET; rateLimit: 429 with Retry-After: 60; 60 admitted writes/60-second School+actor database window shared with ACK POST; denied admission creates no event; boundedDatabaseFailure: 503 sanitized academic-content unavailable response, with private no-store error caching; no raw SQL/provider cause exposed; staleReference: 404 for stale expectedPublicationId or inaccessible exact immutable file/link.

Application path: RecordStudentAcademicContentEngagementUseCase.execute. [RecordStudentAcademicContentEngagementUseCase.execute](../src/modules/student-app/academic-content/application/student-academic-content.use-cases.ts#L45)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership. Existing clients may GET content, authorized files and notifications without reporting Engagement; GET does not create an Engagement event or ACK. Parent must retain child context. revisionLinkId is additive.

### GET `/api/v1/student/academic-content`

Source: [StudentAcademicContentController.list](../src/modules/student-app/academic-content/controller/student-academic-content.controller.ts#L39). Actor: **STUDENT**. Success: **200**.

Permissions: `academics.academic_content.view`.

Request: Query: `StudentAcademicContentQueryDto`. Source-declared response: `Promise<StudentAcademicContentListResponseDto>`.

Ownership: Current authenticated linked Student, active enrollment and current School/Organization/academic hierarchy; eligible visible canonical publication and matching immutable Revision V2 targets/positive-hour subject allocation. Historical AudienceRecipient is not ACL.

Cache: no-store, private, max-age=0. Pagination: page default 1; limit default 20, maximum 100. Stable visibleFrom DESC/publication id DESC canonical recipient paging.

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Only current visible PUBLISHED canonical publication. Exact immutable V2 details, links and assets; cancelled/expired/scheduled/stale predecessors do not grant current access.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: ListStudentAcademicContentUseCase.execute. [ListStudentAcademicContentUseCase.execute](../src/modules/student-app/academic-content/application/student-academic-content.use-cases.ts#L62)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership. Existing clients may GET content, authorized files and notifications without reporting Engagement; GET does not create an Engagement event or ACK. Parent must retain child context. revisionLinkId is additive.

### GET `/api/v1/student/academic-content/:contentId`

Source: [StudentAcademicContentController.detail](../src/modules/student-app/academic-content/controller/student-academic-content.controller.ts#L49). Actor: **STUDENT**. Success: **200**.

Permissions: `academics.academic_content.view`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-declared response: `Promise<StudentAcademicContentDetailResponseDto>`.

Ownership: Current authenticated linked Student, active enrollment and current School/Organization/academic hierarchy; eligible visible canonical publication and matching immutable Revision V2 targets/positive-hour subject allocation. Historical AudienceRecipient is not ACL.

Cache: no-store, private, max-age=0. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Only current visible PUBLISHED canonical publication. Exact immutable V2 details, links and assets; cancelled/expired/scheduled/stale predecessors do not grant current access.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: GetStudentAcademicContentUseCase.execute. [GetStudentAcademicContentUseCase.execute](../src/modules/student-app/academic-content/application/student-academic-content.use-cases.ts#L83)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership. Existing clients may GET content, authorized files and notifications without reporting Engagement; GET does not create an Engagement event or ACK. Parent must retain child context. revisionLinkId is additive.

### GET `/api/v1/student/academic-content/:contentId/assets/:fileId/access`

Source: [StudentAcademicContentController.assetAccess](../src/modules/student-app/academic-content/controller/student-academic-content.controller.ts#L59). Actor: **STUDENT**. Success: **307**.

Permissions: `academics.academic_content.view`.

Request: Query: `StudentAcademicContentAssetAccessDto`. Source-declared response: `Promise<{ url: string }>`.

Ownership: Current authenticated linked Student, active enrollment and current School/Organization/academic hierarchy; eligible visible canonical publication and matching immutable Revision V2 targets/positive-hour subject allocation. Historical AudienceRecipient is not ACL.

Cache: no-store, private, max-age=0. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Only current visible PUBLISHED canonical publication. Exact immutable V2 details, links and assets; cancelled/expired/scheduled/stale predecessors do not grant current access.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: AccessStudentAcademicContentAssetUseCase.execute. [AccessStudentAcademicContentAssetUseCase.execute](../src/modules/student-app/academic-content/application/student-academic-content.use-cases.ts#L102)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership. Existing clients may GET content, authorized files and notifications without reporting Engagement; GET does not create an Engagement event or ACK. Parent must retain child context. revisionLinkId is additive. Authorize exact scoped File/Asset/RevisionAsset before signing. Capability expires within 300 seconds; recipient finite visibleUntil further clips expiry. Issued capability is not retroactively revoked and must not be durably stored.

### GET `/api/v1/student/notifications`

Source: [StudentNotificationsController.listNotifications](../src/modules/student-app/notifications/controller/student-notifications.controller.ts#L64). Actor: **STUDENT**. Success: **200**.

Permissions: `communication.notifications.view`.

Request: Query: `ListStudentNotificationsQueryDto`. Source-declared response: `Promise<StudentNotificationsListResponseDto>`.

Ownership: Current authenticated app actor and recipient-owned Communication notification/preference/device-token surface; core Communication routes additionally require SCHOOL_USER or ORGANIZATION_USER. Delivery inspection is School-scoped with communication.notifications.manage.

Cache: No explicit handler Cache-Control header. Pagination: page default 1; limit default 50, maximum 100 (source DTO validators and CommunicationNotificationRepository.list/listDeliveries); source repository ordering is retained.

Idempotency: Read/read-all/archive and preference/token state operations follow existing Communication contracts; these are not AcademicContent clientRequestId writes. Notification generation deduplicates by event/recipient/channel.

Version semantics: Communication owns delivery/read/archive facts. ACC deep-link metadata is a historical pointer: follow-up ACC detail must resolve current access/canonical successor. Reading a notification never creates Engagement or ACK.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: ListStudentNotificationsUseCase.execute. [ListStudentNotificationsUseCase.execute](../src/modules/student-app/notifications/application/student-notifications.use-cases.ts#L32)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership. No signed capabilities or Online Session join secrets in notification transport. Push/provider and real app receipt need external evidence; Backend doubles do not prove device delivery.

### GET `/api/v1/student/notifications/summary`

Source: [StudentNotificationsController.getSummary](../src/modules/student-app/notifications/controller/student-notifications.controller.ts#L73). Actor: **STUDENT**. Success: **200**.

Permissions: `communication.notifications.view`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-declared response: `Promise<StudentNotificationsSummaryDto>`.

Ownership: Current authenticated app actor and recipient-owned Communication notification/preference/device-token surface; core Communication routes additionally require SCHOOL_USER or ORGANIZATION_USER. Delivery inspection is School-scoped with communication.notifications.manage.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: Read/read-all/archive and preference/token state operations follow existing Communication contracts; these are not AcademicContent clientRequestId writes. Notification generation deduplicates by event/recipient/channel.

Version semantics: Communication owns delivery/read/archive facts. ACC deep-link metadata is a historical pointer: follow-up ACC detail must resolve current access/canonical successor. Reading a notification never creates Engagement or ACK.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: GetStudentNotificationsSummaryUseCase.execute. [GetStudentNotificationsSummaryUseCase.execute](../src/modules/student-app/notifications/application/student-notifications.use-cases.ts#L72)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership. No signed capabilities or Online Session join secrets in notification transport. Push/provider and real app receipt need external evidence; Backend doubles do not prove device delivery.

### POST `/api/v1/student/notifications/read-all`

Source: [StudentNotificationsController.markAllRead](../src/modules/student-app/notifications/controller/student-notifications.controller.ts#L80). Actor: **STUDENT**. Success: **201**.

Permissions: `communication.notifications.read`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-declared response: `Promise<StudentNotificationsReadAllResponseDto>`.

Ownership: Current authenticated app actor and recipient-owned Communication notification/preference/device-token surface; core Communication routes additionally require SCHOOL_USER or ORGANIZATION_USER. Delivery inspection is School-scoped with communication.notifications.manage.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: Read/read-all/archive and preference/token state operations follow existing Communication contracts; these are not AcademicContent clientRequestId writes. Notification generation deduplicates by event/recipient/channel.

Version semantics: Communication owns delivery/read/archive facts. ACC deep-link metadata is a historical pointer: follow-up ACC detail must resolve current access/canonical successor. Reading a notification never creates Engagement or ACK.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: MarkAllStudentNotificationsReadUseCase.execute. [MarkAllStudentNotificationsReadUseCase.execute](../src/modules/student-app/notifications/application/student-notifications.use-cases.ts#L109)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership. No signed capabilities or Online Session join secrets in notification transport. Push/provider and real app receipt need external evidence; Backend doubles do not prove device delivery.

### GET `/api/v1/student/notifications/preferences`

Source: [StudentNotificationsController.getPreferences](../src/modules/student-app/notifications/controller/student-notifications.controller.ts#L87). Actor: **STUDENT**. Success: **200**.

Permissions: `communication.notifications.view`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-declared response: `Promise<StudentNotificationPreferencesResponseDto>`.

Ownership: Current authenticated app actor and recipient-owned Communication notification/preference/device-token surface; core Communication routes additionally require SCHOOL_USER or ORGANIZATION_USER. Delivery inspection is School-scoped with communication.notifications.manage.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: Read/read-all/archive and preference/token state operations follow existing Communication contracts; these are not AcademicContent clientRequestId writes. Notification generation deduplicates by event/recipient/channel.

Version semantics: Communication owns delivery/read/archive facts. ACC deep-link metadata is a historical pointer: follow-up ACC detail must resolve current access/canonical successor. Reading a notification never creates Engagement or ACK.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: GetStudentNotificationPreferencesUseCase.execute. [GetStudentNotificationPreferencesUseCase.execute](../src/modules/student-app/notifications/application/student-notifications.use-cases.ts#L146)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership. No signed capabilities or Online Session join secrets in notification transport. Push/provider and real app receipt need external evidence; Backend doubles do not prove device delivery.

### PATCH `/api/v1/student/notifications/preferences`

Source: [StudentNotificationsController.updatePreferences](../src/modules/student-app/notifications/controller/student-notifications.controller.ts#L94). Actor: **STUDENT**. Success: **200**.

Permissions: `communication.notifications.preferences.manage`.

Request: Body: `UpdateStudentNotificationPreferencesDto`. Source-declared response: `Promise<StudentNotificationPreferencesResponseDto>`.

Ownership: Current authenticated app actor and recipient-owned Communication notification/preference/device-token surface; core Communication routes additionally require SCHOOL_USER or ORGANIZATION_USER. Delivery inspection is School-scoped with communication.notifications.manage.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: Read/read-all/archive and preference/token state operations follow existing Communication contracts; these are not AcademicContent clientRequestId writes. Notification generation deduplicates by event/recipient/channel.

Version semantics: Communication owns delivery/read/archive facts. ACC deep-link metadata is a historical pointer: follow-up ACC detail must resolve current access/canonical successor. Reading a notification never creates Engagement or ACK.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: UpdateStudentNotificationPreferencesUseCase.execute. [UpdateStudentNotificationPreferencesUseCase.execute](../src/modules/student-app/notifications/application/student-notifications.use-cases.ts#L211)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership. No signed capabilities or Online Session join secrets in notification transport. Push/provider and real app receipt need external evidence; Backend doubles do not prove device delivery.

### POST `/api/v1/student/notifications/device-tokens`

Source: [StudentNotificationsController.registerDeviceToken](../src/modules/student-app/notifications/controller/student-notifications.controller.ts#L103). Actor: **STUDENT**. Success: **201**.

Permissions: `app.device_tokens.manage`.

Request: Body: `RegisterAppDeviceTokenDto`. Source-declared response: `Promise<AppDeviceTokenDualRegisterResponseDto>`.

Ownership: Current authenticated app actor and recipient-owned Communication notification/preference/device-token surface; core Communication routes additionally require SCHOOL_USER or ORGANIZATION_USER. Delivery inspection is School-scoped with communication.notifications.manage.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: Read/read-all/archive and preference/token state operations follow existing Communication contracts; these are not AcademicContent clientRequestId writes. Notification generation deduplicates by event/recipient/channel.

Version semantics: Communication owns delivery/read/archive facts. ACC deep-link metadata is a historical pointer: follow-up ACC detail must resolve current access/canonical successor. Reading a notification never creates Engagement or ACK.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: RegisterStudentDeviceTokenUseCase.execute. [RegisterStudentDeviceTokenUseCase.execute](../src/modules/student-app/notifications/application/student-notifications.use-cases.ts#L165)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership. No signed capabilities or Online Session join secrets in notification transport. Push/provider and real app receipt need external evidence; Backend doubles do not prove device delivery.

### DELETE `/api/v1/student/notifications/device-tokens/current`

Source: [StudentNotificationsController.unregisterCurrentDeviceToken](../src/modules/student-app/notifications/controller/student-notifications.controller.ts#L112). Actor: **STUDENT**. Success: **200**.

Permissions: `app.device_tokens.manage`.

Request: Body: `UnregisterAppDeviceTokenDto`. Source-declared response: `Promise<AppDeviceTokenDualUnregisterResponseDto>`.

Ownership: Current authenticated app actor and recipient-owned Communication notification/preference/device-token surface; core Communication routes additionally require SCHOOL_USER or ORGANIZATION_USER. Delivery inspection is School-scoped with communication.notifications.manage.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: Read/read-all/archive and preference/token state operations follow existing Communication contracts; these are not AcademicContent clientRequestId writes. Notification generation deduplicates by event/recipient/channel.

Version semantics: Communication owns delivery/read/archive facts. ACC deep-link metadata is a historical pointer: follow-up ACC detail must resolve current access/canonical successor. Reading a notification never creates Engagement or ACK.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: UnregisterStudentDeviceTokenUseCase.execute. [UnregisterStudentDeviceTokenUseCase.execute](../src/modules/student-app/notifications/application/student-notifications.use-cases.ts#L188)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership. No signed capabilities or Online Session join secrets in notification transport. Push/provider and real app receipt need external evidence; Backend doubles do not prove device delivery.

### GET `/api/v1/student/notifications/:notificationId`

Source: [StudentNotificationsController.getNotification](../src/modules/student-app/notifications/controller/student-notifications.controller.ts#L121). Actor: **STUDENT**. Success: **200**.

Permissions: `communication.notifications.view`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-declared response: `Promise<StudentNotificationResponseDto>`.

Ownership: Current authenticated app actor and recipient-owned Communication notification/preference/device-token surface; core Communication routes additionally require SCHOOL_USER or ORGANIZATION_USER. Delivery inspection is School-scoped with communication.notifications.manage.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: Read/read-all/archive and preference/token state operations follow existing Communication contracts; these are not AcademicContent clientRequestId writes. Notification generation deduplicates by event/recipient/channel.

Version semantics: Communication owns delivery/read/archive facts. ACC deep-link metadata is a historical pointer: follow-up ACC detail must resolve current access/canonical successor. Reading a notification never creates Engagement or ACK.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: GetStudentNotificationUseCase.execute. [GetStudentNotificationUseCase.execute](../src/modules/student-app/notifications/application/student-notifications.use-cases.ts#L53)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership. No signed capabilities or Online Session join secrets in notification transport. Push/provider and real app receipt need external evidence; Backend doubles do not prove device delivery.

### POST `/api/v1/student/notifications/:notificationId/read`

Source: [StudentNotificationsController.markRead](../src/modules/student-app/notifications/controller/student-notifications.controller.ts#L130). Actor: **STUDENT**. Success: **201**.

Permissions: `communication.notifications.read`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-declared response: `Promise<StudentNotificationResponseDto>`.

Ownership: Current authenticated app actor and recipient-owned Communication notification/preference/device-token surface; core Communication routes additionally require SCHOOL_USER or ORGANIZATION_USER. Delivery inspection is School-scoped with communication.notifications.manage.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: Read/read-all/archive and preference/token state operations follow existing Communication contracts; these are not AcademicContent clientRequestId writes. Notification generation deduplicates by event/recipient/channel.

Version semantics: Communication owns delivery/read/archive facts. ACC deep-link metadata is a historical pointer: follow-up ACC detail must resolve current access/canonical successor. Reading a notification never creates Engagement or ACK.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: MarkStudentNotificationReadUseCase.execute. [MarkStudentNotificationReadUseCase.execute](../src/modules/student-app/notifications/application/student-notifications.use-cases.ts#L90)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership. No signed capabilities or Online Session join secrets in notification transport. Push/provider and real app receipt need external evidence; Backend doubles do not prove device delivery.

### POST `/api/v1/student/notifications/:notificationId/archive`

Source: [StudentNotificationsController.archive](../src/modules/student-app/notifications/controller/student-notifications.controller.ts#L139). Actor: **STUDENT**. Success: **201**.

Permissions: `communication.notifications.archive`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-declared response: `Promise<StudentNotificationResponseDto>`.

Ownership: Current authenticated app actor and recipient-owned Communication notification/preference/device-token surface; core Communication routes additionally require SCHOOL_USER or ORGANIZATION_USER. Delivery inspection is School-scoped with communication.notifications.manage.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: Read/read-all/archive and preference/token state operations follow existing Communication contracts; these are not AcademicContent clientRequestId writes. Notification generation deduplicates by event/recipient/channel.

Version semantics: Communication owns delivery/read/archive facts. ACC deep-link metadata is a historical pointer: follow-up ACC detail must resolve current access/canonical successor. Reading a notification never creates Engagement or ACK.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: ArchiveStudentNotificationUseCase.execute. [ArchiveStudentNotificationUseCase.execute](../src/modules/student-app/notifications/application/student-notifications.use-cases.ts#L127)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership. No signed capabilities or Online Session join secrets in notification transport. Push/provider and real app receipt need external evidence; Backend doubles do not prove device delivery.

### GET `/api/v1/teacher/academic-content/:contentId/analytics`

Source: [TeacherAcademicContentAnalyticsController.content](../src/modules/teacher-app/academic-content/controller/teacher-academic-content-analytics.controller.ts#L29). Actor: **TEACHER**. Success: **200**.

Permissions: `academics.academic_content.view`, `academics.academic_content.analytics.own.view`.

Request: Query: `TeacherAcademicContentAnalyticsQueryDto`. Source-declared response: `{ type: TeacherAcademicContentAnalyticsResponseDto }`.

Ownership: Strict current Teacher actor, exact Content creator, ALL current targets and ALL included historical Revision targets currently owned; no partial mixed-target disclosure or School-wide permission substitution.

Cache: no-store, private, max-age=0. Pagination: Not paginated by this endpoint

Idempotency: Read-only aggregate; no writes or admission consumption

Version semantics: Content totals include permitted historical published/cancelled/expired/superseded publications while currently owned; exact-publication route never falls back to successor. Content with zero eligible publications returns a zero aggregate.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET; boundedDatabaseFailure: Sanitized bounded 503; private no-store applies to successful/error responses.

Application path: TeacherAcademicContentAnalyticsUseCase.execute. [TeacherAcademicContentAnalyticsUseCase.execute](../src/modules/teacher-app/academic-content/application/teacher-academic-content-analytics.use-case.ts#L32)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership. Only range=7d|30d|90d (default 30d), one UTC half-open window; counts are decimal strings in ten fixed event/actor bins. No identities, raw events, recipient timelines, rates or arbitrary School slicing.

### GET `/api/v1/teacher/academic-content/:contentId/publications/:publicationId/analytics`

Source: [TeacherAcademicContentAnalyticsController.publication](../src/modules/teacher-app/academic-content/controller/teacher-academic-content-analytics.controller.ts#L40). Actor: **TEACHER**. Success: **200**.

Permissions: `academics.academic_content.view`, `academics.academic_content.analytics.own.view`.

Request: Query: `TeacherAcademicContentAnalyticsQueryDto`. Source-declared response: `{ type: TeacherAcademicContentAnalyticsResponseDto }`.

Ownership: Strict current Teacher actor, exact Content creator, ALL current targets and ALL included historical Revision targets currently owned; no partial mixed-target disclosure or School-wide permission substitution.

Cache: no-store, private, max-age=0. Pagination: Not paginated by this endpoint

Idempotency: Read-only aggregate; no writes or admission consumption

Version semantics: Content totals include permitted historical published/cancelled/expired/superseded publications while currently owned; exact-publication route never falls back to successor. Content with zero eligible publications returns a zero aggregate.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET; boundedDatabaseFailure: Sanitized bounded 503; private no-store applies to successful/error responses.

Application path: TeacherAcademicContentAnalyticsUseCase.execute. [TeacherAcademicContentAnalyticsUseCase.execute](../src/modules/teacher-app/academic-content/application/teacher-academic-content-analytics.use-case.ts#L32)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership. Only range=7d|30d|90d (default 30d), one UTC half-open window; counts are decimal strings in ten fixed event/actor bins. No identities, raw events, recipient timelines, rates or arbitrary School slicing.

### POST `/api/v1/teacher/classes/:classId/academic-content`

Source: [TeacherAcademicContentAuthoringController.create](../src/modules/teacher-app/academic-content/controller/teacher-academic-content-authoring.controller.ts#L61). Actor: **TEACHER**. Success: **201**.

Permissions: `academics.academic_content.manage`.

Request: Body: `CreateTeacherAcademicContentDto`. Source-inferred response (no explicit response DTO): `Promise<import("src/modules/academics/academic-content/dto/academic-content-response.dto").AcademicContentResponseDto>`.

Ownership: Current TEACHER identity, server-resolved School, exact Content creator and current positive-hour TeacherSubjectAllocation ownership for all relevant targets; class/template routes resolve the current owned class allocation. Historical revision/publication reads retain current Teacher authorization.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Delegates to the core immutable revision/workflow/publication mechanisms after current Teacher allocation checks; Teacher Preparation cannot be externally published or self-approved through Teacher routes.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: TeacherAcademicContentAuthoringUseCases.create. [TeacherAcademicContentAuthoringUseCases.create](../src/modules/teacher-app/academic-content/application/teacher-academic-content-authoring.use-cases.ts#L51)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### PATCH `/api/v1/teacher/academic-content/:contentId`

Source: [TeacherAcademicContentAuthoringController.update](../src/modules/teacher-app/academic-content/controller/teacher-academic-content-authoring.controller.ts#L70). Actor: **TEACHER**. Success: **200**.

Permissions: `academics.academic_content.manage`.

Request: Body: `UpdateAcademicContentDto`. Source-inferred response (no explicit response DTO): `Promise<import("src/modules/academics/academic-content/dto/academic-content-response.dto").AcademicContentResponseDto>`.

Ownership: Current TEACHER identity, server-resolved School, exact Content creator and current positive-hour TeacherSubjectAllocation ownership for all relevant targets; class/template routes resolve the current owned class allocation. Historical revision/publication reads retain current Teacher authorization.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Delegates to the core immutable revision/workflow/publication mechanisms after current Teacher allocation checks; Teacher Preparation cannot be externally published or self-approved through Teacher routes.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: TeacherAcademicContentAuthoringUseCases.update. [TeacherAcademicContentAuthoringUseCases.update](../src/modules/teacher-app/academic-content/application/teacher-academic-content-authoring.use-cases.ts#L58)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### DELETE `/api/v1/teacher/academic-content/:contentId`

Source: [TeacherAcademicContentAuthoringController.delete](../src/modules/teacher-app/academic-content/controller/teacher-academic-content-authoring.controller.ts#L79). Actor: **TEACHER**. Success: **200**.

Permissions: `academics.academic_content.manage`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-inferred response (no explicit response DTO): `Promise<{ ok: boolean; }>`.

Ownership: Current TEACHER identity, server-resolved School, exact Content creator and current positive-hour TeacherSubjectAllocation ownership for all relevant targets; class/template routes resolve the current owned class allocation. Historical revision/publication reads retain current Teacher authorization.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Delegates to the core immutable revision/workflow/publication mechanisms after current Teacher allocation checks; Teacher Preparation cannot be externally published or self-approved through Teacher routes.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: TeacherAcademicContentAuthoringUseCases.delete. [TeacherAcademicContentAuthoringUseCases.delete](../src/modules/teacher-app/academic-content/application/teacher-academic-content-authoring.use-cases.ts#L81)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### POST `/api/v1/teacher/academic-content/:contentId/archive`

Source: [TeacherAcademicContentAuthoringController.archive](../src/modules/teacher-app/academic-content/controller/teacher-academic-content-authoring.controller.ts#L86). Actor: **TEACHER**. Success: **200**.

Permissions: `academics.academic_content.manage`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-inferred response (no explicit response DTO): `Promise<import("src/modules/academics/academic-content/dto/academic-content-response.dto").AcademicContentResponseDto>`.

Ownership: Current TEACHER identity, server-resolved School, exact Content creator and current positive-hour TeacherSubjectAllocation ownership for all relevant targets; class/template routes resolve the current owned class allocation. Historical revision/publication reads retain current Teacher authorization.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Delegates to the core immutable revision/workflow/publication mechanisms after current Teacher allocation checks; Teacher Preparation cannot be externally published or self-approved through Teacher routes.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: TeacherAcademicContentAuthoringUseCases.archive. [TeacherAcademicContentAuthoringUseCases.archive](../src/modules/teacher-app/academic-content/application/teacher-academic-content-authoring.use-cases.ts#L65)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### POST `/api/v1/teacher/academic-content/:contentId/restore`

Source: [TeacherAcademicContentAuthoringController.restore](../src/modules/teacher-app/academic-content/controller/teacher-academic-content-authoring.controller.ts#L93). Actor: **TEACHER**. Success: **200**.

Permissions: `academics.academic_content.manage`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-inferred response (no explicit response DTO): `Promise<import("src/modules/academics/academic-content/dto/academic-content-response.dto").AcademicContentResponseDto>`.

Ownership: Current TEACHER identity, server-resolved School, exact Content creator and current positive-hour TeacherSubjectAllocation ownership for all relevant targets; class/template routes resolve the current owned class allocation. Historical revision/publication reads retain current Teacher authorization.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Delegates to the core immutable revision/workflow/publication mechanisms after current Teacher allocation checks; Teacher Preparation cannot be externally published or self-approved through Teacher routes.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: TeacherAcademicContentAuthoringUseCases.restore. [TeacherAcademicContentAuthoringUseCases.restore](../src/modules/teacher-app/academic-content/application/teacher-academic-content-authoring.use-cases.ts#L73)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### PUT `/api/v1/teacher/academic-content/:contentId/targets`

Source: [TeacherAcademicContentAuthoringController.targets](../src/modules/teacher-app/academic-content/controller/teacher-academic-content-authoring.controller.ts#L100). Actor: **TEACHER**. Success: **200**.

Permissions: `academics.academic_content.manage`.

Request: Body: `ReplaceTeacherAcademicContentTargetsDto`. Source-inferred response (no explicit response DTO): `Promise<import("src/modules/academics/academic-content/dto/academic-content-response.dto").AcademicContentTargetsResponseDto>`.

Ownership: Current TEACHER identity, server-resolved School, exact Content creator and current positive-hour TeacherSubjectAllocation ownership for all relevant targets; class/template routes resolve the current owned class allocation. Historical revision/publication reads retain current Teacher authorization.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Delegates to the core immutable revision/workflow/publication mechanisms after current Teacher allocation checks; Teacher Preparation cannot be externally published or self-approved through Teacher routes.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: TeacherAcademicContentAuthoringUseCases.targets. [TeacherAcademicContentAuthoringUseCases.targets](../src/modules/teacher-app/academic-content/application/teacher-academic-content-authoring.use-cases.ts#L89)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### PUT `/api/v1/teacher/academic-content/:contentId/details/preparation`

Source: [TeacherAcademicContentAuthoringController.preparation](../src/modules/teacher-app/academic-content/controller/teacher-academic-content-authoring.controller.ts#L109). Actor: **TEACHER**. Success: **200**.

Permissions: `academics.academic_content.manage`.

Request: Body: `ReplaceAcademicContentPreparationDetailDto`. Source-inferred response (no explicit response DTO): `Promise<import("src/modules/academics/academic-content/dto/academic-content-type-detail.dto").AcademicContentPreparationDetailResponseDto>`.

Ownership: Current TEACHER identity, server-resolved School, exact Content creator and current positive-hour TeacherSubjectAllocation ownership for all relevant targets; class/template routes resolve the current owned class allocation. Historical revision/publication reads retain current Teacher authorization.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Delegates to the core immutable revision/workflow/publication mechanisms after current Teacher allocation checks; Teacher Preparation cannot be externally published or self-approved through Teacher routes.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: TeacherAcademicContentAuthoringUseCases.preparation. [TeacherAcademicContentAuthoringUseCases.preparation](../src/modules/teacher-app/academic-content/application/teacher-academic-content-authoring.use-cases.ts#L97)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### PUT `/api/v1/teacher/academic-content/:contentId/details/weekly-plan`

Source: [TeacherAcademicContentAuthoringController.weeklyPlan](../src/modules/teacher-app/academic-content/controller/teacher-academic-content-authoring.controller.ts#L121). Actor: **TEACHER**. Success: **200**.

Permissions: `academics.academic_content.manage`.

Request: Body: `ReplaceAcademicContentWeeklyPlanDetailDto`. Source-inferred response (no explicit response DTO): `Promise<import("src/modules/academics/academic-content/dto/academic-content-type-detail.dto").AcademicContentWeeklyPlanDetailResponseDto>`.

Ownership: Current TEACHER identity, server-resolved School, exact Content creator and current positive-hour TeacherSubjectAllocation ownership for all relevant targets; class/template routes resolve the current owned class allocation. Historical revision/publication reads retain current Teacher authorization.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Delegates to the core immutable revision/workflow/publication mechanisms after current Teacher allocation checks; Teacher Preparation cannot be externally published or self-approved through Teacher routes.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: TeacherAcademicContentAuthoringUseCases.weeklyPlan. [TeacherAcademicContentAuthoringUseCases.weeklyPlan](../src/modules/teacher-app/academic-content/application/teacher-academic-content-authoring.use-cases.ts#L109)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### PUT `/api/v1/teacher/academic-content/:contentId/details/guardian-note`

Source: [TeacherAcademicContentAuthoringController.guardianNote](../src/modules/teacher-app/academic-content/controller/teacher-academic-content-authoring.controller.ts#L136). Actor: **TEACHER**. Success: **200**.

Permissions: `academics.academic_content.manage`.

Request: Body: `ReplaceAcademicContentGuardianNoteDetailDto`. Source-inferred response (no explicit response DTO): `Promise<import("src/modules/academics/academic-content/dto/academic-content-type-detail.dto").AcademicContentGuardianNoteDetailResponseDto>`.

Ownership: Current TEACHER identity, server-resolved School, exact Content creator and current positive-hour TeacherSubjectAllocation ownership for all relevant targets; class/template routes resolve the current owned class allocation. Historical revision/publication reads retain current Teacher authorization.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Delegates to the core immutable revision/workflow/publication mechanisms after current Teacher allocation checks; Teacher Preparation cannot be externally published or self-approved through Teacher routes.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: TeacherAcademicContentAuthoringUseCases.guardianNote. [TeacherAcademicContentAuthoringUseCases.guardianNote](../src/modules/teacher-app/academic-content/application/teacher-academic-content-authoring.use-cases.ts#L117)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### PUT `/api/v1/teacher/academic-content/:contentId/details/subject-resource`

Source: [TeacherAcademicContentAuthoringController.subjectResource](../src/modules/teacher-app/academic-content/controller/teacher-academic-content-authoring.controller.ts#L148). Actor: **TEACHER**. Success: **200**.

Permissions: `academics.academic_content.manage`.

Request: Body: `ReplaceAcademicContentSubjectResourceDetailDto`. Source-inferred response (no explicit response DTO): `Promise<import("src/modules/academics/academic-content/dto/academic-content-type-detail.dto").AcademicContentSubjectResourceDetailResponseDto>`.

Ownership: Current TEACHER identity, server-resolved School, exact Content creator and current positive-hour TeacherSubjectAllocation ownership for all relevant targets; class/template routes resolve the current owned class allocation. Historical revision/publication reads retain current Teacher authorization.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Delegates to the core immutable revision/workflow/publication mechanisms after current Teacher allocation checks; Teacher Preparation cannot be externally published or self-approved through Teacher routes.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: TeacherAcademicContentAuthoringUseCases.subjectResource. [TeacherAcademicContentAuthoringUseCases.subjectResource](../src/modules/teacher-app/academic-content/application/teacher-academic-content-authoring.use-cases.ts#L129)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### PUT `/api/v1/teacher/academic-content/:contentId/details/online-session`

Source: [TeacherAcademicContentAuthoringController.onlineSession](../src/modules/teacher-app/academic-content/controller/teacher-academic-content-authoring.controller.ts#L160). Actor: **TEACHER**. Success: **200**.

Permissions: `academics.academic_content.manage`.

Request: Body: `ReplaceAcademicContentOnlineSessionDetailDto`. Source-inferred response (no explicit response DTO): `Promise<import("src/modules/academics/academic-content/dto/academic-content-type-detail.dto").AcademicContentOnlineSessionDetailResponseDto>`.

Ownership: Current TEACHER identity, server-resolved School, exact Content creator and current positive-hour TeacherSubjectAllocation ownership for all relevant targets; class/template routes resolve the current owned class allocation. Historical revision/publication reads retain current Teacher authorization.

Cache: no-store, private, max-age=0. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Delegates to the core immutable revision/workflow/publication mechanisms after current Teacher allocation checks; Teacher Preparation cannot be externally published or self-approved through Teacher routes.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: TeacherAcademicContentAuthoringUseCases.onlineSession. [TeacherAcademicContentAuthoringUseCases.onlineSession](../src/modules/teacher-app/academic-content/application/teacher-academic-content-authoring.use-cases.ts#L141)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### PUT `/api/v1/teacher/academic-content/:contentId/links`

Source: [TeacherAcademicContentAuthoringController.links](../src/modules/teacher-app/academic-content/controller/teacher-academic-content-authoring.controller.ts#L176). Actor: **TEACHER**. Success: **200**.

Permissions: `academics.academic_content.manage`.

Request: Body: `ReplaceAcademicContentLinksDto`. Source-inferred response (no explicit response DTO): `Promise<import("src/modules/academics/academic-content/dto/academic-content-response.dto").AcademicContentLinksResponseDto>`.

Ownership: Current TEACHER identity, server-resolved School, exact Content creator and current positive-hour TeacherSubjectAllocation ownership for all relevant targets; class/template routes resolve the current owned class allocation. Historical revision/publication reads retain current Teacher authorization.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Delegates to the core immutable revision/workflow/publication mechanisms after current Teacher allocation checks; Teacher Preparation cannot be externally published or self-approved through Teacher routes.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: TeacherAcademicContentAuthoringUseCases.links. [TeacherAcademicContentAuthoringUseCases.links](../src/modules/teacher-app/academic-content/application/teacher-academic-content-authoring.use-cases.ts#L153)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### PUT `/api/v1/teacher/academic-content/:contentId/tags`

Source: [TeacherAcademicContentAuthoringController.tags](../src/modules/teacher-app/academic-content/controller/teacher-academic-content-authoring.controller.ts#L187). Actor: **TEACHER**. Success: **200**.

Permissions: `academics.academic_content.manage`.

Request: Body: `ReplaceAcademicContentTagsDto`. Source-inferred response (no explicit response DTO): `Promise<import("src/modules/academics/academic-content/dto/academic-content-response.dto").AcademicContentTagsResponseDto>`.

Ownership: Current TEACHER identity, server-resolved School, exact Content creator and current positive-hour TeacherSubjectAllocation ownership for all relevant targets; class/template routes resolve the current owned class allocation. Historical revision/publication reads retain current Teacher authorization.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Delegates to the core immutable revision/workflow/publication mechanisms after current Teacher allocation checks; Teacher Preparation cannot be externally published or self-approved through Teacher routes.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: TeacherAcademicContentAuthoringUseCases.tags. [TeacherAcademicContentAuthoringUseCases.tags](../src/modules/teacher-app/academic-content/application/teacher-academic-content-authoring.use-cases.ts#L160)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### GET `/api/v1/teacher/academic-content/:contentId/readiness`

Source: [TeacherAcademicContentAuthoringController.readiness](../src/modules/teacher-app/academic-content/controller/teacher-academic-content-authoring.controller.ts#L196). Actor: **TEACHER**. Success: **200**.

Permissions: `academics.academic_content.view`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-inferred response (no explicit response DTO): `Promise<import("src/modules/academics/academic-content/dto/academic-content-response.dto").AcademicContentReadinessResponseDto>`.

Ownership: Current TEACHER identity, server-resolved School, exact Content creator and current positive-hour TeacherSubjectAllocation ownership for all relevant targets; class/template routes resolve the current owned class allocation. Historical revision/publication reads retain current Teacher authorization.

Cache: no-store, private, max-age=0. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Delegates to the core immutable revision/workflow/publication mechanisms after current Teacher allocation checks; Teacher Preparation cannot be externally published or self-approved through Teacher routes.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: TeacherAcademicContentAuthoringUseCases.readiness. [TeacherAcademicContentAuthoringUseCases.readiness](../src/modules/teacher-app/academic-content/application/teacher-academic-content-authoring.use-cases.ts#L167)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### POST `/api/v1/teacher/academic-content/:contentId/uploads`

Source: [TeacherAcademicContentFilesController.uploadIntent](../src/modules/teacher-app/academic-content/controller/teacher-academic-content-files.controller.ts#L36). Actor: **TEACHER**. Success: **201**.

Permissions: `academics.academic_content.manage`.

Request: Body: `CreateAcademicContentUploadDto`. Source-inferred response (no explicit response DTO): `Promise<import("src/modules/academics/academic-content/dto/academic-content-response.dto").AcademicContentUploadIntentResponseDto>`.

Ownership: Current TEACHER identity, server-resolved School, exact Content creator and current positive-hour TeacherSubjectAllocation ownership for all relevant targets; class/template routes resolve the current owned class allocation. Historical revision/publication reads retain current Teacher authorization.

Cache: no-store, private, max-age=0. Pagination: Not paginated by this endpoint

Idempotency: Persisted upload-session clientRequestId/fingerprint; identical intent retries reauthorize and return existing eligible session; conflicting payload is 409.

Version semantics: Delegates to the core immutable revision/workflow/publication mechanisms after current Teacher allocation checks; Teacher Preparation cannot be externally published or self-approved through Teacher routes.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: TeacherAcademicContentFilesUseCases.uploadIntent. [TeacherAcademicContentFilesUseCases.uploadIntent](../src/modules/teacher-app/academic-content/application/teacher-academic-content-files.use-cases.ts#L52)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership. Origin authority comes only from HTTP Origin header, validated against both app and storage CORS allowlists; never from request JSON. GCS supports resumable uploads; MinIO resumable intent rejects with 409 before persistence.

### POST `/api/v1/teacher/academic-content/:contentId/uploads/:uploadId/complete`

Source: [TeacherAcademicContentFilesController.complete](../src/modules/teacher-app/academic-content/controller/teacher-academic-content-files.controller.ts#L49). Actor: **TEACHER**. Success: **200**.

Permissions: `academics.academic_content.manage`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-inferred response (no explicit response DTO): `Promise<import("src/modules/academics/academic-content/dto/academic-content-response.dto").AcademicContentUploadCompleteResponseDto>`.

Ownership: Current TEACHER identity, server-resolved School, exact Content creator and current positive-hour TeacherSubjectAllocation ownership for all relevant targets; class/template routes resolve the current owned class allocation. Historical revision/publication reads retain current Teacher authorization.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Delegates to the core immutable revision/workflow/publication mechanisms after current Teacher allocation checks; Teacher Preparation cannot be externally published or self-approved through Teacher routes.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: TeacherAcademicContentFilesUseCases.complete. [TeacherAcademicContentFilesUseCases.complete](../src/modules/teacher-app/academic-content/application/teacher-academic-content-files.use-cases.ts#L83)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### POST `/api/v1/teacher/academic-content/:contentId/uploads/:uploadId/cancel`

Source: [TeacherAcademicContentFilesController.cancel](../src/modules/teacher-app/academic-content/controller/teacher-academic-content-files.controller.ts#L61). Actor: **TEACHER**. Success: **200**.

Permissions: `academics.academic_content.manage`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-inferred response (no explicit response DTO): `Promise<import("src/modules/academics/academic-content/dto/academic-content-response.dto").AcademicContentUploadCancelResponseDto>`.

Ownership: Current TEACHER identity, server-resolved School, exact Content creator and current positive-hour TeacherSubjectAllocation ownership for all relevant targets; class/template routes resolve the current owned class allocation. Historical revision/publication reads retain current Teacher authorization.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Delegates to the core immutable revision/workflow/publication mechanisms after current Teacher allocation checks; Teacher Preparation cannot be externally published or self-approved through Teacher routes.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: TeacherAcademicContentFilesUseCases.cancel. [TeacherAcademicContentFilesUseCases.cancel](../src/modules/teacher-app/academic-content/application/teacher-academic-content-files.use-cases.ts#L89)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### DELETE `/api/v1/teacher/academic-content/:contentId/assets/:assetId`

Source: [TeacherAcademicContentFilesController.unlink](../src/modules/teacher-app/academic-content/controller/teacher-academic-content-files.controller.ts#L73). Actor: **TEACHER**. Success: **200**.

Permissions: `academics.academic_content.manage`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-inferred response (no explicit response DTO): `Promise<{ ok: boolean; assetId: string; }>`.

Ownership: Current TEACHER identity, server-resolved School, exact Content creator and current positive-hour TeacherSubjectAllocation ownership for all relevant targets; class/template routes resolve the current owned class allocation. Historical revision/publication reads retain current Teacher authorization.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Delegates to the core immutable revision/workflow/publication mechanisms after current Teacher allocation checks; Teacher Preparation cannot be externally published or self-approved through Teacher routes.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: TeacherAcademicContentFilesUseCases.unlink. [TeacherAcademicContentFilesUseCases.unlink](../src/modules/teacher-app/academic-content/application/teacher-academic-content-files.use-cases.ts#L95)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### GET `/api/v1/teacher/academic-content/:contentId/assets/:assetId/access`

Source: [TeacherAcademicContentFilesController.currentAccess](../src/modules/teacher-app/academic-content/controller/teacher-academic-content-files.controller.ts#L83). Actor: **TEACHER**. Success: **307**.

Permissions: `academics.academic_content.view`.

Request: Query: `TeacherAcademicContentAssetAccessQueryDto`. Source-inferred response (no explicit response DTO): `Promise<{ url: string; }>`.

Ownership: Current TEACHER identity, server-resolved School, exact Content creator and current positive-hour TeacherSubjectAllocation ownership for all relevant targets; class/template routes resolve the current owned class allocation. Historical revision/publication reads retain current Teacher authorization.

Cache: no-store, private, max-age=0. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Delegates to the core immutable revision/workflow/publication mechanisms after current Teacher allocation checks; Teacher Preparation cannot be externally published or self-approved through Teacher routes.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: TeacherAcademicContentFilesUseCases.currentAccess. [TeacherAcademicContentFilesUseCases.currentAccess](../src/modules/teacher-app/academic-content/application/teacher-academic-content-files.use-cases.ts#L101)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership. Authorize exact scoped File/Asset/RevisionAsset before signing. Capability expires within 300 seconds; recipient finite visibleUntil further clips expiry. Issued capability is not retroactively revoked and must not be durably stored.

### GET `/api/v1/teacher/academic-content/:contentId/revisions/:revisionId/assets/:fileId/access`

Source: [TeacherAcademicContentFilesController.revisionAccess](../src/modules/teacher-app/academic-content/controller/teacher-academic-content-files.controller.ts#L95). Actor: **TEACHER**. Success: **307**.

Permissions: `academics.academic_content.view`.

Request: Query: `TeacherAcademicContentAssetAccessQueryDto`. Source-inferred response (no explicit response DTO): `Promise<{ url: string; }>`.

Ownership: Current TEACHER identity, server-resolved School, exact Content creator and current positive-hour TeacherSubjectAllocation ownership for all relevant targets; class/template routes resolve the current owned class allocation. Historical revision/publication reads retain current Teacher authorization.

Cache: no-store, private, max-age=0. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Delegates to the core immutable revision/workflow/publication mechanisms after current Teacher allocation checks; Teacher Preparation cannot be externally published or self-approved through Teacher routes.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: TeacherAcademicContentFilesUseCases.revisionAccess. [TeacherAcademicContentFilesUseCases.revisionAccess](../src/modules/teacher-app/academic-content/application/teacher-academic-content-files.use-cases.ts#L113)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership. Authorize exact scoped File/Asset/RevisionAsset before signing. Capability expires within 300 seconds; recipient finite visibleUntil further clips expiry. Issued capability is not retroactively revoked and must not be durably stored.

### GET `/api/v1/teacher/classes/:classId/academic-content/templates/preparation`

Source: [TeacherAcademicContentFilesController.listTemplates](../src/modules/teacher-app/academic-content/controller/teacher-academic-content-files.controller.ts#L110). Actor: **TEACHER**. Success: **200**.

Permissions: `academics.academic_content.view`.

Request: Query: `ListTeacherAcademicContentPreparationTemplatesQueryDto`. Source-inferred response (no explicit response DTO): `Promise<{ items: { updatedAt: string; id: string; name: string; description: string \| null; stageId: string \| null; subjectId: string \| null; objectivesCount: number; learningOutcomesCount: number; teachingStrategiesCount: number; activitiesCount: number; }[]; page: number; limit: number; total: number; }>`.

Ownership: Current TEACHER identity, server-resolved School, exact Content creator and current positive-hour TeacherSubjectAllocation ownership for all relevant targets; class/template routes resolve the current owned class allocation. Historical revision/publication reads retain current Teacher authorization.

Cache: No explicit handler Cache-Control header. Pagination: page default 1; limit default 50, maximum 100. Use the exact scoped repository ordering.

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Delegates to the core immutable revision/workflow/publication mechanisms after current Teacher allocation checks; Teacher Preparation cannot be externally published or self-approved through Teacher routes.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: TeacherAcademicContentFilesUseCases.listTemplates. [TeacherAcademicContentFilesUseCases.listTemplates](../src/modules/teacher-app/academic-content/application/teacher-academic-content-files.use-cases.ts#L141)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### GET `/api/v1/teacher/classes/:classId/academic-content/templates/preparation/:templateId`

Source: [TeacherAcademicContentFilesController.templateDetail](../src/modules/teacher-app/academic-content/controller/teacher-academic-content-files.controller.ts#L119). Actor: **TEACHER**. Success: **200**.

Permissions: `academics.academic_content.view`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-inferred response (no explicit response DTO): `Promise<{ id: string; name: string; description: string \| null; stageId: string \| null; subjectId: string \| null; topic: string \| null; objectives: string[]; learningOutcomes: string[]; teachingStrategies: string[]; activities: string[]; resourceNotes: string \| null; assessmentNotes: string \| null; teacherNotes: string \| null; createdByUserId: string; updatedByUserId: string \| null; createdAt: string; updatedAt: string; }>`.

Ownership: Current TEACHER identity, server-resolved School, exact Content creator and current positive-hour TeacherSubjectAllocation ownership for all relevant targets; class/template routes resolve the current owned class allocation. Historical revision/publication reads retain current Teacher authorization.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Delegates to the core immutable revision/workflow/publication mechanisms after current Teacher allocation checks; Teacher Preparation cannot be externally published or self-approved through Teacher routes.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: TeacherAcademicContentFilesUseCases.templateDetail. [TeacherAcademicContentFilesUseCases.templateDetail](../src/modules/teacher-app/academic-content/application/teacher-academic-content-files.use-cases.ts#L152)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### GET `/api/v1/teacher/academic-content/:contentId/revisions`

Source: [TeacherAcademicContentWorkflowPublicationController.revisions](../src/modules/teacher-app/academic-content/controller/teacher-academic-content-workflow-publication.controller.ts#L50). Actor: **TEACHER**. Success: **200**.

Permissions: `academics.academic_content.view`.

Request: Query: `AcademicContentPaginationQueryDto`. Source-declared response: `Promise<AcademicContentRevisionListDto>`.

Ownership: Current TEACHER identity, server-resolved School, exact Content creator and current positive-hour TeacherSubjectAllocation ownership for all relevant targets; class/template routes resolve the current owned class allocation. Historical revision/publication reads retain current Teacher authorization.

Cache: no-store, private, max-age=0. Pagination: page default 1; limit default 50, maximum 100. Use the exact scoped repository ordering.

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Delegates to the core immutable revision/workflow/publication mechanisms after current Teacher allocation checks; Teacher Preparation cannot be externally published or self-approved through Teacher routes.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: TeacherAcademicContentWorkflowPublicationUseCases.revisions. [TeacherAcademicContentWorkflowPublicationUseCases.revisions](../src/modules/teacher-app/academic-content/application/teacher-academic-content-workflow-publication.use-cases.ts#L101)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### GET `/api/v1/teacher/academic-content/:contentId/revisions/:revisionId`

Source: [TeacherAcademicContentWorkflowPublicationController.revision](../src/modules/teacher-app/academic-content/controller/teacher-academic-content-workflow-publication.controller.ts#L61). Actor: **TEACHER**. Success: **200**.

Permissions: `academics.academic_content.view`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-declared response: `Promise<AcademicContentRevisionDetailDto>`.

Ownership: Current TEACHER identity, server-resolved School, exact Content creator and current positive-hour TeacherSubjectAllocation ownership for all relevant targets; class/template routes resolve the current owned class allocation. Historical revision/publication reads retain current Teacher authorization.

Cache: no-store, private, max-age=0. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Delegates to the core immutable revision/workflow/publication mechanisms after current Teacher allocation checks; Teacher Preparation cannot be externally published or self-approved through Teacher routes.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: TeacherAcademicContentWorkflowPublicationUseCases.revision. [TeacherAcademicContentWorkflowPublicationUseCases.revision](../src/modules/teacher-app/academic-content/application/teacher-academic-content-workflow-publication.use-cases.ts#L111)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### POST `/api/v1/teacher/academic-content/:contentId/submit`

Source: [TeacherAcademicContentWorkflowPublicationController.submit](../src/modules/teacher-app/academic-content/controller/teacher-academic-content-workflow-publication.controller.ts#L72). Actor: **TEACHER**. Success: **200**.

Permissions: `academics.academic_content.manage`.

Request: Body: `AcademicContentEmptyWorkflowBodyDto`. Source-declared response: `Promise<AcademicContentTransitionResponseDto>`.

Ownership: Current TEACHER identity, server-resolved School, exact Content creator and current positive-hour TeacherSubjectAllocation ownership for all relevant targets; class/template routes resolve the current owned class allocation. Historical revision/publication reads retain current Teacher authorization.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Delegates to the core immutable revision/workflow/publication mechanisms after current Teacher allocation checks; Teacher Preparation cannot be externally published or self-approved through Teacher routes.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: TeacherAcademicContentWorkflowPublicationUseCases.submit. [TeacherAcademicContentWorkflowPublicationUseCases.submit](../src/modules/teacher-app/academic-content/application/teacher-academic-content-workflow-publication.use-cases.ts#L122)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### GET `/api/v1/teacher/academic-content/:contentId/approvals`

Source: [TeacherAcademicContentWorkflowPublicationController.approvals](../src/modules/teacher-app/academic-content/controller/teacher-academic-content-workflow-publication.controller.ts#L83). Actor: **TEACHER**. Success: **200**.

Permissions: `academics.academic_content.view`.

Request: Query: `AcademicContentPaginationQueryDto`. Source-declared response: `Promise<TeacherAcademicContentApprovalHistoryDto>`.

Ownership: Current TEACHER identity, server-resolved School, exact Content creator and current positive-hour TeacherSubjectAllocation ownership for all relevant targets; class/template routes resolve the current owned class allocation. Historical revision/publication reads retain current Teacher authorization.

Cache: no-store, private, max-age=0. Pagination: page default 1; limit default 50, maximum 100. Use the exact scoped repository ordering.

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Delegates to the core immutable revision/workflow/publication mechanisms after current Teacher allocation checks; Teacher Preparation cannot be externally published or self-approved through Teacher routes.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: TeacherAcademicContentWorkflowPublicationUseCases.approvals. [TeacherAcademicContentWorkflowPublicationUseCases.approvals](../src/modules/teacher-app/academic-content/application/teacher-academic-content-workflow-publication.use-cases.ts#L127)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### GET `/api/v1/teacher/academic-content/:contentId/publication-readiness`

Source: [TeacherAcademicContentWorkflowPublicationController.publicationReadiness](../src/modules/teacher-app/academic-content/controller/teacher-academic-content-workflow-publication.controller.ts#L94). Actor: **TEACHER**. Success: **200**.

Permissions: `academics.academic_content.view`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-declared response: `Promise<AcademicContentPublicationReadinessResponseDto>`.

Ownership: Current TEACHER identity, server-resolved School, exact Content creator and current positive-hour TeacherSubjectAllocation ownership for all relevant targets; class/template routes resolve the current owned class allocation. Historical revision/publication reads retain current Teacher authorization.

Cache: no-store, private, max-age=0. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Delegates to the core immutable revision/workflow/publication mechanisms after current Teacher allocation checks; Teacher Preparation cannot be externally published or self-approved through Teacher routes.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: TeacherAcademicContentWorkflowPublicationUseCases.publicationReadiness. [TeacherAcademicContentWorkflowPublicationUseCases.publicationReadiness](../src/modules/teacher-app/academic-content/application/teacher-academic-content-workflow-publication.use-cases.ts#L146)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### GET `/api/v1/teacher/academic-content/:contentId/audience-preview`

Source: [TeacherAcademicContentWorkflowPublicationController.audiencePreview](../src/modules/teacher-app/academic-content/controller/teacher-academic-content-workflow-publication.controller.ts#L104). Actor: **TEACHER**. Success: **200**.

Permissions: `academics.academic_content.view`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-declared response: `Promise<AcademicContentAudiencePreviewResponseDto>`.

Ownership: Current TEACHER identity, server-resolved School, exact Content creator and current positive-hour TeacherSubjectAllocation ownership for all relevant targets; class/template routes resolve the current owned class allocation. Historical revision/publication reads retain current Teacher authorization.

Cache: no-store, private, max-age=0. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Delegates to the core immutable revision/workflow/publication mechanisms after current Teacher allocation checks; Teacher Preparation cannot be externally published or self-approved through Teacher routes.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: TeacherAcademicContentWorkflowPublicationUseCases.audiencePreview. [TeacherAcademicContentWorkflowPublicationUseCases.audiencePreview](../src/modules/teacher-app/academic-content/application/teacher-academic-content-workflow-publication.use-cases.ts#L152)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### GET `/api/v1/teacher/academic-content/:contentId/publications`

Source: [TeacherAcademicContentWorkflowPublicationController.publications](../src/modules/teacher-app/academic-content/controller/teacher-academic-content-workflow-publication.controller.ts#L114). Actor: **TEACHER**. Success: **200**.

Permissions: `academics.academic_content.view`.

Request: Query: `AcademicContentPublicationHistoryQueryDto`. Source-declared response: `Promise<AcademicContentPublicationHistoryResponseDto>`.

Ownership: Current TEACHER identity, server-resolved School, exact Content creator and current positive-hour TeacherSubjectAllocation ownership for all relevant targets; class/template routes resolve the current owned class allocation. Historical revision/publication reads retain current Teacher authorization.

Cache: no-store, private, max-age=0. Pagination: page default 1; limit default 20, maximum 100. Use the exact scoped repository ordering.

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Delegates to the core immutable revision/workflow/publication mechanisms after current Teacher allocation checks; Teacher Preparation cannot be externally published or self-approved through Teacher routes.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: TeacherAcademicContentWorkflowPublicationUseCases.publications. [TeacherAcademicContentWorkflowPublicationUseCases.publications](../src/modules/teacher-app/academic-content/application/teacher-academic-content-workflow-publication.use-cases.ts#L158)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### GET `/api/v1/teacher/academic-content/:contentId/publications/:publicationId`

Source: [TeacherAcademicContentWorkflowPublicationController.publication](../src/modules/teacher-app/academic-content/controller/teacher-academic-content-workflow-publication.controller.ts#L125). Actor: **TEACHER**. Success: **200**.

Permissions: `academics.academic_content.view`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-declared response: `Promise<AcademicContentPublicationResponseDto>`.

Ownership: Current TEACHER identity, server-resolved School, exact Content creator and current positive-hour TeacherSubjectAllocation ownership for all relevant targets; class/template routes resolve the current owned class allocation. Historical revision/publication reads retain current Teacher authorization.

Cache: no-store, private, max-age=0. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Delegates to the core immutable revision/workflow/publication mechanisms after current Teacher allocation checks; Teacher Preparation cannot be externally published or self-approved through Teacher routes.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: TeacherAcademicContentWorkflowPublicationUseCases.publication. [TeacherAcademicContentWorkflowPublicationUseCases.publication](../src/modules/teacher-app/academic-content/application/teacher-academic-content-workflow-publication.use-cases.ts#L168)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### POST `/api/v1/teacher/academic-content/:contentId/publications`

Source: [TeacherAcademicContentWorkflowPublicationController.publish](../src/modules/teacher-app/academic-content/controller/teacher-academic-content-workflow-publication.controller.ts#L136). Actor: **TEACHER**. Success: **201**.

Permissions: `academics.academic_content.publish`.

Request: Body: `CreateAcademicContentPublicationDto`. Source-declared response: `Promise<AcademicContentPublicationResponseDto>`.

Ownership: Current TEACHER identity, server-resolved School, exact Content creator and current positive-hour TeacherSubjectAllocation ownership for all relevant targets; class/template routes resolve the current owned class allocation. Historical revision/publication reads retain current Teacher authorization.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: Persisted publication clientRequestId/fingerprint: identical retry returns the exact eligible durable intent; contradictory payload conflicts. Retry current authorization and state are rechecked.

Version semantics: Delegates to the core immutable revision/workflow/publication mechanisms after current Teacher allocation checks; Teacher Preparation cannot be externally published or self-approved through Teacher routes.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: TeacherAcademicContentWorkflowPublicationUseCases.publish. [TeacherAcademicContentWorkflowPublicationUseCases.publish](../src/modules/teacher-app/academic-content/application/teacher-academic-content-workflow-publication.use-cases.ts#L178)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### POST `/api/v1/teacher/academic-content/:contentId/publications/:publicationId/unschedule`

Source: [TeacherAcademicContentWorkflowPublicationController.unschedule](../src/modules/teacher-app/academic-content/controller/teacher-academic-content-workflow-publication.controller.ts#L163). Actor: **TEACHER**. Success: **200**.

Permissions: `academics.academic_content.publish`.

Request: Body: `AcademicContentEmptyPublicationBodyDto`. Source-declared response: `Promise<AcademicContentPublicationResponseDto>`.

Ownership: Current TEACHER identity, server-resolved School, exact Content creator and current positive-hour TeacherSubjectAllocation ownership for all relevant targets; class/template routes resolve the current owned class allocation. Historical revision/publication reads retain current Teacher authorization.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Delegates to the core immutable revision/workflow/publication mechanisms after current Teacher allocation checks; Teacher Preparation cannot be externally published or self-approved through Teacher routes.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: TeacherAcademicContentWorkflowPublicationUseCases.unschedule. [TeacherAcademicContentWorkflowPublicationUseCases.unschedule](../src/modules/teacher-app/academic-content/application/teacher-academic-content-workflow-publication.use-cases.ts#L188)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### POST `/api/v1/teacher/academic-content/:contentId/publications/:publicationId/cancel`

Source: [TeacherAcademicContentWorkflowPublicationController.withdraw](../src/modules/teacher-app/academic-content/controller/teacher-academic-content-workflow-publication.controller.ts#L175). Actor: **TEACHER**. Success: **200**.

Permissions: `academics.academic_content.publish`.

Request: Body: `AcademicContentEmptyPublicationBodyDto`. Source-declared response: `Promise<AcademicContentPublicationResponseDto>`.

Ownership: Current TEACHER identity, server-resolved School, exact Content creator and current positive-hour TeacherSubjectAllocation ownership for all relevant targets; class/template routes resolve the current owned class allocation. Historical revision/publication reads retain current Teacher authorization.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Delegates to the core immutable revision/workflow/publication mechanisms after current Teacher allocation checks; Teacher Preparation cannot be externally published or self-approved through Teacher routes.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: TeacherAcademicContentWorkflowPublicationUseCases.withdraw. [TeacherAcademicContentWorkflowPublicationUseCases.withdraw](../src/modules/teacher-app/academic-content/application/teacher-academic-content-workflow-publication.use-cases.ts#L203)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### POST `/api/v1/teacher/academic-content/:contentId/publications/:publicationId/revise`

Source: [TeacherAcademicContentWorkflowPublicationController.revise](../src/modules/teacher-app/academic-content/controller/teacher-academic-content-workflow-publication.controller.ts#L187). Actor: **TEACHER**. Success: **200**.

Permissions: `academics.academic_content.manage`, `academics.academic_content.publish`.

Request: Body: `AcademicContentEmptyPublicationBodyDto`. Source-declared response: `Promise<AcademicContentPublicationRevisionStartResponseDto>`.

Ownership: Current TEACHER identity, server-resolved School, exact Content creator and current positive-hour TeacherSubjectAllocation ownership for all relevant targets; class/template routes resolve the current owned class allocation. Historical revision/publication reads retain current Teacher authorization.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Delegates to the core immutable revision/workflow/publication mechanisms after current Teacher allocation checks; Teacher Preparation cannot be externally published or self-approved through Teacher routes.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: TeacherAcademicContentWorkflowPublicationUseCases.revise. [TeacherAcademicContentWorkflowPublicationUseCases.revise](../src/modules/teacher-app/academic-content/application/teacher-academic-content-workflow-publication.use-cases.ts#L214)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### GET `/api/v1/teacher/academic-content/capabilities`

Source: [TeacherAcademicContentController.capabilities](../src/modules/teacher-app/academic-content/controller/teacher-academic-content.controller.ts#L26). Actor: **TEACHER**. Success: **200**.

Permissions: `academics.academic_content.view`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-declared response: `Promise<TeacherAcademicContentCapabilitiesDto>`.

Ownership: Current TEACHER identity, server-resolved School, exact Content creator and current positive-hour TeacherSubjectAllocation ownership for all relevant targets; class/template routes resolve the current owned class allocation. Historical revision/publication reads retain current Teacher authorization.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Delegates to the core immutable revision/workflow/publication mechanisms after current Teacher allocation checks; Teacher Preparation cannot be externally published or self-approved through Teacher routes.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: GetTeacherAcademicContentCapabilitiesUseCase.execute. [GetTeacherAcademicContentCapabilitiesUseCase.execute](../src/modules/teacher-app/academic-content/application/teacher-academic-content-read.use-cases.ts#L116)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### GET `/api/v1/teacher/academic-content`

Source: [TeacherAcademicContentController.list](../src/modules/teacher-app/academic-content/controller/teacher-academic-content.controller.ts#L33). Actor: **TEACHER**. Success: **200**.

Permissions: `academics.academic_content.view`.

Request: Query: `ListTeacherAcademicContentQueryDto`. Source-declared response: `Promise<AcademicContentListResponseDto>`.

Ownership: Current TEACHER identity, server-resolved School, exact Content creator and current positive-hour TeacherSubjectAllocation ownership for all relevant targets; class/template routes resolve the current owned class allocation. Historical revision/publication reads retain current Teacher authorization.

Cache: No explicit handler Cache-Control header. Pagination: page default 1; limit default 50, maximum 100. Use the exact scoped repository ordering.

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Delegates to the core immutable revision/workflow/publication mechanisms after current Teacher allocation checks; Teacher Preparation cannot be externally published or self-approved through Teacher routes.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: ListTeacherAcademicContentUseCase.execute. [ListTeacherAcademicContentUseCase.execute](../src/modules/teacher-app/academic-content/application/teacher-academic-content-read.use-cases.ts#L30)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### GET `/api/v1/teacher/academic-content/:contentId`

Source: [TeacherAcademicContentController.detail](../src/modules/teacher-app/academic-content/controller/teacher-academic-content.controller.ts#L42). Actor: **TEACHER**. Success: **200**.

Permissions: `academics.academic_content.view`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-declared response: `Promise<TeacherAcademicContentDetailDto>`.

Ownership: Current TEACHER identity, server-resolved School, exact Content creator and current positive-hour TeacherSubjectAllocation ownership for all relevant targets; class/template routes resolve the current owned class allocation. Historical revision/publication reads retain current Teacher authorization.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: No request-key idempotency guarantee declared for this endpoint; current ownership/lifecycle checks apply on every call

Version semantics: Delegates to the core immutable revision/workflow/publication mechanisms after current Teacher allocation checks; Teacher Preparation cannot be externally published or self-approved through Teacher routes.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: GetTeacherAcademicContentUseCase.execute. [GetTeacherAcademicContentUseCase.execute](../src/modules/teacher-app/academic-content/application/teacher-academic-content-read.use-cases.ts#L83)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership.

### GET `/api/v1/teacher/notifications`

Source: [TeacherNotificationsController.listNotifications](../src/modules/teacher-app/notifications/controller/teacher-notifications.controller.ts#L64). Actor: **TEACHER**. Success: **200**.

Permissions: `communication.notifications.view`.

Request: Query: `ListTeacherNotificationsQueryDto`. Source-declared response: `Promise<TeacherNotificationsListResponseDto>`.

Ownership: Current authenticated app actor and recipient-owned Communication notification/preference/device-token surface; core Communication routes additionally require SCHOOL_USER or ORGANIZATION_USER. Delivery inspection is School-scoped with communication.notifications.manage.

Cache: No explicit handler Cache-Control header. Pagination: page default 1; limit default 50, maximum 100 (source DTO validators and CommunicationNotificationRepository.list/listDeliveries); source repository ordering is retained.

Idempotency: Read/read-all/archive and preference/token state operations follow existing Communication contracts; these are not AcademicContent clientRequestId writes. Notification generation deduplicates by event/recipient/channel.

Version semantics: Communication owns delivery/read/archive facts. ACC deep-link metadata is a historical pointer: follow-up ACC detail must resolve current access/canonical successor. Reading a notification never creates Engagement or ACK.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: ListTeacherNotificationsUseCase.execute. [ListTeacherNotificationsUseCase.execute](../src/modules/teacher-app/notifications/application/teacher-notifications.use-cases.ts#L28)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership. No signed capabilities or Online Session join secrets in notification transport. Push/provider and real app receipt need external evidence; Backend doubles do not prove device delivery.

### GET `/api/v1/teacher/notifications/summary`

Source: [TeacherNotificationsController.getSummary](../src/modules/teacher-app/notifications/controller/teacher-notifications.controller.ts#L73). Actor: **TEACHER**. Success: **200**.

Permissions: `communication.notifications.view`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-declared response: `Promise<TeacherNotificationsSummaryDto>`.

Ownership: Current authenticated app actor and recipient-owned Communication notification/preference/device-token surface; core Communication routes additionally require SCHOOL_USER or ORGANIZATION_USER. Delivery inspection is School-scoped with communication.notifications.manage.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: Read/read-all/archive and preference/token state operations follow existing Communication contracts; these are not AcademicContent clientRequestId writes. Notification generation deduplicates by event/recipient/channel.

Version semantics: Communication owns delivery/read/archive facts. ACC deep-link metadata is a historical pointer: follow-up ACC detail must resolve current access/canonical successor. Reading a notification never creates Engagement or ACK.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: GetTeacherNotificationsSummaryUseCase.execute. [GetTeacherNotificationsSummaryUseCase.execute](../src/modules/teacher-app/notifications/application/teacher-notifications.use-cases.ts#L64)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership. No signed capabilities or Online Session join secrets in notification transport. Push/provider and real app receipt need external evidence; Backend doubles do not prove device delivery.

### POST `/api/v1/teacher/notifications/read-all`

Source: [TeacherNotificationsController.markAllRead](../src/modules/teacher-app/notifications/controller/teacher-notifications.controller.ts#L80). Actor: **TEACHER**. Success: **201**.

Permissions: `communication.notifications.read`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-declared response: `Promise<TeacherNotificationsReadAllResponseDto>`.

Ownership: Current authenticated app actor and recipient-owned Communication notification/preference/device-token surface; core Communication routes additionally require SCHOOL_USER or ORGANIZATION_USER. Delivery inspection is School-scoped with communication.notifications.manage.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: Read/read-all/archive and preference/token state operations follow existing Communication contracts; these are not AcademicContent clientRequestId writes. Notification generation deduplicates by event/recipient/channel.

Version semantics: Communication owns delivery/read/archive facts. ACC deep-link metadata is a historical pointer: follow-up ACC detail must resolve current access/canonical successor. Reading a notification never creates Engagement or ACK.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: MarkAllTeacherNotificationsReadUseCase.execute. [MarkAllTeacherNotificationsReadUseCase.execute](../src/modules/teacher-app/notifications/application/teacher-notifications.use-cases.ts#L99)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership. No signed capabilities or Online Session join secrets in notification transport. Push/provider and real app receipt need external evidence; Backend doubles do not prove device delivery.

### GET `/api/v1/teacher/notifications/preferences`

Source: [TeacherNotificationsController.getPreferences](../src/modules/teacher-app/notifications/controller/teacher-notifications.controller.ts#L87). Actor: **TEACHER**. Success: **200**.

Permissions: `communication.notifications.preferences.manage`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-declared response: `Promise<TeacherNotificationPreferencesResponseDto>`.

Ownership: Current authenticated app actor and recipient-owned Communication notification/preference/device-token surface; core Communication routes additionally require SCHOOL_USER or ORGANIZATION_USER. Delivery inspection is School-scoped with communication.notifications.manage.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: Read/read-all/archive and preference/token state operations follow existing Communication contracts; these are not AcademicContent clientRequestId writes. Notification generation deduplicates by event/recipient/channel.

Version semantics: Communication owns delivery/read/archive facts. ACC deep-link metadata is a historical pointer: follow-up ACC detail must resolve current access/canonical successor. Reading a notification never creates Engagement or ACK.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: GetTeacherNotificationPreferencesUseCase.execute. [GetTeacherNotificationPreferencesUseCase.execute](../src/modules/teacher-app/notifications/application/teacher-notifications.use-cases.ts#L134)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership. No signed capabilities or Online Session join secrets in notification transport. Push/provider and real app receipt need external evidence; Backend doubles do not prove device delivery.

### PATCH `/api/v1/teacher/notifications/preferences`

Source: [TeacherNotificationsController.updatePreferences](../src/modules/teacher-app/notifications/controller/teacher-notifications.controller.ts#L94). Actor: **TEACHER**. Success: **200**.

Permissions: `communication.notifications.preferences.manage`.

Request: Body: `UpdateTeacherNotificationPreferencesDto`. Source-declared response: `Promise<TeacherNotificationPreferencesResponseDto>`.

Ownership: Current authenticated app actor and recipient-owned Communication notification/preference/device-token surface; core Communication routes additionally require SCHOOL_USER or ORGANIZATION_USER. Delivery inspection is School-scoped with communication.notifications.manage.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: Read/read-all/archive and preference/token state operations follow existing Communication contracts; these are not AcademicContent clientRequestId writes. Notification generation deduplicates by event/recipient/channel.

Version semantics: Communication owns delivery/read/archive facts. ACC deep-link metadata is a historical pointer: follow-up ACC detail must resolve current access/canonical successor. Reading a notification never creates Engagement or ACK.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: UpdateTeacherNotificationPreferencesUseCase.execute. [UpdateTeacherNotificationPreferencesUseCase.execute](../src/modules/teacher-app/notifications/application/teacher-notifications.use-cases.ts#L196)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership. No signed capabilities or Online Session join secrets in notification transport. Push/provider and real app receipt need external evidence; Backend doubles do not prove device delivery.

### POST `/api/v1/teacher/notifications/device-tokens`

Source: [TeacherNotificationsController.registerDeviceToken](../src/modules/teacher-app/notifications/controller/teacher-notifications.controller.ts#L103). Actor: **TEACHER**. Success: **201**.

Permissions: `app.device_tokens.manage`.

Request: Body: `RegisterAppDeviceTokenDto`. Source-declared response: `Promise<AppDeviceTokenRegisterResponseDto>`.

Ownership: Current authenticated app actor and recipient-owned Communication notification/preference/device-token surface; core Communication routes additionally require SCHOOL_USER or ORGANIZATION_USER. Delivery inspection is School-scoped with communication.notifications.manage.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: Read/read-all/archive and preference/token state operations follow existing Communication contracts; these are not AcademicContent clientRequestId writes. Notification generation deduplicates by event/recipient/channel.

Version semantics: Communication owns delivery/read/archive facts. ACC deep-link metadata is a historical pointer: follow-up ACC detail must resolve current access/canonical successor. Reading a notification never creates Engagement or ACK.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: RegisterTeacherDeviceTokenUseCase.execute. [RegisterTeacherDeviceTokenUseCase.execute](../src/modules/teacher-app/notifications/application/teacher-notifications.use-cases.ts#L152)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership. No signed capabilities or Online Session join secrets in notification transport. Push/provider and real app receipt need external evidence; Backend doubles do not prove device delivery.

### DELETE `/api/v1/teacher/notifications/device-tokens/current`

Source: [TeacherNotificationsController.unregisterCurrentDeviceToken](../src/modules/teacher-app/notifications/controller/teacher-notifications.controller.ts#L112). Actor: **TEACHER**. Success: **200**.

Permissions: `app.device_tokens.manage`.

Request: Body: `UnregisterAppDeviceTokenDto`. Source-declared response: `Promise<AppDeviceTokenUnregisterResponseDto>`.

Ownership: Current authenticated app actor and recipient-owned Communication notification/preference/device-token surface; core Communication routes additionally require SCHOOL_USER or ORGANIZATION_USER. Delivery inspection is School-scoped with communication.notifications.manage.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: Read/read-all/archive and preference/token state operations follow existing Communication contracts; these are not AcademicContent clientRequestId writes. Notification generation deduplicates by event/recipient/channel.

Version semantics: Communication owns delivery/read/archive facts. ACC deep-link metadata is a historical pointer: follow-up ACC detail must resolve current access/canonical successor. Reading a notification never creates Engagement or ACK.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: UnregisterTeacherDeviceTokenUseCase.execute. [UnregisterTeacherDeviceTokenUseCase.execute](../src/modules/teacher-app/notifications/application/teacher-notifications.use-cases.ts#L174)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership. No signed capabilities or Online Session join secrets in notification transport. Push/provider and real app receipt need external evidence; Backend doubles do not prove device delivery.

### GET `/api/v1/teacher/notifications/:notificationId`

Source: [TeacherNotificationsController.getNotification](../src/modules/teacher-app/notifications/controller/teacher-notifications.controller.ts#L121). Actor: **TEACHER**. Success: **200**.

Permissions: `communication.notifications.view`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-declared response: `Promise<TeacherNotificationResponseDto>`.

Ownership: Current authenticated app actor and recipient-owned Communication notification/preference/device-token surface; core Communication routes additionally require SCHOOL_USER or ORGANIZATION_USER. Delivery inspection is School-scoped with communication.notifications.manage.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: Read/read-all/archive and preference/token state operations follow existing Communication contracts; these are not AcademicContent clientRequestId writes. Notification generation deduplicates by event/recipient/channel.

Version semantics: Communication owns delivery/read/archive facts. ACC deep-link metadata is a historical pointer: follow-up ACC detail must resolve current access/canonical successor. Reading a notification never creates Engagement or ACK.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: GetTeacherNotificationUseCase.execute. [GetTeacherNotificationUseCase.execute](../src/modules/teacher-app/notifications/application/teacher-notifications.use-cases.ts#L46)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership. No signed capabilities or Online Session join secrets in notification transport. Push/provider and real app receipt need external evidence; Backend doubles do not prove device delivery.

### POST `/api/v1/teacher/notifications/:notificationId/read`

Source: [TeacherNotificationsController.markRead](../src/modules/teacher-app/notifications/controller/teacher-notifications.controller.ts#L130). Actor: **TEACHER**. Success: **201**.

Permissions: `communication.notifications.read`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-declared response: `Promise<TeacherNotificationResponseDto>`.

Ownership: Current authenticated app actor and recipient-owned Communication notification/preference/device-token surface; core Communication routes additionally require SCHOOL_USER or ORGANIZATION_USER. Delivery inspection is School-scoped with communication.notifications.manage.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: Read/read-all/archive and preference/token state operations follow existing Communication contracts; these are not AcademicContent clientRequestId writes. Notification generation deduplicates by event/recipient/channel.

Version semantics: Communication owns delivery/read/archive facts. ACC deep-link metadata is a historical pointer: follow-up ACC detail must resolve current access/canonical successor. Reading a notification never creates Engagement or ACK.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: MarkTeacherNotificationReadUseCase.execute. [MarkTeacherNotificationReadUseCase.execute](../src/modules/teacher-app/notifications/application/teacher-notifications.use-cases.ts#L81)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership. No signed capabilities or Online Session join secrets in notification transport. Push/provider and real app receipt need external evidence; Backend doubles do not prove device delivery.

### POST `/api/v1/teacher/notifications/:notificationId/archive`

Source: [TeacherNotificationsController.archive](../src/modules/teacher-app/notifications/controller/teacher-notifications.controller.ts#L139). Actor: **TEACHER**. Success: **201**.

Permissions: `communication.notifications.archive`.

Request: No Body/Query DTO; see parameter UUID pipes in source. Source-declared response: `Promise<TeacherNotificationResponseDto>`.

Ownership: Current authenticated app actor and recipient-owned Communication notification/preference/device-token surface; core Communication routes additionally require SCHOOL_USER or ORGANIZATION_USER. Delivery inspection is School-scoped with communication.notifications.manage.

Cache: No explicit handler Cache-Control header. Pagination: Not paginated by this endpoint

Idempotency: Read/read-all/archive and preference/token state operations follow existing Communication contracts; these are not AcademicContent clientRequestId writes. Notification generation deduplicates by event/recipient/channel.

Version semantics: Communication owns delivery/read/archive facts. ACC deep-link metadata is a historical pointer: follow-up ACC detail must resolve current access/canonical successor. Reading a notification never creates Engagement or ACK.

Errors: envelope: GlobalExceptionFilter: error.code, error.message, optional error.details and traceId; not every route emits every listed status; authentication: 401 for missing/invalid JWT; 403 for disallowed UserType/scope/permission; validation: 400 when the declared DTO/UUID pipe rejects input; ownership: 404 for inaccessible domain resources under the route-specific scoped use case; consult exception source for exact code; conflict: 409 only for an applicable lifecycle, reference, state or fingerprint conflict; not a blanket response for every GET.

Application path: ArchiveTeacherNotificationUseCase.execute. [ArchiveTeacherNotificationUseCase.execute](../src/modules/teacher-app/notifications/application/teacher-notifications.use-cases.ts#L116)

Compatibility: Use the source-declared DTO and success status; permission grants do not substitute for UserType or scoped ownership. No signed capabilities or Online Session join secrets in notification transport. Push/provider and real app receipt need external evidence; Backend doubles do not prove device delivery.

## Request DTO field and validator inventory

### AcademicContentAcknowledgementEmptyQueryDto

Source: [AcademicContentAcknowledgementEmptyQueryDto](../src/modules/academics/academic-content/dto/academic-content-acknowledgement.dto.ts#L12).

No declared property fields. Empty command DTOs prohibit additional fields through the existing HTTP validation/application contract.

### AcademicContentAcknowledgementRequestDto

Source: [AcademicContentAcknowledgementRequestDto](../src/modules/academics/academic-content/dto/academic-content-acknowledgement.dto.ts#L5).

| Field                 | Type   | Optional | Source validation |
| --------------------- | ------ | -------- | ----------------- |
| expectedPublicationId | string | no       | @IsUUID()         |

### AcademicContentEmptyPublicationBodyDto

Source: [AcademicContentEmptyPublicationBodyDto](../src/modules/academics/academic-content/dto/academic-content-publication.dto.ts#L69).

No declared property fields. Empty command DTOs prohibit additional fields through the existing HTTP validation/application contract.

### AcademicContentEmptyWorkflowBodyDto

Source: [AcademicContentEmptyWorkflowBodyDto](../src/modules/academics/academic-content/dto/academic-content-workflow.dto.ts#L8).

No declared property fields. Empty command DTOs prohibit additional fields through the existing HTTP validation/application contract.

### AcademicContentPaginationQueryDto

Source: [AcademicContentPaginationQueryDto](../src/modules/academics/academic-content/dto/academic-content-request.dto.ts#L75).

| Field | Type                | Optional | Source validation                                                |
| ----- | ------------------- | -------- | ---------------------------------------------------------------- |
| page  | number \| undefined | yes      | @IsOptional(); @Type(() => Number); @IsInt(); @Min(1)            |
| limit | number \| undefined | yes      | @IsOptional(); @Type(() => Number); @IsInt(); @Min(1); @Max(100) |

### AcademicContentPublicationHistoryQueryDto

Source: [AcademicContentPublicationHistoryQueryDto](../src/modules/academics/academic-content/dto/academic-content-publication.dto.ts#L54).

| Field | Type   | Optional | Source validation                                 |
| ----- | ------ | -------- | ------------------------------------------------- |
| page  | number | no       | @Type(() => Number); @IsInt(); @Min(1)            |
| limit | number | no       | @Type(() => Number); @IsInt(); @Min(1); @Max(100) |

### AcademicContentRequestChangesDto

Source: [AcademicContentRequestChangesDto](../src/modules/academics/academic-content/dto/academic-content-workflow.dto.ts#L12).

| Field | Type   | Optional | Source validation             |
| ----- | ------ | -------- | ----------------------------- |
| note  | string | no       | @IsString(); @MaxLength(4000) |

### AcademicContentReviewQueueQueryDto

Source: [AcademicContentReviewQueueQueryDto](../src/modules/academics/academic-content/dto/academic-content-review.dto.ts#L10).

| Field          | Type                | Optional | Source validation                                                |
| -------------- | ------------------- | -------- | ---------------------------------------------------------------- |
| academicYearId | string \| undefined | yes      | @IsOptional(); @IsUUID()                                         |
| termId         | string \| undefined | yes      | @IsOptional(); @IsUUID()                                         |
| stageId        | string \| undefined | yes      | @IsOptional(); @IsUUID()                                         |
| gradeId        | string \| undefined | yes      | @IsOptional(); @IsUUID()                                         |
| sectionId      | string \| undefined | yes      | @IsOptional(); @IsUUID()                                         |
| classroomId    | string \| undefined | yes      | @IsOptional(); @IsUUID()                                         |
| subjectId      | string \| undefined | yes      | @IsOptional(); @IsUUID()                                         |
| teacherUserId  | string \| undefined | yes      | @IsOptional(); @IsUUID()                                         |
| search         | string \| undefined | yes      | @IsOptional(); @IsString(); @MaxLength(120)                      |
| page           | number \| undefined | yes      | @IsOptional(); @Type(() => Number); @IsInt(); @Min(1)            |
| limit          | number \| undefined | yes      | @IsOptional(); @Type(() => Number); @IsInt(); @Min(1); @Max(100) |

### CreateAcademicContentDto

Source: [CreateAcademicContentDto](../src/modules/academics/academic-content/dto/academic-content-request.dto.ts#L27).

| Field          | Type                                                                           | Optional | Source validation                            |
| -------------- | ------------------------------------------------------------------------------ | -------- | -------------------------------------------- |
| academicYearId | string                                                                         | no       | @IsUUID()                                    |
| termId         | string                                                                         | no       | @IsUUID()                                    |
| type           | import("node_modules/.prisma/client/index").$Enums.AcademicContentType         | no       | @IsEnum(AcademicContentType)                 |
| audience       | import("node_modules/.prisma/client/index").$Enums.AcademicContentAudienceType | no       | @IsEnum(AcademicContentAudienceType)         |
| title          | string                                                                         | no       | @IsString(); @MaxLength(180)                 |
| description    | string \| null \| undefined                                                    | yes      | @IsOptional(); @IsString(); @MaxLength(4000) |

### CreateAcademicContentPreparationTemplateDto

Source: [CreateAcademicContentPreparationTemplateDto](../src/modules/academics/academic-content/dto/academic-content-preparation-template.dto.ts#L48).

| Field              | Type                        | Optional | Source validation                                                                                        |
| ------------------ | --------------------------- | -------- | -------------------------------------------------------------------------------------------------------- |
| name               | string                      | no       | @IsString(); @MaxLength(180)                                                                             |
| description        | string \| null \| undefined | yes      | @IsOptional(); @IsString(); @MaxLength(1000)                                                             |
| stageId            | string \| null \| undefined | yes      | @IsOptional(); @IsUUID()                                                                                 |
| subjectId          | string \| null \| undefined | yes      | @IsOptional(); @IsUUID()                                                                                 |
| topic              | string \| null \| undefined | yes      | @IsOptional(); @IsString(); @MaxLength(500)                                                              |
| objectives         | string[] \| undefined       | yes      | @IsOptional(); @IsArray(); @ArrayMaxSize(50); @IsString({ each: true }); @MaxLength(500, { each: true }) |
| learningOutcomes   | string[] \| undefined       | yes      | @IsOptional(); @IsArray(); @ArrayMaxSize(50); @IsString({ each: true }); @MaxLength(500, { each: true }) |
| teachingStrategies | string[] \| undefined       | yes      | @IsOptional(); @IsArray(); @ArrayMaxSize(50); @IsString({ each: true }); @MaxLength(500, { each: true }) |
| activities         | string[] \| undefined       | yes      | @IsOptional(); @IsArray(); @ArrayMaxSize(50); @IsString({ each: true }); @MaxLength(500, { each: true }) |
| resourceNotes      | string \| null \| undefined | yes      | @IsOptional(); @IsString(); @MaxLength(4000)                                                             |
| assessmentNotes    | string \| null \| undefined | yes      | @IsOptional(); @IsString(); @MaxLength(4000)                                                             |
| teacherNotes       | string \| null \| undefined | yes      | @IsOptional(); @IsString(); @MaxLength(4000)                                                             |

### CreateAcademicContentPublicationDto

Source: [CreateAcademicContentPublicationDto](../src/modules/academics/academic-content/dto/academic-content-publication.dto.ts#L23).

| Field             | Type                        | Optional | Source validation                                                                                                                                                      |
| ----------------- | --------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| notifyMinorUpdate | boolean \| undefined        | yes      | @ValidateIf((\_, value) => value !== undefined); @IsBoolean()                                                                                                          |
| clientRequestId   | string                      | no       | @IsUUID()                                                                                                                                                              |
| publishAt         | string \| undefined         | yes      | @ValidateIf((\_object, value: unknown) => value !== undefined); @IsISO8601({ strict: true, strictSeparator: true }); @Matches(publicationInstant)                      |
| visibleFrom       | string \| undefined         | yes      | @ValidateIf((\_object, value: unknown) => value !== undefined); @IsISO8601({ strict: true, strictSeparator: true }); @Matches(publicationInstant)                      |
| visibleUntil      | string \| null \| undefined | yes      | @ValidateIf( (\_object, value: unknown) => value !== undefined && value !== null, ); @IsISO8601({ strict: true, strictSeparator: true }); @Matches(publicationInstant) |

### CreateAcademicContentUploadDto

Source: [CreateAcademicContentUploadDto](../src/modules/academics/academic-content/dto/academic-content-request.dto.ts#L240).

| Field             | Type   | Optional | Source validation                                        |
| ----------------- | ------ | -------- | -------------------------------------------------------- |
| clientRequestId   | string | no       | @IsUUID()                                                |
| originalName      | string | no       | @IsString()                                              |
| expectedMimeType  | string | no       | @IsString()                                              |
| expectedSizeBytes | string | no       | @IsString(); @MaxLength(11); @Matches(/^[1-9][0-9]\*$/u) |

### CreateTeacherAcademicContentDto

Source: [CreateTeacherAcademicContentDto](../src/modules/teacher-app/academic-content/dto/teacher-academic-content-authoring.dto.ts#L11).

| Field       | Type                                                                           | Optional | Source validation                            |
| ----------- | ------------------------------------------------------------------------------ | -------- | -------------------------------------------- |
| description | string \| null \| undefined                                                    | yes      | @IsOptional(); @IsString(); @MaxLength(4000) |
| type        | import("node_modules/.prisma/client/index").$Enums.AcademicContentType         | no       | @IsEnum(AcademicContentType)                 |
| audience    | import("node_modules/.prisma/client/index").$Enums.AcademicContentAudienceType | no       | @IsEnum(AcademicContentAudienceType)         |
| title       | string                                                                         | no       | @IsString(); @MaxLength(180)                 |

### ListAcademicContentPreparationTemplatesQueryDto

Source: [ListAcademicContentPreparationTemplatesQueryDto](../src/modules/academics/academic-content/dto/academic-content-preparation-template.dto.ts#L15).

| Field     | Type                | Optional | Source validation                                                |
| --------- | ------------------- | -------- | ---------------------------------------------------------------- |
| stageId   | string \| undefined | yes      | @IsOptional(); @IsUUID()                                         |
| subjectId | string \| undefined | yes      | @IsOptional(); @IsUUID()                                         |
| search    | string \| undefined | yes      | @IsOptional(); @IsString(); @MaxLength(120)                      |
| page      | number \| undefined | yes      | @IsOptional(); @Type(() => Number); @IsInt(); @Min(1)            |
| limit     | number \| undefined | yes      | @IsOptional(); @Type(() => Number); @IsInt(); @Min(1); @Max(100) |

### ListAcademicContentQueryDto

Source: [ListAcademicContentQueryDto](../src/modules/academics/academic-content/dto/academic-content-request.dto.ts#L92).

| Field              | Type                                                                                            | Optional | Source validation                                                  |
| ------------------ | ----------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------ |
| academicYearId     | string \| undefined                                                                             | yes      | @IsOptional(); @IsUUID()                                           |
| termId             | string \| undefined                                                                             | yes      | @IsOptional(); @IsUUID()                                           |
| type               | import("node_modules/.prisma/client/index").$Enums.AcademicContentType \| undefined             | yes      | @IsOptional(); @IsEnum(AcademicContentType)                        |
| status             | import("node_modules/.prisma/client/index").$Enums.AcademicContentStatus \| undefined           | yes      | @IsOptional(); @IsEnum(AcademicContentStatus)                      |
| audience           | import("node_modules/.prisma/client/index").$Enums.AcademicContentAudienceType \| undefined     | yes      | @IsOptional(); @IsEnum(AcademicContentAudienceType)                |
| stageId            | string \| undefined                                                                             | yes      | @IsOptional(); @IsUUID()                                           |
| gradeId            | string \| undefined                                                                             | yes      | @IsOptional(); @IsUUID()                                           |
| sectionId          | string \| undefined                                                                             | yes      | @IsOptional(); @IsUUID()                                           |
| classroomId        | string \| undefined                                                                             | yes      | @IsOptional(); @IsUUID()                                           |
| subjectId          | string \| undefined                                                                             | yes      | @IsOptional(); @IsUUID()                                           |
| teacherUserId      | string \| undefined                                                                             | yes      | @IsOptional(); @IsUUID()                                           |
| resourceCategory   | import("node_modules/.prisma/client/index").$Enums.AcademicSubjectResourceCategory \| undefined | yes      | @IsOptional(); @IsEnum(AcademicSubjectResourceCategory)            |
| weeklyDateFrom     | string \| undefined                                                                             | yes      | @IsOptional(); @Matches(/^/d{4}-/d{2}-/d{2}$/u)                    |
| weeklyDateTo       | string \| undefined                                                                             | yes      | @IsOptional(); @Matches(/^/d{4}-/d{2}-/d{2}$/u)                    |
| sessionStartAtFrom | string \| undefined                                                                             | yes      | @IsOptional(); @IsISO8601({ strict: true, strictSeparator: true }) |
| sessionStartAtTo   | string \| undefined                                                                             | yes      | @IsOptional(); @IsISO8601({ strict: true, strictSeparator: true }) |
| sessionPlatform    | import("node_modules/.prisma/client/index").$Enums.AcademicOnlineSessionPlatform \| undefined   | yes      | @IsOptional(); @IsEnum(AcademicOnlineSessionPlatform)              |
| guardianPriority   | import("node_modules/.prisma/client/index").$Enums.AcademicGuardianNotePriority \| undefined    | yes      | @IsOptional(); @IsEnum(AcademicGuardianNotePriority)               |
| tag                | string \| undefined                                                                             | yes      | @IsOptional(); @IsString(); @MaxLength(80)                         |
| search             | string \| undefined                                                                             | yes      | @IsOptional(); @IsString(); @MaxLength(120)                        |
| page               | number \| undefined                                                                             | yes      | @IsOptional(); @Type(() => Number); @IsInt(); @Min(1)              |
| limit              | number \| undefined                                                                             | yes      | @IsOptional(); @Type(() => Number); @IsInt(); @Min(1); @Max(100)   |

### ListCommunicationNotificationDeliveriesQueryDto

Source: [ListCommunicationNotificationDeliveriesQueryDto](../src/modules/communication/dto/communication-notification.dto.ts#L145).

| Field           | Type                | Optional | Source validation                                                  |
| --------------- | ------------------- | -------- | ------------------------------------------------------------------ |
| notificationId  | string \| undefined | yes      | @IsOptional(); @IsUUID()                                           |
| recipientUserId | string \| undefined | yes      | @IsOptional(); @IsUUID()                                           |
| channel         | string \| undefined | yes      | @IsOptional(); @IsIn(COMMUNICATION_NOTIFICATION_DELIVERY_CHANNELS) |
| status          | string \| undefined | yes      | @IsOptional(); @IsIn(COMMUNICATION_NOTIFICATION_DELIVERY_STATUSES) |
| deliveryStatus  | string \| undefined | yes      | @IsOptional(); @IsIn(COMMUNICATION_NOTIFICATION_DELIVERY_STATUSES) |
| provider        | string \| undefined | yes      | @IsOptional(); @IsString(); @MaxLength(100)                        |
| createdFrom     | string \| undefined | yes      | @IsOptional(); @IsISO8601()                                        |
| createdTo       | string \| undefined | yes      | @IsOptional(); @IsISO8601()                                        |
| limit           | number \| undefined | yes      | @IsOptional(); @Type(() => Number); @IsInt(); @Min(1); @Max(100)   |
| page            | number \| undefined | yes      | @IsOptional(); @Type(() => Number); @IsInt(); @Min(1); @Max(10000) |

### ListCommunicationNotificationsQueryDto

Source: [ListCommunicationNotificationsQueryDto](../src/modules/communication/dto/communication-notification.dto.ts#L92).

| Field           | Type                | Optional | Source validation                                                  |
| --------------- | ------------------- | -------- | ------------------------------------------------------------------ |
| status          | string \| undefined | yes      | @IsOptional(); @IsIn(COMMUNICATION_NOTIFICATION_STATUSES)          |
| priority        | string \| undefined | yes      | @IsOptional(); @IsIn(COMMUNICATION_NOTIFICATION_PRIORITIES)        |
| type            | string \| undefined | yes      | @IsOptional(); @IsIn(COMMUNICATION_NOTIFICATION_TYPES)             |
| sourceModule    | string \| undefined | yes      | @IsOptional(); @IsIn(COMMUNICATION_NOTIFICATION_SOURCE_MODULES)    |
| sourceType      | string \| undefined | yes      | @IsOptional(); @IsString(); @MaxLength(100)                        |
| sourceId        | string \| undefined | yes      | @IsOptional(); @IsUUID()                                           |
| recipientUserId | string \| undefined | yes      | @IsOptional(); @IsUUID()                                           |
| createdFrom     | string \| undefined | yes      | @IsOptional(); @IsISO8601()                                        |
| createdTo       | string \| undefined | yes      | @IsOptional(); @IsISO8601()                                        |
| limit           | number \| undefined | yes      | @IsOptional(); @Type(() => Number); @IsInt(); @Min(1); @Max(100)   |
| page            | number \| undefined | yes      | @IsOptional(); @Type(() => Number); @IsInt(); @Min(1); @Max(10000) |

### ListParentNotificationsQueryDto

Source: [ListParentNotificationsQueryDto](../src/modules/parent-app/notifications/dto/parent-notifications.dto.ts#L21).

| Field        | Type                | Optional | Source validation                                                                                                            |
| ------------ | ------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| status       | string \| undefined | yes      | @IsOptional(); @Transform(({ value }) => toLowerOptionalString(value)); @IsIn(COMMUNICATION_NOTIFICATION_STATUSES)           |
| priority     | string \| undefined | yes      | @IsOptional(); @Transform(({ value }) => toLowerOptionalString(value)); @IsIn(COMMUNICATION_NOTIFICATION_PRIORITIES)         |
| type         | string \| undefined | yes      | @IsOptional(); @Transform(({ value }) => toLowerOptionalString(value)); @IsIn(COMMUNICATION_NOTIFICATION_TYPES)              |
| sourceModule | string \| undefined | yes      | @IsOptional(); @Transform(({ value }) => toLowerOptionalString(value)); @IsIn(COMMUNICATION_NOTIFICATION_SOURCE_MODULES)     |
| createdFrom  | string \| undefined | yes      | @IsOptional(); @IsISO8601()                                                                                                  |
| createdTo    | string \| undefined | yes      | @IsOptional(); @IsISO8601()                                                                                                  |
| unreadOnly   | string \| undefined | yes      | @IsOptional(); @Transform(({ value }) => toLowerOptionalString(value)); @IsIn(COMMUNICATION_APP_NOTIFICATION_BOOLEAN_VALUES) |
| category     | string \| undefined | yes      | @IsOptional(); @Transform(({ value }) => toLowerOptionalString(value)); @IsIn(COMMUNICATION_APP_NOTIFICATION_CATEGORIES)     |
| groupBy      | string \| undefined | yes      | @IsOptional(); @IsIn(COMMUNICATION_APP_NOTIFICATION_GROUP_BY_VALUES)                                                         |
| limit        | number \| undefined | yes      | @IsOptional(); @Type(() => Number); @IsInt(); @Min(1); @Max(100)                                                             |
| page         | number \| undefined | yes      | @IsOptional(); @Type(() => Number); @IsInt(); @Min(1); @Max(10000)                                                           |

### ListStudentNotificationsQueryDto

Source: [ListStudentNotificationsQueryDto](../src/modules/student-app/notifications/dto/student-notifications.dto.ts#L21).

| Field        | Type                | Optional | Source validation                                                                                                            |
| ------------ | ------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| status       | string \| undefined | yes      | @IsOptional(); @Transform(({ value }) => toLowerOptionalString(value)); @IsIn(COMMUNICATION_NOTIFICATION_STATUSES)           |
| priority     | string \| undefined | yes      | @IsOptional(); @Transform(({ value }) => toLowerOptionalString(value)); @IsIn(COMMUNICATION_NOTIFICATION_PRIORITIES)         |
| type         | string \| undefined | yes      | @IsOptional(); @Transform(({ value }) => toLowerOptionalString(value)); @IsIn(COMMUNICATION_NOTIFICATION_TYPES)              |
| sourceModule | string \| undefined | yes      | @IsOptional(); @Transform(({ value }) => toLowerOptionalString(value)); @IsIn(COMMUNICATION_NOTIFICATION_SOURCE_MODULES)     |
| createdFrom  | string \| undefined | yes      | @IsOptional(); @IsISO8601()                                                                                                  |
| createdTo    | string \| undefined | yes      | @IsOptional(); @IsISO8601()                                                                                                  |
| unreadOnly   | string \| undefined | yes      | @IsOptional(); @Transform(({ value }) => toLowerOptionalString(value)); @IsIn(COMMUNICATION_APP_NOTIFICATION_BOOLEAN_VALUES) |
| category     | string \| undefined | yes      | @IsOptional(); @Transform(({ value }) => toLowerOptionalString(value)); @IsIn(COMMUNICATION_APP_NOTIFICATION_CATEGORIES)     |
| groupBy      | string \| undefined | yes      | @IsOptional(); @IsIn(COMMUNICATION_APP_NOTIFICATION_GROUP_BY_VALUES)                                                         |
| limit        | number \| undefined | yes      | @IsOptional(); @Type(() => Number); @IsInt(); @Min(1); @Max(100)                                                             |
| page         | number \| undefined | yes      | @IsOptional(); @Type(() => Number); @IsInt(); @Min(1); @Max(10000)                                                           |

### ListTeacherAcademicContentPreparationTemplatesQueryDto

Source: [ListTeacherAcademicContentPreparationTemplatesQueryDto](../src/modules/teacher-app/academic-content/dto/teacher-academic-content-files.dto.ts#L11).

| Field  | Type                | Optional | Source validation                                                |
| ------ | ------------------- | -------- | ---------------------------------------------------------------- |
| search | string \| undefined | yes      | @IsOptional(); @IsString(); @MaxLength(120)                      |
| page   | number \| undefined | yes      | @IsOptional(); @Type(() => Number); @IsInt(); @Min(1)            |
| limit  | number \| undefined | yes      | @IsOptional(); @Type(() => Number); @IsInt(); @Min(1); @Max(100) |

### ListTeacherAcademicContentQueryDto

Source: [ListTeacherAcademicContentQueryDto](../src/modules/teacher-app/academic-content/dto/teacher-academic-content.dto.ts#L14).

| Field              | Type                                                                                          | Optional | Source validation                                                  |
| ------------------ | --------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------ |
| classId            | string \| undefined                                                                           | yes      | @IsOptional(); @IsUUID()                                           |
| type               | import("node_modules/.prisma/client/index").$Enums.AcademicContentType \| undefined           | yes      | @IsOptional(); @IsEnum(AcademicContentType)                        |
| audience           | import("node_modules/.prisma/client/index").$Enums.AcademicContentAudienceType \| undefined   | yes      | @IsOptional(); @IsEnum(AcademicContentAudienceType)                |
| search             | string \| undefined                                                                           | yes      | @IsOptional(); @IsString(); @MaxLength(120)                        |
| page               | number \| undefined                                                                           | yes      | @IsOptional(); @Type(() => Number); @IsInt(); @Min(1)              |
| limit              | number \| undefined                                                                           | yes      | @IsOptional(); @Type(() => Number); @IsInt(); @Min(1); @Max(100)   |
| status             | import("node_modules/.prisma/client/index").$Enums.AcademicContentStatus \| undefined         | yes      | @IsOptional(); @IsEnum(AcademicContentStatus)                      |
| tag                | string \| undefined                                                                           | yes      | @IsOptional(); @IsString(); @MaxLength(80)                         |
| weeklyDateFrom     | string \| undefined                                                                           | yes      | @IsOptional(); @Matches(/^/d{4}-/d{2}-/d{2}$/u)                    |
| weeklyDateTo       | string \| undefined                                                                           | yes      | @IsOptional(); @Matches(/^/d{4}-/d{2}-/d{2}$/u)                    |
| sessionStartAtFrom | string \| undefined                                                                           | yes      | @IsOptional(); @IsISO8601({ strict: true, strictSeparator: true }) |
| sessionStartAtTo   | string \| undefined                                                                           | yes      | @IsOptional(); @IsISO8601({ strict: true, strictSeparator: true }) |
| sessionPlatform    | import("node_modules/.prisma/client/index").$Enums.AcademicOnlineSessionPlatform \| undefined | yes      | @IsOptional(); @IsEnum(AcademicOnlineSessionPlatform)              |
| guardianPriority   | import("node_modules/.prisma/client/index").$Enums.AcademicGuardianNotePriority \| undefined  | yes      | @IsOptional(); @IsEnum(AcademicGuardianNotePriority)               |

### ListTeacherNotificationsQueryDto

Source: [ListTeacherNotificationsQueryDto](../src/modules/teacher-app/notifications/dto/teacher-notifications.dto.ts#L19).

| Field        | Type                | Optional | Source validation                                                                                                            |
| ------------ | ------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| status       | string \| undefined | yes      | @IsOptional(); @IsIn(COMMUNICATION_NOTIFICATION_STATUSES)                                                                    |
| priority     | string \| undefined | yes      | @IsOptional(); @IsIn(COMMUNICATION_NOTIFICATION_PRIORITIES)                                                                  |
| type         | string \| undefined | yes      | @IsOptional(); @IsIn(COMMUNICATION_NOTIFICATION_TYPES)                                                                       |
| sourceModule | string \| undefined | yes      | @IsOptional(); @IsIn(COMMUNICATION_NOTIFICATION_SOURCE_MODULES)                                                              |
| createdFrom  | string \| undefined | yes      | @IsOptional(); @IsISO8601()                                                                                                  |
| createdTo    | string \| undefined | yes      | @IsOptional(); @IsISO8601()                                                                                                  |
| unreadOnly   | string \| undefined | yes      | @IsOptional(); @Transform(({ value }) => toLowerOptionalString(value)); @IsIn(COMMUNICATION_APP_NOTIFICATION_BOOLEAN_VALUES) |
| category     | string \| undefined | yes      | @IsOptional(); @Transform(({ value }) => toLowerOptionalString(value)); @IsIn(COMMUNICATION_APP_NOTIFICATION_CATEGORIES)     |
| groupBy      | string \| undefined | yes      | @IsOptional(); @IsIn(COMMUNICATION_APP_NOTIFICATION_GROUP_BY_VALUES)                                                         |
| limit        | number \| undefined | yes      | @IsOptional(); @Type(() => Number); @IsInt(); @Min(1); @Max(100)                                                             |
| page         | number \| undefined | yes      | @IsOptional(); @Type(() => Number); @IsInt(); @Min(1); @Max(10000)                                                           |

### ParentAcademicContentAssetAccessDto

Source: [ParentAcademicContentAssetAccessDto](../src/modules/parent-app/academic-content/dto/parent-academic-content-asset-access.dto.ts#L5).

| Field | Type                           | Optional | Source validation              |
| ----- | ------------------------------ | -------- | ------------------------------ |
| mode  | AcademicContentAssetAccessMode | no       | @IsIn(['preview', 'download']) |

### ParentAcademicContentQueryDto

Source: [ParentAcademicContentQueryDto](../src/modules/parent-app/academic-content/dto/parent-academic-content-query.dto.ts#L53).

| Field              | Type                                                                                                                 | Optional | Source validation                                                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| type               | "WEEKLY_PLAN" \| "GUARDIAN_WEEKLY_NOTE" \| "SUBJECT_RESOURCE" \| "ONLINE_SESSION" \| "GENERAL_RESOURCE" \| undefined | yes      | @IsOptional(); @IsIn(PARENT_ACADEMIC_CONTENT_TYPES)                                                                    |
| subjectId          | string \| undefined                                                                                                  | yes      | @IsOptional(); @IsUUID()                                                                                               |
| search             | string \| undefined                                                                                                  | yes      | @IsOptional(); @Transform(({ value }: { value: unknown }) => trimmed(value)); @IsString(); @MaxLength(120)             |
| tag                | string \| undefined                                                                                                  | yes      | @IsOptional(); @Transform(({ value }: { value: unknown }) => trimmed(value)); @IsString(); @MaxLength(80)              |
| weeklyDateFrom     | string \| undefined                                                                                                  | yes      | @IsOptional(); @Matches(/^/d{4}-/d{2}-/d{2}$/u); @IsDateString({ strict: true })                                       |
| weeklyDateTo       | string \| undefined                                                                                                  | yes      | @IsOptional(); @Matches(/^/d{4}-/d{2}-/d{2}$/u); @IsDateString({ strict: true }); @Validate(OrderedRange)              |
| sessionStartAtFrom | string \| undefined                                                                                                  | yes      | @IsOptional(); @IsISO8601({ strict: true, strictSeparator: true }); @Matches(INSTANT_PATTERN)                          |
| sessionStartAtTo   | string \| undefined                                                                                                  | yes      | @IsOptional(); @IsISO8601({ strict: true, strictSeparator: true }); @Matches(INSTANT_PATTERN); @Validate(OrderedRange) |
| sessionPlatform    | import("node_modules/.prisma/client/index").$Enums.AcademicOnlineSessionPlatform \| undefined                        | yes      | @IsOptional(); @IsEnum(AcademicOnlineSessionPlatform)                                                                  |
| page               | number \| undefined                                                                                                  | yes      | @IsOptional(); @Type(() => Number); @IsInt(); @Min(1); @Max(Number.MAX_SAFE_INTEGER)                                   |
| limit              | number \| undefined                                                                                                  | yes      | @IsOptional(); @Type(() => Number); @IsInt(); @Min(1); @Max(100)                                                       |

### RecordAcademicContentEngagementDto

Source: [RecordAcademicContentEngagementDto](../src/modules/academics/academic-content/dto/academic-content-engagement.dto.ts#L5).

| Field                 | Type                               | Optional | Source validation                                                                  |
| --------------------- | ---------------------------------- | -------- | ---------------------------------------------------------------------------------- |
| clientRequestId       | string                             | no       | @IsUUID()                                                                          |
| eventType             | AcademicContentEngagementEventType | no       | @IsEnum(AcademicContentEngagementEventType)                                        |
| expectedPublicationId | string                             | no       | @IsUUID()                                                                          |
| fileId                | string \| undefined                | yes      | @ValidateIf((\_object: unknown, value: unknown) => value !== undefined); @IsUUID() |
| revisionLinkId        | string \| undefined                | yes      | @ValidateIf((\_object: unknown, value: unknown) => value !== undefined); @IsUUID() |

### RegisterAppDeviceTokenDto

Source: [RegisterAppDeviceTokenDto](../src/modules/app-device-tokens/dto/app-device-token.dto.ts#L32).

| Field      | Type                | Optional | Source validation                                                                                                                     |
| ---------- | ------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| token      | string              | no       | @Transform(({ value }) => trimRequiredString(value)); @IsString(); @MaxLength(APP_DEVICE_TOKEN_MAX_LENGTH)                            |
| platform   | string              | no       | @Transform(({ value }) => lowerPlatform(value)); @IsString(); @IsIn(APP_DEVICE_TOKEN_PLATFORM_VALUES)                                 |
| deviceId   | string \| undefined | yes      | @IsOptional(); @Transform(({ value }) => trimOptionalString(value)); @IsString(); @MaxLength(APP_DEVICE_TOKEN_DEVICE_ID_MAX_LENGTH)   |
| appVersion | string \| undefined | yes      | @IsOptional(); @Transform(({ value }) => trimOptionalString(value)); @IsString(); @MaxLength(APP_DEVICE_TOKEN_APP_VERSION_MAX_LENGTH) |
| locale     | string \| undefined | yes      | @IsOptional(); @Transform(({ value }) => trimOptionalString(value)); @IsString(); @MaxLength(APP_DEVICE_TOKEN_LOCALE_MAX_LENGTH)      |
| timezone   | string \| undefined | yes      | @IsOptional(); @Transform(({ value }) => trimOptionalString(value)); @IsString(); @MaxLength(APP_DEVICE_TOKEN_TIMEZONE_MAX_LENGTH)    |

### ReplaceAcademicContentGuardianNoteDetailDto

Source: [ReplaceAcademicContentGuardianNoteDetailDto](../src/modules/academics/academic-content/dto/academic-content-type-detail.dto.ts#L101).

| Field                   | Type                                                                            | Optional | Source validation                     |
| ----------------------- | ------------------------------------------------------------------------------- | -------- | ------------------------------------- |
| body                    | string                                                                          | no       | @IsString()                           |
| priority                | import("node_modules/.prisma/client/index").$Enums.AcademicGuardianNotePriority | no       | @IsEnum(AcademicGuardianNotePriority) |
| requiresAcknowledgement | boolean                                                                         | no       | @IsBoolean()                          |

### ReplaceAcademicContentLinksDto

Source: [ReplaceAcademicContentLinksDto](../src/modules/academics/academic-content/dto/academic-content-links-tags.dto.ts#L23).

| Field | Type                          | Optional | Source validation                                                                                         |
| ----- | ----------------------------- | -------- | --------------------------------------------------------------------------------------------------------- |
| links | AcademicContentLinkInputDto[] | no       | @IsArray(); @ArrayMaxSize(100); @ValidateNested({ each: true }); @Type(() => AcademicContentLinkInputDto) |

### ReplaceAcademicContentOnlineSessionDetailDto

Source: [ReplaceAcademicContentOnlineSessionDetailDto](../src/modules/academics/academic-content/dto/academic-content-type-detail.dto.ts#L124).

| Field            | Type                                                                             | Optional | Source validation                      |
| ---------------- | -------------------------------------------------------------------------------- | -------- | -------------------------------------- |
| platform         | import("node_modules/.prisma/client/index").$Enums.AcademicOnlineSessionPlatform | no       | @IsEnum(AcademicOnlineSessionPlatform) |
| providerName     | string \| null \| undefined                                                      | yes      | @IsOptional(); @IsString()             |
| joinUrl          | string                                                                           | no       | @IsString()                            |
| accessCode       | string \| null \| undefined                                                      | yes      | @IsOptional(); @IsString()             |
| instructions     | string \| null \| undefined                                                      | yes      | @IsOptional(); @IsString()             |
| startAt          | string                                                                           | no       | @IsString()                            |
| endAt            | string                                                                           | no       | @IsString()                            |
| timezone         | string                                                                           | no       | @IsString()                            |
| timetableEntryId | string \| null \| undefined                                                      | yes      | @IsOptional(); @IsUUID()               |

### ReplaceAcademicContentPreparationDetailDto

Source: [ReplaceAcademicContentPreparationDetailDto](../src/modules/academics/academic-content/dto/academic-content-type-detail.dto.ts#L19).

| Field              | Type                        | Optional | Source validation                     |
| ------------------ | --------------------------- | -------- | ------------------------------------- |
| topic              | string \| null \| undefined | yes      | @IsOptional(); @IsString()            |
| objectives         | string[]                    | no       | @IsArray(); @IsString({ each: true }) |
| learningOutcomes   | string[]                    | no       | @IsArray(); @IsString({ each: true }) |
| teachingStrategies | string[]                    | no       | @IsArray(); @IsString({ each: true }) |
| activities         | string[]                    | no       | @IsArray(); @IsString({ each: true }) |
| resourceNotes      | string \| null \| undefined | yes      | @IsOptional(); @IsString()            |
| assessmentNotes    | string \| null \| undefined | yes      | @IsOptional(); @IsString()            |
| teacherNotes       | string \| null \| undefined | yes      | @IsOptional(); @IsString()            |
| curriculumId       | string \| null \| undefined | yes      | @IsOptional(); @IsUUID()              |
| curriculumUnitId   | string \| null \| undefined | yes      | @IsOptional(); @IsUUID()              |
| curriculumLessonId | string \| null \| undefined | yes      | @IsOptional(); @IsUUID()              |
| lessonPlanId       | string \| null \| undefined | yes      | @IsOptional(); @IsUUID()              |
| lessonPlanItemId   | string \| null \| undefined | yes      | @IsOptional(); @IsUUID()              |
| timetableEntryId   | string \| null \| undefined | yes      | @IsOptional(); @IsUUID()              |

### ReplaceAcademicContentSubjectResourceDetailDto

Source: [ReplaceAcademicContentSubjectResourceDetailDto](../src/modules/academics/academic-content/dto/academic-content-type-detail.dto.ts#L109).

| Field              | Type                                                                               | Optional | Source validation                        |
| ------------------ | ---------------------------------------------------------------------------------- | -------- | ---------------------------------------- |
| resourceCategory   | import("node_modules/.prisma/client/index").$Enums.AcademicSubjectResourceCategory | no       | @IsEnum(AcademicSubjectResourceCategory) |
| curriculumId       | string \| null \| undefined                                                        | yes      | @IsOptional(); @IsUUID()                 |
| curriculumUnitId   | string \| null \| undefined                                                        | yes      | @IsOptional(); @IsUUID()                 |
| curriculumLessonId | string \| null \| undefined                                                        | yes      | @IsOptional(); @IsUUID()                 |

### ReplaceAcademicContentTagsDto

Source: [ReplaceAcademicContentTagsDto](../src/modules/academics/academic-content/dto/academic-content-links-tags.dto.ts#L39).

| Field | Type                         | Optional | Source validation                                                                                        |
| ----- | ---------------------------- | -------- | -------------------------------------------------------------------------------------------------------- |
| tags  | AcademicContentTagInputDto[] | no       | @IsArray(); @ArrayMaxSize(100); @ValidateNested({ each: true }); @Type(() => AcademicContentTagInputDto) |

### ReplaceAcademicContentTargetsDto

Source: [ReplaceAcademicContentTargetsDto](../src/modules/academics/academic-content/dto/academic-content-request.dto.ts#L232).

| Field   | Type                       | Optional | Source validation                                                                  |
| ------- | -------------------------- | -------- | ---------------------------------------------------------------------------------- |
| targets | AcademicContentTargetDto[] | no       | @IsArray(); @ValidateNested({ each: true }); @Type(() => AcademicContentTargetDto) |

### ReplaceAcademicContentWeeklyPlanDetailDto

Source: [ReplaceAcademicContentWeeklyPlanDetailDto](../src/modules/academics/academic-content/dto/academic-content-type-detail.dto.ts#L69).

| Field                 | Type                        | Optional | Source validation                          |
| --------------------- | --------------------------- | -------- | ------------------------------------------ |
| weekStartDate         | string                      | no       | @IsString()                                |
| weekEndDate           | string                      | no       | @IsString()                                |
| objectives            | string[]                    | no       | @IsArray(); @IsString({ each: true })      |
| topics                | string[]                    | no       | @IsArray(); @IsString({ each: true })      |
| expectedHomework      | string \| null \| undefined | yes      | @IsOptional(); @IsString()                 |
| upcomingAssessments   | string \| null \| undefined | yes      | @IsOptional(); @IsString()                 |
| notes                 | string \| null \| undefined | yes      | @IsOptional(); @IsString()                 |
| homeworkAssignmentIds | string[]                    | no       | @IsArray(); @IsUUID('all', { each: true }) |
| gradeAssessmentIds    | string[]                    | no       | @IsArray(); @IsUUID('all', { each: true }) |

### ReplaceTeacherAcademicContentTargetsDto

Source: [ReplaceTeacherAcademicContentTargetsDto](../src/modules/teacher-app/academic-content/dto/teacher-academic-content-authoring.dto.ts#L16).

| Field    | Type     | Optional | Source validation                                                                                   |
| -------- | -------- | -------- | --------------------------------------------------------------------------------------------------- |
| classIds | string[] | no       | @IsArray(); @ArrayMinSize(1); @ArrayMaxSize(50); @ArrayUnique(); @IsUUID(undefined, { each: true }) |

### StudentAcademicContentAssetAccessDto

Source: [StudentAcademicContentAssetAccessDto](../src/modules/student-app/academic-content/dto/student-academic-content-asset-access.dto.ts#L5).

| Field | Type                           | Optional | Source validation              |
| ----- | ------------------------------ | -------- | ------------------------------ |
| mode  | AcademicContentAssetAccessMode | no       | @IsIn(['preview', 'download']) |

### StudentAcademicContentQueryDto

Source: [StudentAcademicContentQueryDto](../src/modules/student-app/academic-content/dto/student-academic-content-query.dto.ts#L53).

| Field              | Type                                                                                          | Optional | Source validation                                                                                                      |
| ------------------ | --------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| type               | "WEEKLY_PLAN" \| "SUBJECT_RESOURCE" \| "ONLINE_SESSION" \| "GENERAL_RESOURCE" \| undefined    | yes      | @IsOptional(); @IsIn(STUDENT_ACADEMIC_CONTENT_TYPES)                                                                   |
| subjectId          | string \| undefined                                                                           | yes      | @IsOptional(); @IsUUID()                                                                                               |
| search             | string \| undefined                                                                           | yes      | @IsOptional(); @Transform(({ value }: { value: unknown }) => trimmed(value)); @IsString(); @MaxLength(120)             |
| tag                | string \| undefined                                                                           | yes      | @IsOptional(); @Transform(({ value }: { value: unknown }) => trimmed(value)); @IsString(); @MaxLength(80)              |
| weeklyDateFrom     | string \| undefined                                                                           | yes      | @IsOptional(); @Matches(/^/d{4}-/d{2}-/d{2}$/u); @IsDateString({ strict: true })                                       |
| weeklyDateTo       | string \| undefined                                                                           | yes      | @IsOptional(); @Matches(/^/d{4}-/d{2}-/d{2}$/u); @IsDateString({ strict: true }); @Validate(OrderedRange)              |
| sessionStartAtFrom | string \| undefined                                                                           | yes      | @IsOptional(); @IsISO8601({ strict: true, strictSeparator: true }); @Matches(INSTANT_PATTERN)                          |
| sessionStartAtTo   | string \| undefined                                                                           | yes      | @IsOptional(); @IsISO8601({ strict: true, strictSeparator: true }); @Matches(INSTANT_PATTERN); @Validate(OrderedRange) |
| sessionPlatform    | import("node_modules/.prisma/client/index").$Enums.AcademicOnlineSessionPlatform \| undefined | yes      | @IsOptional(); @IsEnum(AcademicOnlineSessionPlatform)                                                                  |
| page               | number \| undefined                                                                           | yes      | @IsOptional(); @Type(() => Number); @IsInt(); @Min(1); @Max(Number.MAX_SAFE_INTEGER)                                   |
| limit              | number \| undefined                                                                           | yes      | @IsOptional(); @Type(() => Number); @IsInt(); @Min(1); @Max(100)                                                       |

### TeacherAcademicContentAnalyticsQueryDto

Source: [TeacherAcademicContentAnalyticsQueryDto](../src/modules/teacher-app/academic-content/dto/teacher-academic-content-analytics.dto.ts#L10).

| Field | Type                                | Optional | Source validation                                                                                                 |
| ----- | ----------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------- |
| range | "7d" \| "30d" \| "90d" \| undefined | yes      | @ValidateIf((\_object: unknown, value: unknown) => value !== undefined); @IsIn(ACADEMIC_CONTENT_ANALYTICS_RANGES) |

### TeacherAcademicContentAssetAccessQueryDto

Source: [TeacherAcademicContentAssetAccessQueryDto](../src/modules/teacher-app/academic-content/dto/teacher-academic-content-files.dto.ts#L5).

| Field | Type                    | Optional | Source validation              |
| ----- | ----------------------- | -------- | ------------------------------ |
| mode  | "preview" \| "download" | no       | @IsIn(['preview', 'download']) |

### UnregisterAppDeviceTokenDto

Source: [UnregisterAppDeviceTokenDto](../src/modules/app-device-tokens/dto/app-device-token.dto.ts#L68).

| Field    | Type                | Optional | Source validation                                                                                                                                                                        |
| -------- | ------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| token    | string \| undefined | yes      | @ValidateIf((body, value) => value !== undefined \|\| !body.deviceId); @Transform(({ value }) => trimOptionalString(value)); @IsString(); @MaxLength(APP_DEVICE_TOKEN_MAX_LENGTH)        |
| deviceId | string \| undefined | yes      | @ValidateIf((body, value) => value !== undefined \|\| !body.token); @Transform(({ value }) => trimOptionalString(value)); @IsString(); @MaxLength(APP_DEVICE_TOKEN_DEVICE_ID_MAX_LENGTH) |

### UpdateAcademicContentDto

Source: [UpdateAcademicContentDto](../src/modules/academics/academic-content/dto/academic-content-request.dto.ts#L56).

| Field       | Type                                                                                        | Optional | Source validation                                   |
| ----------- | ------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------- |
| title       | string \| undefined                                                                         | yes      | @IsOptional(); @IsString(); @MaxLength(180)         |
| description | string \| null \| undefined                                                                 | yes      | @IsOptional(); @IsString(); @MaxLength(4000)        |
| audience    | import("node_modules/.prisma/client/index").$Enums.AcademicContentAudienceType \| undefined | yes      | @IsOptional(); @IsEnum(AcademicContentAudienceType) |

### UpdateAcademicContentFilePolicyDto

Source: [UpdateAcademicContentFilePolicyDto](../src/modules/academics/academic-content/dto/academic-content-file-policy.dto.ts#L10).

| Field                 | Type                 | Optional | Source validation                                                       |
| --------------------- | -------------------- | -------- | ----------------------------------------------------------------------- |
| attachmentsEnabled    | boolean \| undefined | yes      | @IsOptional(); @IsBoolean()                                             |
| maximumFileSizeBytes  | string \| undefined  | yes      | @IsOptional(); @IsString(); @MaxLength(11); @Matches(/^[1-9][0-9]\*$/u) |
| documentsEnabled      | boolean \| undefined | yes      | @IsOptional(); @IsBoolean()                                             |
| imagesEnabled         | boolean \| undefined | yes      | @IsOptional(); @IsBoolean()                                             |
| videosEnabled         | boolean \| undefined | yes      | @IsOptional(); @IsBoolean()                                             |
| audioEnabled          | boolean \| undefined | yes      | @IsOptional(); @IsBoolean()                                             |
| archivesEnabled       | boolean \| undefined | yes      | @IsOptional(); @IsBoolean()                                             |
| otherFilesEnabled     | boolean \| undefined | yes      | @IsOptional(); @IsBoolean()                                             |
| allowStudentDownload  | boolean \| undefined | yes      | @IsOptional(); @IsBoolean()                                             |
| allowGuardianDownload | boolean \| undefined | yes      | @IsOptional(); @IsBoolean()                                             |
| allowInlinePreview    | boolean \| undefined | yes      | @IsOptional(); @IsBoolean()                                             |

### UpdateAcademicContentNotificationPolicyDto

Source: [UpdateAcademicContentNotificationPolicyDto](../src/modules/academics/academic-content/dto/academic-content-notification-policy.dto.ts#L18).

| Field                                  | Type                  | Optional | Source validation                                                                                                                                                                                                                                                                                  |
| -------------------------------------- | --------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| notificationsEnabled                   | boolean \| undefined  | yes      | @ValidateIf((\_object, value: unknown) => value !== undefined); @IsBoolean()                                                                                                                                                                                                                       |
| studentNotificationsEnabled            | boolean \| undefined  | yes      | @ValidateIf((\_object, value: unknown) => value !== undefined); @IsBoolean()                                                                                                                                                                                                                       |
| guardianNotificationsEnabled           | boolean \| undefined  | yes      | @ValidateIf((\_object, value: unknown) => value !== undefined); @IsBoolean()                                                                                                                                                                                                                       |
| weeklyPlanNotificationsEnabled         | boolean \| undefined  | yes      | @ValidateIf((\_object, value: unknown) => value !== undefined); @IsBoolean()                                                                                                                                                                                                                       |
| guardianWeeklyNoteNotificationsEnabled | boolean \| undefined  | yes      | @ValidateIf((\_object, value: unknown) => value !== undefined); @IsBoolean()                                                                                                                                                                                                                       |
| subjectResourceNotificationsEnabled    | boolean \| undefined  | yes      | @ValidateIf((\_object, value: unknown) => value !== undefined); @IsBoolean()                                                                                                                                                                                                                       |
| onlineSessionNotificationsEnabled      | boolean \| undefined  | yes      | @ValidateIf((\_object, value: unknown) => value !== undefined); @IsBoolean()                                                                                                                                                                                                                       |
| generalResourceNotificationsEnabled    | boolean \| undefined  | yes      | @ValidateIf((\_object, value: unknown) => value !== undefined); @IsBoolean()                                                                                                                                                                                                                       |
| significantUpdateNotificationsEnabled  | boolean \| undefined  | yes      | @ValidateIf((\_object, value: unknown) => value !== undefined); @IsBoolean()                                                                                                                                                                                                                       |
| cancellationNotificationsEnabled       | boolean \| undefined  | yes      | @ValidateIf((\_object, value: unknown) => value !== undefined); @IsBoolean()                                                                                                                                                                                                                       |
| onlineSessionRemindersEnabled          | boolean \| undefined  | yes      | @ValidateIf((\_object, value: unknown) => value !== undefined); @IsBoolean()                                                                                                                                                                                                                       |
| onlineSessionReminderOffsetsMinutes    | number[] \| undefined | yes      | @ValidateIf((\_object, value: unknown) => value !== undefined); @IsArray(); @ArrayMaxSize(ACADEMIC_CONTENT_REMINDER_MAX_OFFSETS); @ArrayUnique(); @IsInt({ each: true }); @Min(ACADEMIC_CONTENT_REMINDER_MIN_MINUTES, { each: true }); @Max(ACADEMIC_CONTENT_REMINDER_MAX_MINUTES, { each: true }) |

### UpdateAcademicContentPreparationTemplateDto

Source: [UpdateAcademicContentPreparationTemplateDto](../src/modules/academics/academic-content/dto/academic-content-preparation-template.dto.ts#L127).

| Field              | Type                        | Optional | Source validation                                                                                        |
| ------------------ | --------------------------- | -------- | -------------------------------------------------------------------------------------------------------- |
| name               | string \| undefined         | yes      | @IsString(); @MaxLength(180)                                                                             |
| description        | string \| null \| undefined | yes      | @IsOptional(); @IsString(); @MaxLength(1000)                                                             |
| stageId            | string \| null \| undefined | yes      | @IsOptional(); @IsUUID()                                                                                 |
| subjectId          | string \| null \| undefined | yes      | @IsOptional(); @IsUUID()                                                                                 |
| topic              | string \| null \| undefined | yes      | @IsOptional(); @IsString(); @MaxLength(500)                                                              |
| objectives         | string[] \| undefined       | yes      | @IsOptional(); @IsArray(); @ArrayMaxSize(50); @IsString({ each: true }); @MaxLength(500, { each: true }) |
| learningOutcomes   | string[] \| undefined       | yes      | @IsOptional(); @IsArray(); @ArrayMaxSize(50); @IsString({ each: true }); @MaxLength(500, { each: true }) |
| teachingStrategies | string[] \| undefined       | yes      | @IsOptional(); @IsArray(); @ArrayMaxSize(50); @IsString({ each: true }); @MaxLength(500, { each: true }) |
| activities         | string[] \| undefined       | yes      | @IsOptional(); @IsArray(); @ArrayMaxSize(50); @IsString({ each: true }); @MaxLength(500, { each: true }) |
| resourceNotes      | string \| null \| undefined | yes      | @IsOptional(); @IsString(); @MaxLength(4000)                                                             |
| assessmentNotes    | string \| null \| undefined | yes      | @IsOptional(); @IsString(); @MaxLength(4000)                                                             |
| teacherNotes       | string \| null \| undefined | yes      | @IsOptional(); @IsString(); @MaxLength(4000)                                                             |

### UpdateAcademicContentWorkflowPolicyDto

Source: [UpdateAcademicContentWorkflowPolicyDto](../src/modules/academics/academic-content/dto/academic-content-workflow-policy.dto.ts#L4).

| Field                       | Type                 | Optional | Source validation           |
| --------------------------- | -------------------- | -------- | --------------------------- |
| preparationApprovalRequired | boolean \| undefined | yes      | @IsOptional(); @IsBoolean() |

### UpdateParentNotificationPreferencesDto

Source: [UpdateParentNotificationPreferencesDto](../src/modules/parent-app/notifications/dto/parent-notifications.dto.ts#L239).

| Field       | Type                                               | Optional | Source validation                                                                                                                               |
| ----------- | -------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| preferences | UpdateCommunicationNotificationPreferenceItemDto[] | no       | @IsArray(); @ValidateNested({ each: true }); @Type(() => UpdateCommunicationNotificationPreferenceItemDto); @ArrayMinSize(1); @ArrayMaxSize(20) |

### UpdateStudentNotificationPreferencesDto

Source: [UpdateStudentNotificationPreferencesDto](../src/modules/student-app/notifications/dto/student-notifications.dto.ts#L239).

| Field       | Type                                               | Optional | Source validation                                                                                                                               |
| ----------- | -------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| preferences | UpdateCommunicationNotificationPreferenceItemDto[] | no       | @IsArray(); @ValidateNested({ each: true }); @Type(() => UpdateCommunicationNotificationPreferenceItemDto); @ArrayMinSize(1); @ArrayMaxSize(20) |

### UpdateTeacherNotificationPreferencesDto

Source: [UpdateTeacherNotificationPreferencesDto](../src/modules/teacher-app/notifications/dto/teacher-notifications.dto.ts#L144).

| Field       | Type                                               | Optional | Source validation                                                                                                                               |
| ----------- | -------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| preferences | UpdateCommunicationNotificationPreferenceItemDto[] | no       | @IsArray(); @ValidateNested({ each: true }); @Type(() => UpdateCommunicationNotificationPreferenceItemDto); @ArrayMinSize(1); @ArrayMaxSize(20) |

### UploadFileRequestDto

Source: [UploadFileRequestDto](../src/modules/files/uploads/dto/upload-file-request.dto.ts#L3).

| Field | Type    | Optional | Source validation                                 |
| ----- | ------- | -------- | ------------------------------------------------- |
| file  | unknown | no       | No property validator; use application validation |
