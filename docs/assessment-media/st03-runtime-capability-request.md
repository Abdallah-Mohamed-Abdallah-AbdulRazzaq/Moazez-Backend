# ST-03 — Read-Only Runtime Capability Handoff Request

This request authorizes no cloud access, provisioning, deployment, Production
enablement, scanner selection or shared database change. Retired Staging is not
an eligible target. Provide redacted read-only evidence; never provide secret
values, signed capabilities, bucket/object keys, connection strings or tokens.

## DevOps evidence requested before any runtime enablement

1. Which already accepted role would execute synchronous verification? Provide
   its immutable image identity, exact existing FFprobe version/path and bounded
   protocol/output/runtime contract. Local test FFprobe is not runtime evidence.
2. What memory, CPU, request deadline and temporary-disk budgets are available
   for two concurrent verifier flights, 10 MiB non-video / 200 MiB video inputs,
   and separate staging/final objects? Include SDK network timeout/cancellation
   behavior and evidence that late calls cannot accumulate unbounded work.
3. Which existing storage adapter capabilities are actually available: resumable
   initiation with enforced expected length/MIME, bounded POST-policy support,
   enforced private ownership, range reads, generation/version/ETag
   identity, create-only initiation, and capability expiry? A resumable session
   can outlive the 30-minute application intent; provide its actual maximum
   expiry and redacted origin/CORS/least-privilege boundary evidence.
4. Confirm that no new worker, queue, schedule, runtime role, public endpoint or
   unapproved provider is required by the proposed deployment. Source adds none.
5. Identify an explicitly approved disposable/QA target for later real-provider
   verification. Do not reactivate retired Staging or reuse Production data.

## Planning Authority decisions remain separate

DR-07 has not approved malware scanning, quarantine, universal release verdicts
or paid infrastructure. The default security gate is NOT_APPROVED and releases
no format. Supply an explicit future decision identifying accepted categories,
required technical/security checks, provider and failure/timeout/retry behavior,
quarantine authority if needed, and the required independent acceptance evidence.
Deep image/PDF/Office verification and the proposed document/audio size increases
also require capability and resource acceptance before they can be enabled.

Physical deletion, retention periods and broader cleanup authority remain with
ADR-0013/Planning Authority. Until then cleanup is non-destructive and retained
byte reservations remain charged. Do not create a deletion worker as a remedy.

Production enablement is disabled in source and needs a separately reviewed
change after those decisions and runtime evidence. This handoff does not claim
runtime readiness or an independent Reviewer Receipt.
