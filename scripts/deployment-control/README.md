# Governed runtime release control

`runtime-release-control.cjs` translates the unchanged authoritative contract
at `config/deployment/release-sequence.contract.json` into deterministic
Terraform operation specifications and records later governance evidence.

It is staging-only. It never invokes Terraform, Google Cloud, a database, or a
smoke request. In particular, `record-apply` records evidence for an apply that
was separately authorized and executed; it does not perform an apply.

## Release context input

Prepare a JSON context outside the source repository with this shape. Values
shown in angle brackets must come from governed live discovery or owner
evidence. Do not put Redis CA payloads, tokens, credentials, or other secrets
in this file.

```json
{
  "executionId": "day2-staging-<unique-id>",
  "repository": "Abdallah-Mohamed-Abdallah-AbdulRazzaq/Moazez-Backend",
  "sourceSha": "<exact-40-character-HEAD>",
  "environment": "staging",
  "candidateImageReference": "me-central2-docker.pkg.dev/moazez-nonprod-91001421934/moazez-staging-containers/moazez-backend@sha256:<64-lowercase-hex>",
  "candidateTag": "candidate-<first-12-hex-of-sha256-of-the-full-image-reference>",
  "externalTfDataRoot": "<absolute-external-tfdata-root>",
  "externalSavedPlanRoot": "<absolute-external-saved-plan-root>",
  "completedPredecessorStages": [
    {
      "id": "artifact-and-checksum-preflight",
      "status": "passed",
      "evidenceRef": "<evidence-reference>"
    },
    {
      "id": "backup-and-data-authority-checkpoint",
      "status": "passed",
      "evidenceRef": "<evidence-reference>"
    },
    {
      "id": "migration-job",
      "status": "passed",
      "evidenceRef": "<evidence-reference>"
    },
    {
      "id": "migration-status-and-drift-verification",
      "status": "passed",
      "evidenceRef": "<evidence-reference>"
    }
  ],
  "liveDiscovery": {
    "evidenceRef": "<live-discovery-evidence-reference>",
    "discoveredAt": "<ISO-8601-UTC-timestamp>",
    "apiTrafficMode": "normal",
    "stableApiRevision": "moazez-staging-api-<verified-live-revision-suffix>",
    "runtimeImages": {
      "api": "<current-staging-image-by-digest>",
      "coreWorker": "<current-staging-image-by-digest>",
      "mediaWorker": "<current-staging-image-by-digest>",
      "maintenanceScheduler": "<current-staging-image-by-digest>"
    },
    "runtimeState": {
      "lineage": "<opaque-runtime-state-lineage>",
      "serial": 0
    },
    "edgeState": {
      "lineage": "<opaque-edge-state-lineage>",
      "serial": 0
    }
  }
}
```

Terraform state lineage is treated as an opaque exact identity token. The
deployment controller does not interpret UUID version or variant semantics.
Lineage is preserved exactly and compared for exact equality, without
normalization or mutation. State serial remains a non-negative safe integer
and must increase after a successful apply.

The tag formula is exact:

```text
candidate-${sha256(full api image reference)[0:12]}
```

The expected revision is:

```text
moazez-staging-api-${candidateTag}
```

The stable revision must be the full revision discovered from the live
`moazez-staging-api` service, not a source default or guessed value.

## External artifact convention

A recommended root convention is:

```text
TF data root:    %LOCALAPPDATA%\Moazez\tfdata\day2-d1
Saved-plan root: %LOCALAPPDATA%\Moazez\plans\day2-d1
Manifest:        %LOCALAPPDATA%\Moazez\release-control\day2-d1\<execution-id>.json
```

For each operation the adapter deterministically expands these roots to:

```text
TF_DATA_DIR=
<tfdata-root>\<execution-id>\staging\<backend-runtime|edge>

SAVED_PLAN=
<saved-plan-root>\staging\<backend-runtime|edge>\<execution-id>\<gate-and-operation>.tfplan
```

All paths are rejected unless absolute and outside the repository. The old
saved-plan SHA256
`ccc0473c853e0ea2a47e8cb6700acf3a80a454907130ce9992049e7d7ded43e7`
is permanently rejected, as is any duplicate plan hash in one manifest.

## Exact CLI surface

Run commands from the repository root. These commands create or update only an
external JSON manifest; none executes Terraform or sends a request.

Create the deterministic operation specification:

```powershell
node scripts/deployment-control/runtime-release-control.cjs create-spec --input <external-context.json> --output <external-manifest.json>
```

Revalidate source, contract, immutable operation fields, external paths, and
lifecycle consistency:

```powershell
node scripts/deployment-control/runtime-release-control.cjs validate-spec --manifest <external-manifest.json>
```

After a separately created saved plan has been reviewed against the operation's
address and attribute allowlists, bind its actual bytes and state precondition:

```powershell
node scripts/deployment-control/runtime-release-control.cjs register-plan --manifest <external-manifest.json> --gate <gate-id> --operation <operation-id> --recorded-at <ISO-UTC> --plan <exact-external.tfplan> --source-sha <exact-source-sha> --environment staging --terraform-root <repository-relative-root> --lineage <pre-plan-lineage> --serial <pre-plan-serial>
```

Record the independent approval:

```powershell
node scripts/deployment-control/runtime-release-control.cjs approve-plan --manifest <external-manifest.json> --gate <gate-id> --operation <operation-id> --recorded-at <ISO-UTC> --approver <identity> --approval-ref <evidence-reference>
```

Record one successful apply attempt and its successor state. This command is
record-only:

```powershell
node scripts/deployment-control/runtime-release-control.cjs record-apply --manifest <external-manifest.json> --gate <gate-id> --operation <operation-id> --recorded-at <ISO-UTC> --result succeeded --evidence-ref <apply-evidence> --post-lineage <lineage> --post-serial <increased-serial>
```

Record a failed apply attempt without successor state:

```powershell
node scripts/deployment-control/runtime-release-control.cjs record-apply --manifest <external-manifest.json> --gate <gate-id> --operation <operation-id> --recorded-at <ISO-UTC> --result failed --evidence-ref <failure-evidence>
```

Record live verification. Supply precisely the observations declared by the
operation's `verificationExpectation`:

```powershell
node scripts/deployment-control/runtime-release-control.cjs record-verification --manifest <external-manifest.json> --gate <gate-id> --operation <operation-id> --recorded-at <ISO-UTC> --result passed --evidence-ref <verification-evidence> [--observed-image <digest-reference>] [--observed-revision <revision>] [--observed-candidate-tag <tag>] [--observed-public-path <path>] [--observed-backend-path <path>] [--observed-stable-percent <0-100>] [--observed-candidate-percent <0-100>] [--http-status <100-599>]
```

For a failed verification, use `--result failed` and return sanitized observed
values where available. The first failed apply or verification consumes or
invalidates the applicable plan, fails its gate, blocks later suboperations and
gates, and permits no automatic retry.

## Plan review boundary

The adapter produces the exact `requiredVariables`, Terraform root, state
lineage/serial precondition, resource-address allowlist, allowed attribute
changes, expected change type, and saved-plan path for each Terraform
operation. DevOps must create the plan separately with the manifest's external
`TF_DATA_DIR`, inspect the plan JSON/text, and reject any address or attribute
outside those allowlists before `register-plan` and `approve-plan`.

Sensitive Queue and Realtime Redis inputs remain ephemeral operator inputs.
The manifest contains their names and sensitivity flags only, never their
values.

Run the source-level adapter tests with:

```powershell
node --test scripts/deployment-control/tests/runtime-release-control.test.cjs
```
