# Official Results operations and client integration

## Deployment contract

The API, Core Worker, and Maintenance Scheduler use one release image. The API owns the HTTP interfaces and produces durable bulk jobs. The Core Worker uses the official-results-bulk consumer. The scheduler owns the minute-level reconciliation registration for export, validation, apply, issue reports, cleanup, and publication notices. The Media Worker has no Official Results responsibility.

The backend migration chain contains 51 migrations through 20261121061000_official_results_operations. Use the project's governed migration job, then reconcile IAM reference data with the approved bootstrap. The seed currently has 271 permissions and seven canonical system roles, with 27 permissions in the Official Results namespace. The normal release order and readiness dependencies remain in effect. Storage requires readable/writable private objects under the result namespace, PostgreSQL permissions for normal DML, and the configured Redis queue. No external storage URLs are issued for these files.

## Pilot and incident controls

Configure the same OFFICIAL_RESULTS_ENABLED and OFFICIAL_RESULTS_SCHOOL_ALLOWLIST values for API, Core Worker and Maintenance Scheduler. Staging and production fail closed unless enabled and the allowlist is present. Use a comma-separated list of school UUIDs for the pilot. A literal asterisk explicitly opens exposure to all current schools. Development and tests allow the feature when no exposure configuration is supplied.

A false flag disables API access and prevents new work claims for those schools. A transaction already holding the locks can finish and retains its durable outcome. Reconciliation still expires temporary files, but does not schedule new work in disabled schools. Restoring the allowlist resumes unexpired work from persisted truth. Jobs whose previews expired require a new review. Freeze writes before fan-out by applying the same stop value to all API, Core Worker and Maintenance Scheduler instances. Retain the full database schema and publication history during disablement.

Monitor queue lag by job type, age of pending/expired leased jobs, validation and commit failure codes, storage cleanup failures, and pending publication notices. Use identifiers only in the protected audit trail. Logs and operational counters exclude marks, names, source contents, object URLs and credentials. Treat migration drift, an unresolved failed migration, reset requests and P3009 as stopping conditions under MIGRATION_GOVERNANCE.md.

Scope preview and materialization transactions have a 30-second budget for large rosters. The feature retains exact scope ceilings and one transactional materialization result.

School and teacher Official Results JSON requests accept up to 4 MiB for explicit selections and corrections. Multipart source limits are separate. Other API routes use their existing body-parser limits.

## Frontend handoff

| Client area | Backend behavior and interaction remaining |
| --- | --- |
| School settings and support | Build the dynamic settings, scope resolution, reusable school template versions, assignment and template-adoption screens. Use the response capabilities and display edited policy impact before activation. |
| School and teacher gradebooks | Render discovered typed columns, protect fields according to capabilities, and use per-cell expected versions for debounced save and bulk paste. Layout preferences such as widths, pinned columns, and personal visibility remain local to the client. |
| Staff bulk workspace | Show exact school/classroom/subject and field selection, provide private downloads, upload CSV/XLSX as immutable sources, and show categorized, paginated findings and before/after. In the reviewed diff, label no changes, explicit clear, conflict, and per-sheet partial completion separately. Require acknowledgments and poll by batch or operation ID. |
| Publication and correction | Show frozen content and review revision, distinguish approval from publication, and expose returns, corrections, history, topology replacement and revocation to authorized staff. |
| Family apps | Render dynamic groups and release units, current and authorized past published revisions, and a possibly missing or stale overall aggregate. Use the secure in-app notification destination and request the current result after authentication. |
| Archive and recovery | Provide missing records, exact review and revision comparison, private issue exports, correction window actions, and the reviewed broad reopen flow. |

Use reporting-period identifiers obtained from Official Results. The client can group several reporting periods in one selection and submit an independent resolution and bulk job for each concrete period. School template assignments can target multiple exact periods or an academic-year rule.

These screens belong in the existing frontend repositories and are outside this backend code change. Client integration uses the checked-in generated OpenAPI artifact and DTO dictionary. Certificates, PDF generation, signatures and public QR verification require their own scope.
