# DTO Dictionary — Official Results v1.0

This dictionary closes the named request/response contracts in [endpoint-catalog.json](endpoint-catalog.json). It is a design contract, not generated OpenAPI or implemented DTO code. Requests reject unknown properties. Optional means the property can be omitted; `null` is accepted only where expressly stated. Response presenters may add compatible, documented properties, but may not alter required-field semantics. The implementation must encode these constraints in DTO/schema validation and publish generated API documentation.

## 1. Shared primitive and boundary rules

Use the types in [10_API_CONTRACTS.md](../10_API_CONTRACTS.md): UUID, Label, DecimalString, Revision, Digest, Instant, LocalDate, AcademicScopeSelector and Capability. Arrays of identifiers are duplicate-free and bounded. If a set participates in a digest, canonicalize its ordering on the server. Client display ordering is a separate explicit integer `order`.

Engineering defaults for ordinary configuration metadata: code 1–64 ASCII letters/digits/underscore, label 1–200 Unicode characters, description at most 2,000 characters, reason/comment 1–2,000 characters when required, search text at most 100 characters. String limits count Unicode code points, not bytes; byte/body limits also apply. Numeric values obey their field definition and the domain ceilings, not these generic text limits. HTML is not an accepted metadata format. These limits can be lowered by platform policy; do not silently truncate input.

`Label` requires nonempty `ar` and `en` strings in canonical stored/read definitions. Authoring may omit `en`; server normalizes it to the supplied Arabic label and records no fabricated translation. `Instant` is UTC ISO-8601. Reporting-period dates are school-local `YYYY-MM-DD`, with startsOn <= endsOn and containment inside the referenced year/term. No caller controls audit actor, school ownership, approval status, calculated output or persisted revision.

`Value` uses `status`. For `RECORDED`, exactly one scalar exists: score, percentage, text, optionCode, outcome or boolean as defined in document 10. Other states have no scalar. Unknown status/kind combinations fail. `evaluation`, calculated outputs, max scores and formatting are read-only properties, never accepted inside a write value. Missing is intentionally written only by CLEAR. Nonrecorded states that the definition marks reason-required need a reason on the mutation.

`CellOperation`: required slotId, fieldId, expectedCellVersion and operation (`SET` or `CLEAR`). SET requires `value`; CLEAR forbids `value` and requires `reason`. Optional `reason` can accompany SET. Score zero and Boolean false are valid payloads. A request cannot contain two operations for the same slot/field. Computed fields cannot appear as targets. Maximum synchronous grid operations: 1,000, with lower configured limits allowed.

## 2. Query allowlists

### Empty

No JSON body and no undeclared query keys. Path UUIDs are validated. Authentication and contextual school resolution still apply.

### ListQuery

Common optional keys are `cursor` (opaque nonempty string), `limit` (integer 1–200, default 50) and an allowlisted `sort` enum. The implementation must document a stable default sort per resource. No SQL fragment, arbitrary field path or freeform filter object is accepted.

| Resource family | Additional allowed filters |
| --- | --- |
| Periods | academicYearId, kind, status; family route returns only entitled published periods |
| Groups | kind, subjectId, archived |
| Templates/presets | ownership PLATFORM/SCHOOL, groupKind, archived, search |
| Sheets | reportingPeriodId, classroomIds, groupIds, stageId, gradeId, sectionId, search |
| Grid/roster | studentIds, selectedFieldIds, search, completeness COMPLETE/PARTIAL, recordedState; search remains within the sheet |
| Reviews | candidateKind RESULT_RELEASE/AGGREGATE, reportingPeriodId, sheetId, candidateStatus, submitterId; only entitled candidates. sheetId selects result-release candidates and is incompatible with candidateKind AGGREGATE. Each returned item carries candidateKind, candidateId, contentDigest, candidateRevision, status and the authorized target summary. |
| Exports/imports | reportingPeriodId, sheetId, creatorId, status, createdFrom, createdTo |
| Import issues | severity ERROR/WARNING/CONFLICT/INFO, code, sheetId, rowRef, fieldId |
| Import changes/rows | sheetId, rowRef, fieldId, changedOnly; all references remain within that batch |
| Operations/items | operation type, target sheet/slot, item status; permission inherited from parent operation |
| History | reportingPeriodId, sheetId, slotId, fieldId, publicationId, action, occurredFrom, occurredTo |
| Missing report | reportingPeriodId required, academic selector fields, groupIds, fieldIds; no other-student scope leakage |

