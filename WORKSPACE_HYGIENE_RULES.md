# Workspace Hygiene Rules

This document is the canonical repository policy for Git source selection,
local workspaces and worktrees, Terraform operational artifacts, and controlled
workspace cleanup. It applies to developers, DevOps operators, agents, and
automation.

It supplements, and does not replace, the repository's domain-specific
authorities. In particular, API contracts, application persistence, security,
and architecture remain governed by their existing documents. Prisma schema
and migration work remains governed by `MIGRATION_GOVERNANCE.md`, with
`PRISMA_CONVENTIONS.md` providing complementary conventions. Nothing in this
policy authorizes a database, Terraform, cloud, or deployment mutation.

## 1. Repository Source Authority

```text
AUTHORITATIVE_PROJECT_SOURCE=REMOTE_GIT_AUTHORITY
DEFAULT_AUTHORITY=origin/main
```

`origin/main` means the latest fetched and verified remote-tracking revision
from the trusted project remote. It is the default authority for repository
source history; it does not replace the separate authorities for runtime data,
API contracts, or Terraform state.

A local directory is never authoritative merely because it is named
`Backend-1`, `main`, `project`, `current`, `latest`, or something similar. A
local branch named `main` is also not proof that it matches the remote.

Before starting meaningful new work:

1. Confirm the current directory is the intended repository and verify the
   configured `origin` identity.
2. Run `git fetch origin --prune`.
3. Resolve the exact current `origin/main` commit.
4. Inspect the current branch, `HEAD`, worktree status, and divergence from
   `origin/main`.
5. Start from a clean, task-specific branch and worktree as defined below.

The fetch is a remote-tracking metadata refresh only. It does not authorize a
reset, checkout, rebase, merge, cleanup, or file mutation in an existing
worktree.

If `origin/main` moved unexpectedly, stop safely and inspect the new commits,
remote identity, divergence, and task assumptions. Do not reset it to a
remembered SHA, and do not automatically reset, rebase, or merge an existing
workspace. Once the move is verified as trusted and no contradictory state is
found, new work starts from the latest verified `origin/main`.

## 2. Three-Layer Workspace Model

Keep these layers distinct:

| Layer | Purpose | Authority and constraints |
| --- | --- | --- |
| 1. Remote source authority | Trusted remote Git history, normally `origin/main` | Default repository source authority after fetch and verification |
| 2. Local shared Git metadata and primary worktree | Shared object database, refs, worktree registrations, and an optional primary checkout | May be stale, dirty, or preserved; its folder name and local branch do not make it current implementation source |
| 3. Task-specific implementation worktree | An isolated checkout and branch for one approved task | Normal location for implementation after a clean-start preflight |

```text
SHARED_GIT_METADATA_ROOT != CURRENT_IMPLEMENTATION_DIRECTORY
```

Linked worktrees may share Git metadata while having independent indexes,
branches, and working files. A dirty or stale primary worktree can remain
preserved while development proceeds in a separate clean worktree. Do not
clean the primary worktree merely to make it usable for a new task.

## 3. Task-Specific Worktree Rule

Meaningful new source tasks must normally use:

```text
LATEST_VERIFIED_ORIGIN_MAIN
+ NEW_OR_EXPLICITLY_AUTHORIZED_CLEAN_WORKTREE
+ TASK_SPECIFIC_BRANCH
```

Do not continue new implementation on any of the following without explicit
reauthorization and a fresh preflight:

- a completed or merged feature branch;
- a stale local `main`;
- a copied directory without Git metadata;
- an unidentified repository copy; or
- a dirty worktree containing unexplained tracked or untracked artifacts.

After the required fetch and task-worktree selection or creation, but before
editing task files or mutating the index, branch history, or operational
artifacts, record this start evidence:

```text
CURRENT_DIRECTORY
CURRENT_BRANCH
CURRENT_HEAD
ORIGIN_MAIN
AHEAD_COUNT
BEHIND_COUNT
WORKTREE_CLEAN
TRACKED_CHANGE_COUNT
UNTRACKED_CHANGE_COUNT
```

Compute `AHEAD_COUNT` and `BEHIND_COUNT` against the freshly verified
`origin/main`. Compute the tracked and untracked counts from the full index and
worktree status, and include untracked files in the cleanliness decision. Also
record the remote identity when more than one remote or repository copy could
be confused.

If a requested worktree path or task branch already exists unexpectedly, stop
and return evidence. Do not overwrite it, delete it, or reuse ambiguous state.

## 4. Historical Worktrees and Non-Git Snapshots

### Merged worktrees

After its pull request is merged, a task worktree and branch become
`REFERENCE_ONLY` unless an owner explicitly reauthorizes them. Do not create
new feature commits on a completed merged branch.

Removing an old worktree is a separate workspace-cleanup task. Before removal,
prove all of the following:

- the branch or pull request is merged as expected;
- no unique tracked work remains;
- no unique untracked evidence remains; and
- no Terraform, deployment, verifier, or other operational artifact depends on
  the worktree.

