# ADR-0026 Assessment Media technical verification

## Authority

MOAZEZ-BE-ASSESSMENT-MEDIA-SIMPLIFICATION-01 authorizes the Backend to release
technically verified Assessment Media and defers DR07. The decision applies
to uploads through Assessment Media's existing four purposes. ADR-0017's
scanner-gated release describes the historical contract. ADRs 0013, 0018 and
0023 continue to govern file lifetime, resource identity and answer claims.

## Decision

Use the existing bounded, purpose-specific upload session and storage provider.
After checking the declared name and MIME, the verifier checks actual size,
content and dimensions or duration where applicable. It hashes the inspected
artifact and verifies the size, MIME, identity and SHA-256 of the server-owned
final object. It then records `assessment-media-technical-v1`. The shared
evidence column holds a closed record of kind `TECHNICAL`, the SHA-256, UTC
verification time and a digest of the provider identity. Successful verification
expresses file conformance. Malware scanning and quarantine remain deferred.

The READY CHECK accepts the technical version only with the corresponding
evidence and MIME facts. The original attested version retains its predicate.
The answer consumption trigger continues to protect exact ancestry, immutable
claims and modality. A File backed by technical evidence has immutable identity
fields. Soft retirement continues to revoke delivery. Authorized reads recheck
the final object identity before delivery and resolve the established resource
permissions before opening the response. Historical evidence continues to use
its existing read and claim rules.

Default-off execution requires the runtime flag and an explicit School policy.
A read-capable actor must still satisfy the existing resource and School
preview/download rules. Managed PDF is attachment-only. Existing content
validation and the provider-native Range and HEAD contracts apply to the
other supported media types. School policy can narrow size, media dimensions
and duration. The original authoring asset rules permit verifying a file in a
parent context and binding it to suitable references within that parent.
Question-bound student uploads continue to carry the exact question intent.

## Implementation and rollout

Expose the previously internal Homework and Core Grades authoring producer on
their existing resource hierarchies. Reuse the existing upload request/status
DTOs, and preserve the existing teacher Grades authoring entitlement. The
Teacher Homework upload surface requires the exact allocation on the assignment
inside the mutation. Existing attachment, answer and grading contracts and IAM
grants are preserved.

The shared verifier reuses bounded temporary-artifact streaming. Technical
completion reads back the final bytes and checks the provider identity around
that read. A 90-second verifier deadline and two local slots bound concurrent
work. A 120-second claim lease lets an authorized status or completion request
settle an abandoned claim after restarts. Retrying a failed attempt requires a
new intent ID. A late result cannot publish the expired claim. Existing
retained-byte accounting and provider capability lifetimes govern retries.

Enablement requires the migrated database and a runtime that can consume both
evidence versions. Production configuration and release are separate actions.
Operational details and the source route audit are in the
[DevOps handoff](../docs/assessments/assessment-media-technical-devops-handoff.md).
