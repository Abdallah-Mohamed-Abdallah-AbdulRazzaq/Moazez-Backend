# ADR-0027 Assessment Media provenance and reservations

## Authority

`MOAZEZ-BE-ASSESSMENT-MEDIA-POST-REVIEW-CORRECTIONS-01` authorizes source
corrections in Draft PR #237. ADR-0026 governs technical verification and
historical attestation. ADR-0013 governs retention and deletion authority.

## File provenance

The four Assessment Media upload purposes and the reserved
`assessment-media/` object namespace identify Assessment Files. General
consumer lookups apply the shared File predicate before linking and before
returning attachment metadata or content. Signed download issuance excludes
the reserved namespace. Private media streaming has an explicit Assessment
entry point whose resolver must prove the exact Homework or Grades asset,
including audience and provenance, before delivery. The same boundary applies
to technical and attested records. Earlier general links can be retained while
their metadata and download are withheld at the affected boundaries.

## Capacity

| Limit                       | Unit and scope                                                                                                                                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Active operations           | Per actor in one School. Unexpired CREATED and UPLOADING reserve a slot. VERIFYING reserves one while its intent and verification lease are live. READY, CANCELLED, FAILED and EXPIRED are terminal for slot accounting.                    |
| Provider capability         | Per issued staging key. Its recorded provider deadline describes potential bearer validity. An absent deadline leaves expiry unproven. Capability age and app cancellation carry no deletion authority.                                     |
| Parent retained bytes       | Sum of the declared upload size once per session retaining either stage or final, within its existing purpose and parent context.                                                                                                           |
| School physical reservation | Declared size for each potentially retained stage and final, including terminal attempts and unbound READY Files.                                                                                                                           |
| Active references           | The current School limit applies separately to each Homework question, Grade assessment root, Grade question and Homework or Grade group. Each Student question answer uses the smaller of the School limit and its response configuration. |
| Request rate                | Per actor in one School, based on every admitted reservation within the last hour.                                                                                                                                                          |

The School mutex serializes reservation and rate checks. Existing domain
locks serialize reference limits and the replacement/removal transaction.
Authoring keeps the parent because a permitted stimulus can be reused by
several child resources. A draft replacement releases a logical reference
in the same transaction. Unbound READY Files do not form references.
Earlier claims and links retain their identity and physical reservations.

GCS uses a create-only staging generation precondition. MinIO POST can
write again to its own staging key during capability lifetime. Each intent
owns distinct staging and final keys. A browser capability addresses only
its staging key. The existing claim fence, expiry checks and final readback
prevent a terminal or late result from publishing a second File.

## Recovery

An authorized client retains the original request ID and immutable metadata
before sending Create. An identical retry resolves the original upload ID
and current status. A capable client that already transferred bytes can
complete or query that upload. A client missing the upload capability can
cancel the unresolved session and start another with a new request ID.
For a terminal failure it can start a fresh intent directly. READY returns
the established File. Secrets are issued once on the original response.
The replacement consumes normal rate and retained byte budgets, including
when the original issuance outcome is unknown.

Existing Prisma fields and the applied SQL contracts suffice for this
correction. Scope, claim and evidence protection use the existing schema.
Production remains default-off and requires separate provider and policy
approval. A governed physical cleanup design remains a separate Owner
decision. [DevOps handoff](../docs/assessments/assessment-media-technical-devops-handoff.md)