Never remove a worktree merely because another copy exists.

### Non-Git snapshots

A copied directory without valid Git metadata is:

```text
NOT_SOURCE_AUTHORITY
NOT_VALID_FOR_NEW_DEVELOPMENT
```

This remains true even when the directory appears complete or has a reassuring
name. A non-Git snapshot may be used only for historical comparison, validation
evidence, or forensics until a separately authorized task archives or removes
it.

## 5. Normal Worktree Lifecycle

```text
origin/main
-> clean task worktree
-> task branch
-> implementation
-> tests
-> commit
-> normal push
-> Draft PR
-> review
-> merge
-> post-merge verification
-> reference-only
-> later controlled worktree cleanup
```

Worktrees must not accumulate indefinitely. Periodic cleanup is expected, but
merge does not itself authorize immediate removal. Cleanup follows the
classification and approval model in section 9.

## 6. Terraform State and Operational Artifact Hygiene

Always classify Terraform material into the following categories before acting
on it:

| Category | Meaning |
| --- | --- |
| `TERRAFORM_SOURCE` | Intentionally tracked configuration, modules, backend declarations, provider lock files, tests, scripts, and documentation |
| `REMOTE_TERRAFORM_STATE` | State stored by the verified remote backend configured for a specific Terraform root and environment |
| `LOCAL_TERRAFORM_OPERATIONAL_DATA` | Runtime data such as `.terraform`, provider binaries, downloaded modules, local backend metadata, temporary execution data, and local state files |
| `SAVED_PLAN_EVIDENCE` | A saved binary plan plus the metadata, hash, review, and approval that bind it to one intended apply |

These categories have different lifecycles. Being untracked or ignored does
not make an artifact disposable.

### 6.1 Remote state

When a Terraform root is verified to use a remote backend such as GCS:

```text
REMOTE_BACKEND_STATE=AUTHORITATIVE_TERRAFORM_STATE
```

Files beneath `.terraform` are local operational data and must not be treated
as the authoritative live infrastructure state merely because they contain
backend metadata or cached data. Verify the Terraform root, environment,
backend configuration, workspace selection where applicable, state lineage,
and state serial before drawing state conclusions.

A local state file may still be unique operational evidence, or may belong to
a root that uses a local backend. It must therefore be classified rather than
automatically deleted.

### 6.2 External Terraform runtime data

Application source worktrees are not the preferred storage location for
Terraform runtime data. Where the established workflow and Terraform tooling
support it, set `TF_DATA_DIR` to a task- and root-specific directory outside
the source worktree, for example:

```text
%LOCALAPPDATA%\Moazez\tfdata\<repository>\<task>\<terraform-root>\
```

Do not hardcode a person's username in repository policy or operational
scripts. Do not share one `TF_DATA_DIR` across unrelated roots, environments,
or concurrent tasks unless an approved runbook explicitly requires it.

External storage does not make runtime data disposable. Its ownership,
environment, and lifecycle must still be known.

### 6.3 Saved plans

Saved Terraform plans must be written and retained outside source worktrees
under the governed operational plan hierarchy, for example:

```text
%LOCALAPPDATA%\Moazez\plans\<environment>\<terraform-root>\<execution-id>\
```

Do not use a source directory as the default destination for `.tfplan` files.
Every saved plan must be bound to and governed by:

- its exact absolute path;
- its exact SHA-256 hash;
- the intended repository commit, Terraform root, and environment;
- the state lineage and state serial used to create it;
- explicit review and apply approval;
- a single apply attempt; and
- a consumed lifecycle that prohibits reuse after apply.

If source, variables, backend identity, lineage, serial, approval, or the plan
file changes, the plan is stale and must not be applied. Generate and review a
new plan under a separately authorized Terraform operation. Saved plans may
contain sensitive values and must not be printed or committed.

### 6.4 Preserve unknown Terraform artifacts

Never automatically delete any of the following from a pre-existing
workspace:

- `.terraform` directories;
- `terraform.tfstate` or state backups;
- `*.tfplan` files;
- provider binaries or downloaded modules;
- saved-plan evidence; or
- unknown Terraform-related artifacts.

Required handling is:

```text
UNKNOWN_ARTIFACT
-> PRESERVE
-> INSPECT
-> CLASSIFY
-> ONLY_DELETE_UNDER_AN_EXPLICIT_CLEANUP_TASK
```

Inspection must avoid executing the artifact or exposing sensitive contents.

### 6.5 Never commit runtime artifacts

Normal Terraform operational artifacts must not be committed unless a specific
repository contract explicitly requires a particular file. Intentionally
tracked Terraform source commonly includes `.tf` files and
`.terraform.lock.hcl`; this exception does not extend to provider binaries,
state, saved plans, crash logs, credentials, or temporary runtime data.

Each Terraform source root must maintain appropriate ignore protection for at
least `.terraform`, state files and backups, saved plan files, and Terraform
crash logs. Ignore rules are a guardrail, not permission to delete a matching
artifact. Add or change ignore policy only after inspecting the root and use
the narrowest safe rule.

