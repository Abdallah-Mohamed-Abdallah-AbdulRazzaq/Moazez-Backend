# Directory Structure Governance Entry Point

`DIRECTORY_STRUCTURE_VISUAL.md` is the detailed canonical visual map for this
repository. Agents must read that visual map when deciding where work belongs.

Current repository structure and approved architecture decision records
override stale historical examples. New top-level directories require
governance review.

Canonical placement boundaries:

- domain modules remain under `src/modules`;
- shared technical infrastructure remains under `src/infrastructure`;
- architecture decision records remain under `adr`;
- production-readiness evidence remains under `docs/production-readiness`.

This concise entry point satisfies the required-reading contract and prevents
path ambiguity without duplicating the full visual tree.
