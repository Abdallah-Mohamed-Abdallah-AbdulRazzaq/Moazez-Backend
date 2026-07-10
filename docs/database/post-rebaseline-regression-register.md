# Post-Rebaseline Regression Register

## Status and scope

- **Migration recovery integrity: PASS**
- **Repository-wide regression debt: OPEN**

These findings were observed while verifying `MIGRATION-RECOVERY-0A`, but they
are not migration-integrity failures and are not part of the migration
rebaseline change set. This register preserves the failures without silently
ignoring them or changing runtime behavior, permissions, feature contracts, or
existing tests during the migration incident.

All required follow-up work must be handled separately. The open items must be
resolved before the Live rebuild.

## 1. Homework stale route expectation

### Observed

The Homework final-closeout test expects
`GET /api/v1/parent/smart-pickup` to be absent.

### Current runtime

The route is intentionally registered by the completed Smart Pickup domain at
the current repository HEAD.

### Classification

Likely stale test contract.

### Required follow-up

Confirm the current canonical route contract and update only the obsolete test
expectation if the route is approved.

## 2. Communication teardown ordering

### Observed

The functional assertions pass, but teardown fails on
`communication_notifications_recipient_user_id_fkey` while deleting a user
before its dependent communication notification rows.

### Classification

Test cleanup defect.

### Required follow-up

Delete dependent communication notification and related rows before deleting
recipient users, using the established test cleanup order.

## 3. Admissions response assertion

### Observed

An exact response assertion omits the existing `documentsSummary` property.

### Classification

Likely stale response-contract assertion.

### Required follow-up

Compare the assertion against the approved Admissions response contract before
modifying the test.

## 4. Homework authorization mismatch

### Observed

A security test expects HTTP 403, while the runtime returns HTTP 201.

### Classification

**SECURITY DECISION REQUIRED.**

### Required follow-up

Audit route permission metadata, seeded role permissions, the authenticated
actor, and the intended product contract. Do not assume that either the test or
the runtime is correct.

## 5. Asynchronous handles

### Observed

Some combined E2E invocations retain asynchronous handles after their test
work completes.

### Classification

Test infrastructure cleanup issue.

### Required follow-up

Identify unclosed Nest applications, Prisma clients, queues, Redis
connections, timers, sockets, or workers. Do not normalize `--forceExit` as the
permanent fix.

## Migration incident disposition

None of these issues is part of the migration rebaseline commit. They remain
open, separately owned regression debt and do not change the
`MIGRATION-RECOVERY-0A` verdict that the canonical migration recovery passed.