## 7. Development and DevOps Workspace Separation

```text
SOURCE_DEVELOPMENT_WORKSPACE != DEVOPS_EXECUTION_ARTIFACT_STORAGE
```

Application development worktrees should contain tracked source,
intentionally tracked configuration, and task-specific source edits.
Operational Terraform data, saved plans, temporary deployment logs, and
verifier artifacts should live outside source worktrees wherever practical.

A development agent must not delete, move, or regenerate DevOps artifacts to
obtain a clean Git status. Use this response instead:

```text
DIRTY_PRESERVED_WORKSPACE
-> DO_NOT_USE_FOR_NEW_DEVELOPMENT
-> CREATE_OR_USE_CLEAN_TASK_WORKTREE
```

Operational execution must use a workspace and artifact location explicitly
authorized by its runbook. Source-development authorization alone does not
authorize Terraform initialization, planning, applying, or cloud access.

## 8. Destructive Git and Workspace Command Policy

Against preserved, dirty, or uncertain workspaces, never execute any of the
following automatically:

- `git clean`, including `git clean -fd` and `git clean -fdx`;
- `git reset --hard`;
- `git checkout -- .`;
- `git restore .`;
- recursive deletion of `.terraform`;
- recursive or automatic deletion of untracked files; or
- an equivalent bulk discard, overwrite, or cleanup command.

These operations require explicit, task-specific authorization after a
read-only inventory has classified the exact targets. Authorization to develop,
test, create a worktree, or fix Git status is not cleanup authorization.

Also prohibited:

- force pushes;
- unreviewed rebases;
- unreviewed merges;
- resetting local `main` to an old or remembered SHA; and
- deleting a branch, worktree, snapshot, or artifact because another copy
  appears to exist.

When the current directory, target path, branch, or artifact ownership is
ambiguous, stop rather than guessing.

## 9. Two-Step Workspace Cleanup Model

Every future workspace or worktree cleanup is split into two distinct steps:

```text
STEP_1=READ_ONLY_INVENTORY_AND_CLASSIFICATION
STEP_2=EXPLICITLY_APPROVED_CLEANUP
```

Do not combine inventory and destructive cleanup in the same unreviewed
operation. The approval for step 2 must name the exact classified targets and
allowed action.

Each candidate receives exactly one classification:

- `KEEP_ACTIVE`
- `KEEP_REFERENCE`
- `ARCHIVE`
- `SAFE_TO_REMOVE`
- `DO_NOT_TOUCH`
- `NEEDS_OWNER_REVIEW`

The read-only inventory must record, where applicable:

```text
PATH
TYPE
GIT_OR_NON_GIT
BRANCH
HEAD
UPSTREAM
MERGED_STATUS
DIRTY_STATE
TRACKED_DIFFERENCES
UNTRACKED_FILES
TERRAFORM_ARTIFACTS
CLASSIFICATION
CLASSIFICATION_REASON
```

Only an explicitly approved step 2 may act on a `SAFE_TO_REMOVE` or approved
`ARCHIVE` candidate. `KEEP_ACTIVE`, `KEEP_REFERENCE`, `DO_NOT_TOUCH`, and
`NEEDS_OWNER_REVIEW` are not deletion candidates. A cleanup classification or
approval never overrides immutable-source, evidence-retention, or deletion
rules in another authoritative governance document.

## 10. Windows PowerShell Gateway Rule

Any executable PowerShell gateway supplied to the owner must consist of one
PowerShell code block whose entire executable body is wrapped as follows:

```powershell
& {
    # Entire executable body goes here.
}
```

No executable PowerShell command may appear outside that wrapper, and one
gateway must not be fragmented across multiple executable blocks. Explanatory
prose may appear outside the block, but command output must not be presented as
input to paste back into the shell.

## 11. Secret and Local Environment Safety

Never expose, print, copy into reports, or commit:

- `.env` values;
- tokens or credentials;
- database URLs or connection strings;
- private keys;
- Terraform credential material;
- saved-plan secret payloads; or
- any other secret value.

Workspace inventory may report that a file exists, its general type, its size,
and a hash where safe. Do not read secret files merely to classify them, and do
not include secret content in diffs, logs, commits, pull requests, or cleanup
evidence. Redact sensitive identifiers when a report does not require them.

## 12. Compliance and Scope Boundaries

Before a workspace-affecting task is complete, verify that:

- the chosen source revision came from the latest trusted `origin/main` at task
  start or from another explicitly authorized base;
- the implementation worktree was clean before mutation;
- only the authorized task worktree and intended files changed;
- no preserved workspace or unknown operational artifact was cleaned;
- no Terraform, database, deployment, or cloud mutation occurred unless the
  task explicitly authorized it; and
- any commit, normal push, or Draft PR stays within the reviewed task scope.

Temporary branch names, current SHAs, current folder inventories, release
counts, and one-time operational facts belong in task evidence and closeout
reports, not in this permanent policy.