All date ranges require from <= to. Actor filters do not expand visibility. When a cursor is supplied, its bound scope/filter/sort must match the request. Concurrent list changes may require a new cursor; no promise of a frozen export snapshot is implied by ordinary paging.

### CapabilitiesQuery

Optional sheetId, slotId, reportingPeriodId, groupId. A slot must belong to any supplied sheet; group/period must agree. With no target, return only route-level available actions and allowed scope selectors. Do not pretend resource-specific capability is known. No actorId/roleId/schoolId override.

### RosterPreviewRequest

Required expectedRosterGeneration and rosterAsOf (`Instant`); optional selectedSlotIds. Read current eligible authoritative enrollment/subject allocation under the sheet context and return added/moved/withdrawn/ambiguous entries and proposed applicability changes. Preview does not alter enrollment, placement or grades. See [07](../07_GRADEBOOK_AND_ACADEMIC_LIFECYCLE.md).

## 3. Configuration, period and group requests

### PolicyPreviewRequest / PolicyActivateRequest

Preview requires expectedPolicyVersionId (UUID; null only for a school's first policy) and `policy`. The policy allowlist and allowed values are exactly [05 §4–5](../05_SCHOOL_SETTINGS_AND_PERMISSIONS.md) and [school-policy.json](../examples/school-policy.json), excluding fixtureNotice, schemaVersion, schoolId, revision, permissionNote and retentionNote from writable policy content. These excluded fields are example/server metadata. Reject personalDesignEnabled:false, conflicting direct/reviewer settings, unsupported formats before their rollout, limits above platform ceilings, blank-overwrite semantics and destructive history cleanup.

`scopedOverrides` is an array of `{ruleId?, academicScope, groupScope, periodSelector, overrides}`. `overrides` accepts only the configurable policy paths from document 05; it cannot override a global publication suspension or immutable contract rules. Each setting path resolves through the same conflict-safe scope semantics. A new rule gets a server UUID. Existing ruleId must belong to the same policy lineage/school. Activation requires exact previewId, previewDigest and expectedPolicyVersionId. The server reads the persisted normalized proposal; it does not accept a different policy body with confirmation.

### ReportingPeriodCreateRequest

Required kind (`TERM|CUSTOM|YEAR`), academicYearId, code, name, startsOn, endsOn. TERM and CUSTOM require termId; YEAR forbids termId. Optional `classification: PROGRESS|FINAL` defaults FINAL and sets the initial completeness policy, subject to school configuration. The server creates status OPEN, revision 1 and its UUID. Dates must lie inside authoritative academic bounds; name/code do not identify existing periods for update. The same school/year cannot duplicate code.

### GroupCreateRequest

Required kind (`SUBJECT|CUSTOM`), code, label. SUBJECT requires subjectId and forbids a second group for the same school/subject. CUSTOM forbids subjectId. Optional description (max 2,000). Server owns ID and school. A subject label does not create a new academic Subject; it refers to one authoritative record. A numeric custom group is not implicitly academic or part of an overall total.

### VersionedPatchRequest

Required expectedRevision and `patch`, with at least one allowed property. For periods, patch allows name, description, startsOn and endsOn only; date changes require an impact check and fail if they invalidate used roster/candidate context. For groups, patch allows label and description only. Neither route can change kind, school, academic year, term, subject identity, status, approval or archive state. Used semantic changes require a new definition/period or explicit governed migration, not this metadata patch.

### ReasonedCommandRequest

Required expectedRevision and reason. No other body fields. Used for period close/archive, template archive and grant revoke. Each route validates its own transition. Revocation/archive is logical and retains referenced history. A retry with the same idempotency key does not increment revision twice.

Period reopen uses the specialized `PeriodReopenRequest` below rather than this generic shape when archived source state is possible.

### PeriodReopenPreviewRequest / PeriodReopenRequest

An archived-period impact preview requires expectedRevision, reason and targetStatus OPEN/ENTRY_CLOSED. It reports affected sheets/candidates/imports and capabilities that will become available; published history stays immutable. Reopen requires expectedRevision and reason; for ARCHIVED it additionally requires previewId, previewDigest and targetStatus and both periods.manage/archives.manage. The server applies only the exact reviewed target state. Normal ENTRY_CLOSED→OPEN may omit the preview. A scoped CorrectionWindowRequest remains the default for individual archived result corrections.

### CorrectionWindowRequest

Required expectedPeriodRevision, expiresAt, reason, and `targets` with 1–200 `{slotId, releaseUnitId, authorizedActorIds}` entries. Actor arrays are nonempty, duplicate-free and within the school. Expiry must be after now and within the platform's configured bounded correction-window maximum; the initial maximum is 24 hours. Each slot must belong to the period and each unit to its selected definition. Create only under archives.manage and current delegation authority. This window permits the named correction work; it does not add IAM permissions, erase review requirements or unlock other slots. Store issuer/revocation evidence; expiry/revocation checked at actual commit.

## 4. Templates, schema authoring and scope requests

### TemplateCreateRequest / TemplateCloneRequest

Create requires label; description is optional. Server owns ID, school, revision and ownership SCHOOL. Clone additionally requires sourceTemplateId and sourceVersionId. The source must be an accessible immutable platform/school version. The server clones into school-owned field/unit identities, preserves a source-lineage map, and rewrites formula references using that map. It never grants ownership of another school's identities.

### Definition authoring and resolved schema

The final normalized definition follows [06 §3](../06_TEMPLATES_SCOPES_AND_CALCULATIONS.md) and [moazez-starter-template.json](../examples/moazez-starter-template.json). The writable semantic root allowlist is label, helpText?, groupKind, fields, releaseUnits, calculationPolicy and bounded presentationHints?. Server supplies school/definition/template IDs, version, origin, hash and effective platform limits.

A field accepts code, label, helpText?, kind, outputKind? for CALCULATED, textMode? for TEXT, order, requiredForFinal, constraints, options? for SELECT, allowedStates?, stateReasonRequired?, audiences, readRule, editRule, releaseUnit reference and formula? for CALCULATED. No formula is accepted on a manual field. Numeric/text limits, enum meanings and operation ASTs are as specified in 06. Requiredness affects publication completeness, not saving an incomplete draft. `constraints` is a discriminated union, not an arbitrary object: SCORE minScore/maxScore/inputScale; PERCENTAGE minPercentage/maxPercentage/inputScale; TEXT maxCharacters; CALCULATED declared nominal output maximum/operation constraints. SELECT options contain stable code, bilingual label, order and active flag; retired used codes cannot silently be reassigned.

To create new field identities safely, authoring input supplies exactly one of an owned existing `id` or a request-local `clientKey`. `clientKey` uses `[A-Za-z][A-Za-z0-9_]{0,63}` and is unique in the request. New formula/output references can use clientFieldKey; existing references use fieldId, exactly one. The server allocates new UUIDs, resolves the graph, validates it, and returns `identityMap: [{clientKey,fieldId}]`. The stored resolved schema, CSV headers and all cell operations use UUIDs only. The same mechanism applies to new release units through clientUnitKey/unit identity mapping. A client key is not a persisted authorization identity. Incompatible reuse of an existing field ID is rejected; labels/positions never supply a mapping.

A release unit has owned existing id or clientUnitKey, code, label, classification PROGRESS/FINAL, order?, outputField references, and derivedDisclosure[]. Output membership is disjoint. Staff-only working notes may have no unit. A derived-disclosure entry specifies outputFieldId, exact private operand field IDs, audiences and reason; it must pass explicit school design approval and dependency closure. No arbitrary field can opt itself out of review by changing audience metadata.

Proposed readRule/editRule/audience changes cannot grant the author access to existing restricted values. Retain the current effective restriction until explicit school-authorized widening. COPY requires source-read and target-write access; formulas and preview diagnostics cannot reveal inaccessible operands. This applies even to an otherwise autonomous teacher's personal draft. Permission administration remains a separate authorized school action.

### TemplateVersionCreateRequest / TemplateActivationPreviewRequest / TemplateActivateRequest

Version creation requires expectedLatestVersionId (nullable only for a new template) and the authoring definition above. Return immutable normalized definition and new-ID mappings. Activation preview requires versionId and expectedTemplateRevision. Activation confirms versionId, expectedTemplateRevision, previewId and previewDigest. The preview's exact version and impact must still match. Activating a template affects future scope resolution; existing sheet adoption is separate.

### DesignCreateRequest / DesignDecisionRequest

Create requires sheetId, expectedDefinitionVersionId, expectedSheetRevision, definition and reason; originTemplateVersionId is optional and verified. It creates a validated personal/school definition candidate in the canonical sheet lineage. Teacher authoring is bounded by current subject/class/period/grant. A new design can be adopted for draft work before official design approval. Decision requires definitionVersionId, contentDigest and decision APPROVE/RETURN; RETURN requires comment, APPROVE may include one. The reviewer must see the exact difference. Decision does not mutate grades or approve student results.

### DraftDefinitionPreviewRequest / DraftDefinitionAdoptRequest

Preview requires targetDefinitionVersionId, expectedDefinitionVersionId, expectedSheetRevision and fieldMapping. A mapping item is `{fromFieldId,toFieldId,action:PRESERVE|COPY|RETIRE}`. PRESERVE uses the same compatible identity; COPY explicitly references a different target and must pass type/range checks without silent rescaling; RETIRE omits toFieldId and preserves history. Omitted existing fields that have values are blockers, not automatic deletion. New empty fields require no source mapping. The preview shows all affected values, approvals, imports, scope and invalidated dependencies. Adopt confirms exact previewId/digest and expectedSheetRevision; atomically switches the selected draft schema, not the school's design-acceptance pointer. Oversized migrations must use the bounded staged-final-activation design in 04, not partial visible adoption.

### ScopeAssignmentRequest / ScopeResolveRequest / SheetMaterializeRequest

Assignment requires expectedScopeRevision and assignment. Assignment allowlist: id? for existing owned rule; academicScope; groupScope; periodSelector; mode REPLACE/EXTEND; templateVersionId; baseTemplateVersionId for EXTEND; enabled. groupScope is exactly one of `{kind:ALL_SUBJECTS}`, `{kind:SUBJECTS,subjectIds:[...]}`, `{kind:CUSTOM_GROUPS,groupIds:[...]}`. periodSelector is `{kind:EXACT_PERIODS,periodIds:[...]}`, `{kind:ACADEMIC_YEAR,academicYearId,periodKinds:[TERM,CUSTOM,YEAR subset]}` or `{kind:ALL_PERIODS,periodKinds:[...]}`. Arrays are nonempty when supplied. An ALL rule remains subject to compatible group/period schema and actual academic eligibility; it creates no annual teacher permission.

Scope resolution requires reportingPeriodId, academicScope and groupIds, plus rosterAsOf (`Instant`) for roster materialization preview. It returns authorized concrete tuples, effective definition/policy, resolver evidence, roster counts and conflicts. No latest-wins resolution. Materialization confirms previewId/digest and creates/reuses canonical sheets/slots for that exact authorized preview. Missing/ambiguous enrollments block the affected unit. Broad selectors describe a request, not a second grade store.

### GrantCreateRequest

Required grantee `{kind:USER|ROLE,id}`, scope `{reportingPeriodIds,groupIds,classroomIds,fieldIds?}`, actions and reason. IDs are nonempty authorized sets; optional startsAt defaults now, optional expiresAt must be after startsAt. Allowed actions are VIEW, DESIGN, EDIT, IMPORT, EXPORT, SUBMIT, PUBLISH, REQUEST_CORRECTION and PUBLISH_CORRECTION. These grant resource scope only; corresponding IAM permission and policy remain mandatory. Field IDs narrow an otherwise valid scope. A term-subject grant cannot fabricate an absent teacher subject allocation. Annual/custom-group grants follow 05. Grantors cannot delegate beyond their own authority. Grant creation does not mutate system roles.

## 5. Roster and manual-entry requests

### RosterReconcileRequest

Required previewId, previewDigest, expectedRosterGeneration and decisions. Each decision names slotId, expectedPlacementRevision, reason and one explicit action: KEEP_HISTORICAL, MOVE_DRAFT, CLOSE_DRAFT, EXEMPT_GROUP or REINSTATE_GROUP. MOVE_DRAFT additionally requires destinationSheetId, destinationEnrollmentId and identity-based fieldMapping using the schema migration rules. KEEP_HISTORICAL does not retain old teacher permission without a valid current grant. EXEMPT/REINSTATE affects result coverage only, not academic enrollment. No new Student is created here. Decisions must exactly match the reviewed affected scope; omission does not delete a roster row or grade.

### GridPatchRequest

Required expectedDefinitionVersionId, structural expectedSheetRevision, operations (1–1,000 CellOperation entries). Optional changeReason is applied as the batch audit reason but does not replace a required specific state/clear reason unless explicitly inherited. Single-sheet atomicity. Recheck per-cell versions, schema, roster/placement, actual write capability and period/window at commit. Other-cell updates can advance dataGeneration without causing a false same-cell conflict.

## 6. Review, correction and publication requests

### CandidateCaptureRequest / PreviewRequest

Capture requires sheetId, structural expectedSheetRevision, intent REVIEW/DIRECT_PUBLICATION and 1–200 unique units `{slotId,releaseUnitId,expectedSlotRevision}`. Confirm that the selected draft schema and all relevant values belong to the current slot state. REVIEW freezes submitted candidates even if design review is pending; direct intent requires direct authority and accepted/permitted design. Each unit reports completeness/validation. PreviewRequest has only audience STUDENT/PARENT and reads a path-selected immutable candidate through the audience presenter; response includes mode PREVIEW and no public URL.

### ReviewDecisionRequest

Required candidateKind RESULT_RELEASE/AGGREGATE, candidateId, contentDigest, expectedCandidateRevision and decision APPROVE/RETURN. comment is required for return and optional for approval. The server resolves the declared candidate type through its own tenant-scoped repository and requires matching kind and school ownership; it must not probe another candidate table as a fallback. Persist the kind and an integrity-checked reference to the exact target with the decision. The discriminator grants no authority.

For RESULT_RELEASE, approval verifies the exact immutable release candidate/hash, current accepted design, current review policy and reviewer/separation rules. For AGGREGATE, the same route verifies the exact immutable aggregate candidate/hash, its pinned profileVersionId, exact sourcePublicationIds and dependency generations, current source eligibility, and current review authority/policy/separation rules. A changed candidate, changed applicable profile version or replaced/revoked/ineligible source invalidates pending approval; a fresh candidate and decision are required. Publishing rechecks these bindings and current authority at commit. No score/definition edits are accepted in this request; a reviewer who changes values must create a new candidate first.

### PublicationBatchRequest

Required mode APPROVED/DIRECT/APPROVE_AND_PUBLISH and 1–200 candidateRefs. Each ref requires candidateId, contentDigest, expectedCandidateRevision, expectedCurrentPublicationId (UUID or null for first release) and expectedPublicationGeneration. Unique target slot/unit; same-slot items must agree on the expected composition generation. The server serializes same-slot operations or groups the intended simultaneous update; it cannot treat one sibling operation's authorized generation increment as permission to skip checks for another. Review/publish/correct permissions are branch-dependent as documented in 09. No publish-all-current-drafts flag, wildcard candidate selection or client-authored approval metadata.

### CorrectionRequest / PublicationRevokeRequest

Correction requires publicationId, expectedRevision, expectedPublicationGeneration and reason. Optional operations are typed CellOperations and additionally require entries.manage. A request without operations opens/reuses a correction draft. Revoke requires expectedPublicationId, expectedRevision, expectedPublicationGeneration and reason. Both check the current pointer and slot generation; neither can overwrite a newer release. Revocation does not automatically expose an older publication.

### PublicationTopologyPreviewRequest / PublicationTopologyReplaceRequest

Preview requires expectedPublicationGeneration, expectedActivePublicationIds, targetDefinitionVersionId, candidateRefs, preservedPublicationIds and reason; slotId is the path identifier. Candidate refs contain candidateId, contentDigest and expectedCandidateRevision. The old active IDs are a complete exact set. Preserved IDs must be an explicit subset. The new target-unit set must cover the intended replacement coherently, without active output overlap or missing dependencies. Required review/design decisions remain separate exact evidence. Confirm requires previewId, previewDigest and expectedPublicationGeneration only; it applies the persisted reviewed bundle. This is a school-only atomic per-slot replacement. No teacher alias or permissive force flag exists.

### AggregateProfileRequest / AggregateCandidateRequest / AggregatePublishRequest

Profile requires expectedProfileRevision and definition `{code,label,reportingPeriodSelector,inputs,operation,calculationPolicy,audiences,requiredCoverage}`. The optional property profileId is forbidden when expectedProfileRevision is 0: this creates a profile root and its first immutable version. When expectedProfileRevision is greater than 0, profileId is a required UUID identifying an existing profile owned by the current school. The same POST route checks current management authority and compare-and-swaps that profile's revision before creating a new immutable version; it never overwrites an older definition or silently modifies a published aggregate. Each input names groupId, releaseUnitId, fieldId and an optional declared weight required for weighted operations. No draft-cell, assessment, homework or reinforcement reference is accepted. Formula kinds/weights/rounding obey 06, with every source bound to a published result. Required coverage is explicit group/unit membership, respecting school-approved exemptions.

Aggregate candidate requires studentId, reportingPeriodId, profileVersionId and exact sourcePublicationIds. It freezes a digest, current dependency generations, computed result and completeness. Where review is required, submit ReviewDecisionRequest with candidateKind AGGREGATE through the existing review-decision route; its approval binds this exact candidate, profile version and immutable source publication set. Aggregate publish requires candidateId, contentDigest, expectedCandidateRevision and expectedCurrentAggregatePublicationId (null for first release). Revalidate source-current pointers, applicable profile version, exact approval and current publication/review authority at commit. A replaced/revoked source invalidates the pending approval and stales the current aggregate; no live recomputation of an already published summary.

## 7. Export/import requests

The full CSV protocol, file limits, state machine, three-way merge and source versioning are authoritative in [08](../08_BULK_EXPORT_IMPORT_SPEC.md). The following DTO fields are exact wrappers around that protocol.

| Name | Allowlist and validation |
| --- | --- |
| ExportPreviewRequest | Required reportingPeriodId, academicScope, groupIds, format CSV/XLSX, mode EDIT_DRAFT/READ_PUBLISHED. Optional selectedFieldIds, selectedSlotIds are duplicate-free authorized subsets. Exported header selection is frozen; missing a selected header on upload is invalid. |
| ExportCreateRequest | Required previewId and previewDigest only. Server reads frozen selection, never accepts a substituted roster from the client. |
| ImportUploadRequest | Multipart required exportId and file. Optional validateOptions containing clearReason and field-state reason assignments defined by 08. Same-batch source replacement additionally requires expectedBatchRevision; initial upload forbids pretending a replacement revision. Actual format parsing is required. |
| ImportCorrectionRequest | Required expectedBatchRevision and changes; each item rowRef, fieldId, operation, value for SET, reason if required, optional expectedCellVersion only when exposed by preview. Optional clearReason supplies an explicit batch default. Every correction creates a new validation version. |
| ImportRevalidateRequest | Required expectedBatchRevision. Optional selectedSheetIds narrows validation to a duplicate-free set of the source's concrete sheet units while retaining excluded findings. Rebuilds the immutable preview from the same source. |
| ImportConfirmRequest | Required previewId, previewDigest, expectedBatchRevision, selectedSheetIds and acknowledgedWarningIds. selectedSheetIds sorted, duplicate-free, exactly matches reviewed set. Optional clearReason must exactly match the frozen effective reason if supplied. No tolerance/force/skip-errors parameter. |
| ImportCancelRequest | Required expectedBatchRevision and reason. Cancel only not-yet-claimed units; a claimed running unit finishes its atomic all-or-none transaction. Mixed committed/cancelled execution reports PARTIALLY_APPLIED with terminationReason CANCELLED. No eligible cancellable units returns 409; terminal APPLIED cannot be cancelled. |
| ImportRetryRequest | Required expectedBatchRevision. Only retry eligible uncommitted transient failures; stale context requires revalidation/new confirmation. |

Upload/correction/revalidation 202 returns durable batch state; polling supplies a ready preview later. The preview nests `{id,revision,digest,digestAlgorithm,binding}`. Binding schema/version, canonical changeset digest, old cell versions, authority/policy/roster context and reasons must match [export-manifest.json](../examples/export-manifest.json) and [import-preview.json](../examples/import-preview.json). These are internal staff report structures and never family payloads.

## 8. Response data contracts

All named response-data types are wrapped in `{data: ...}`. Optional includes absent during a still-running operation; do not invent zero IDs, empty success digests or fake file URLs. Actor/audit metadata appears only in an authorized staff projection. Dates and labels obey section 1.

| Contract | Required content; optional/conditional content |
| --- | --- |
| Policy | policyVersionId, revision, normalized policy and contextual capabilities. First-use reads may return a documented default-not-yet-activated state, with no fabricated version ID. |
| ImpactPreview | previewId, previewDigest, impacts[], blockers[]. Include expiresAt, expected source versions, normalized selection and affected counts. Each impact has kind, resource ID, before/after summary; never foreign-school details. |
| Period | reportingPeriodId, revision, kind, academicYearId, code, name, startsOn, endsOn, status. termId only for TERM/CUSTOM; capabilities and active correction windows when authorized. |
| Group | groupId, revision, kind, code, label, archived. subjectId required only for SUBJECT; description optional. |
| Template | templateId, revision, label, ownership PLATFORM/SCHOOL, archived, currentVersionId nullable until first version. origin lineage for clones, description optional. |
| TemplateVersion | templateVersionId, definitionVersionId, immutable definition, contentDigest and version number; identityMap when created from client keys. Used versions never include mutable future schema labels. |
| ScopeAssignment | assignmentId, revision, normalized assignment, activation status and origin/version references. |
| ScopeResolution | previewId, previewDigest, tuples[], conflicts[]. Each tuple: classroomId, groupId, reportingPeriodId, effective definition/policy references, roster count, resolver explanation. Conflicting tuples cannot be materialized. |
| Sheet | sheetId, structural sheetRevision, dataGeneration, rosterGeneration, draftDefinitionVersionId, nullable lastAcceptedDefinitionVersionId, reportingPeriodId, groupId, classroomId, capabilities. |
| Design | definitionVersionId, contentDigest, status, authoring lineage and normalized definition. Status DRAFT/IN_REVIEW/ACCEPTED/RETURNED/SUPERSEDED with current capability/reason; any returned decision includes comment. |
| Grant | grantId, revision, grantee, scope, actions, startsAt, optional expiresAt, revokedAt nullable. Issuer/revocation reason only authorized staff. |
| Gradebook | Sheet identity/version context, definitions[], rows Page, capabilities and projection audience. Row: slotId, slotRevision, publicationGeneration, student summary, enrollmentId, placementStatus, cells[], completeness. Manual cells have cellVersion; computed outputs omit that write-version field. |
| GridPatchResult | sheetId, structural sheetRevision, new dataGeneration, changedCells[] with assigned versions/slot revisions and calculatedOutputs[]. No silent partial success for the atomic sheet request. |
| Candidate | candidateId, candidateRevision, contentDigest, status, intent, frozen content references, completeness, validationIssues[] and capabilities. States include SUBMITTED, READY_FOR_DIRECT, APPROVED, RETURNED, SUPERSEDED; no family visibility implied. |
| ReviewDecision | decisionId, candidateKind RESULT_RELEASE/AGGREGATE, candidateId, contentDigest, decision, reviewer evidence, timestamp, optional safe comment. Immutable decision with an integrity-checked typed candidate target, not a live grade row. |
| BatchOperation | operationId, operationType, status, counts, createdAt, updatedAt, itemsPath. IMPORT_COMMIT statuses QUEUED/APPLYING/APPLIED/PARTIALLY_APPLIED/FAILED/CANCELLED. PUBLICATION_BATCH/CANDIDATE_CAPTURE/SHEET_MATERIALIZATION/EXPORT_GENERATE/ISSUE_REPORT use QUEUED/RUNNING/COMPLETED/PARTIALLY_COMPLETED/FAILED/CANCELLED where partial applies. IMPORT_VALIDATE uses QUEUED/VALIDATING/COMPLETED/FAILED/CANCELLED with resulting import batch status separate. Never relabel an import outcome as a release-batch status. |
| OperationItemPage | items, nextCursor, hasMore. Item has target identity, state, resulting resource IDs if committed, error code/details if failed, and attempt metadata. Enforce parent operation permission on every page. |
| Publication | publicationId, slotId, releaseUnitId, revision, publicationGeneration at commit, status, publishedAt, candidateId, immutable snapshot references and predecessor when applicable. Staff may inspect authorized provenance; family uses FamilyResult instead. |
| CorrectionDraft | sheetId, slotId, previousPublicationId, current draft definition/revision, reason and capabilities. No published value is changed by this response. |
| PublicationComposition | slotId, publicationGeneration, activePublications[] with unit/publication IDs and definition versions, replacedPublicationIds[], preservedPublicationIds[]. The returned composition is one committed coherent slot state. |
| AggregateProfile | profileId, profileVersionId, revision and immutable normalized definition. |
| AggregateCandidate | candidateId, contentDigest, candidateRevision, sourcePublicationIds, profileVersionId, status, completeness and computed result. |
| AggregatePublication | publicationId, revision, sourcePublicationIds, profileVersionId, status ACTIVE/SUPERSEDED/REVOKED/STALE, frozen computed result and time. STALE denotes invalid current projection; the immutable historical content is preserved. |
| Export | exportId, status QUEUED/GENERATING/READY/FAILED/EXPIRED, mode, manifestSummary and files[]. READY requires private FileDescriptors; queued files is empty. No missing file is reported as already downloadable. |
| ImportBatch | batchId, batchRevision, sourceVersion, status, summary, canConfirm. Optional preview only after validation; file descriptor, capabilities, sheetUnits and report links according to actor access. Import statuses are exactly 08 §8.1. |
| ImportPreview | ImportBatch ready/corrections state plus preview object and bounded changes/issues pages; never assume zero omitted issues when findingsTruncated=true. |
| FileDescriptor | fileId, filename, mediaType, sizeBytes, downloadPath; expiresAt nullable only for retained protected resources. The path rechecks parent-resource permission. |
| FamilyResult | schemaVersion, source, resultSetId, viewVersion, student, academicContext, groups[], summary. Group has groupId/kind/label/order, subject when applicable, releases[]. Release has publicationId, unit identity, revision, publishedAt, completeness, frozen academicPlacement and fields[]. Exact sample in family-result.json. |
| FamilyPreview | mode PREVIEW, audience STUDENT/PARENT, candidateId and result. Result shares student/academicContext/group labels/order/typed-field shapes with the family presenter, but groups.releases uses PreviewRelease, not the published release type. Default preview contains the selected candidate only and omits an official overall summary. No family route can resolve it. |
| PreviewRelease | candidateId, candidateRevision, releaseUnitId, status PREVIEW, publicationId:null, publishedAt:null, completeness, academicPlacement and fields[]. No fabricated publication revision or PUBLISHED state. Actual FamilyResult remains published-only with nonnull real publication metadata. |
| MissingReport | scope summary, counts and paginated items. Each item names authorized slot/field, missing/state reason and follow-up capability. Do not include classmates or private grades in family routes. |
| HistoryPage | items, nextCursor, hasMore. Staff entries: event/resource/version/action/time/authorized actor plus permitted diffs. Family entries: published versions/public correction messages only. The audiences do not share one unrestricted audit DTO. |
| Page | items, nextCursor, hasMore, optional total when safely and efficiently computed. Empty page has items:[], nextCursor:null, hasMore:false. |
| Capabilities | actions map of bounded named Capability values, resolved scope summary and effective teacher mode when relevant. It reveals no full policy/role configuration to a teacher without policies.view. |
| PrivateFile | Authenticated application content/proxy response with safe Content-Disposition/content type and exact parent-resource authorization on every fetch. This is the normative default for sensitive official-result artifacts; generic Files routes must not issue a bypassing object URL for these resources. Any future short-lived external signed-URL exception requires an explicit ADR describing its residual authorization lifetime until expiry; it cannot promise immediate issued-URL revocation. No permanent public storage path. |

## 9. Contract consistency requirements

Generate one validator per shared type and reuse it across school, teacher, CSV/XLSX normalization and presenters. The endpoint catalog repeats surface aliases for visibility; it does not authorize duplicate domain implementations. A request body must not gain wider scope because it travels through a teacher alias or a queue.

The JSON examples use the same stable field IDs and immutable definition meaning. Template definitions retain formulas/read rules internally; the family presenter removes them and preserves the same ID, label, kind, output kind and applicable constraints. `evaluation.normalizedPercentage` is a server-computed decimal string with exactly six fractional digits, HALF_UP; display may show two. Pass/band decisions compare the pre-rounding numerical result.

Before implementation completion, contract tests must reject unknown write keys, wrong scalar kind, hidden calculated writes, duplicated target cells, foreign identities, stale versions, invalid preview binding, empty reasons when required and topology bundles with overlapping field coverage. The live generated DTO/OpenAPI and these files must be reconciled as one contract, not allowed to diverge silently.
